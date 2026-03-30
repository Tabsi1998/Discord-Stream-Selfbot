import { randomUUID } from "node:crypto";
import { appConfig } from "../config/appConfig.js";
import {
  detectSourceProfile,
  normalizePresetInput,
} from "../domain/presetProfiles.js";
import {
  buildOccurrenceWindows,
  normalizeRecurrenceInput,
} from "../domain/recurrence.js";
import type {
  ChannelDefinition,
  ChannelInput,
  ControlPanelExportPayload,
  ControlPanelState,
  EventInput,
  EventSeriesScope,
  EventStatus,
  FallbackSource,
  ManualRunInput,
  NotificationEventType,
  NotificationRuleSet,
  NotificationSettings,
  NotificationSettingsInput,
  QueueConfig,
  QueueConflictPolicy,
  QueueItem,
  RecurrenceRule,
  PresetInput,
  ScheduledEvent,
  StreamPreset,
} from "../domain/types.js";
import { isYouTubeUrl } from "../runtime/SourceResolver.js";
import type {
  PerformanceWarningInfo,
  StreamRuntime,
  RunEndedInfo,
  RunFailedInfo,
} from "../runtime/StreamRuntime.js";
import type { AppStateStore } from "../state/AppStateStore.js";

function nowIso() {
  return new Date().toISOString();
}

function asDate(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date`);
  }
  return parsed;
}

function assertNonEmpty(value: string, fieldName: string) {
  if (!value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
}

function assertPositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function normalizeWebhookUrl(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("webhookUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("webhookUrl must use http or https");
  }

  return parsed.toString();
}

function createDefaultNotificationRules(): NotificationRuleSet {
  return {
    manualRuns: true,
    scheduledEvents: true,
    queueLifecycle: true,
    queueItems: false,
    failures: true,
    performanceWarnings: true,
  };
}

function mergeNotificationRules(
  input?: Partial<NotificationRuleSet>,
  fallback?: NotificationRuleSet,
): NotificationRuleSet {
  const base = fallback ?? createDefaultNotificationRules();
  return {
    manualRuns:
      typeof input?.manualRuns === "boolean"
        ? input.manualRuns
        : base.manualRuns,
    scheduledEvents:
      typeof input?.scheduledEvents === "boolean"
        ? input.scheduledEvents
        : base.scheduledEvents,
    queueLifecycle:
      typeof input?.queueLifecycle === "boolean"
        ? input.queueLifecycle
        : base.queueLifecycle,
    queueItems:
      typeof input?.queueItems === "boolean"
        ? input.queueItems
        : base.queueItems,
    failures:
      typeof input?.failures === "boolean" ? input.failures : base.failures,
    performanceWarnings:
      typeof input?.performanceWarnings === "boolean"
        ? input.performanceWarnings
        : base.performanceWarnings,
  };
}

function blocksScheduling(status: EventStatus) {
  return status === "scheduled" || status === "running";
}

function sortChannels(channels: ChannelDefinition[]) {
  channels.sort((a, b) => a.name.localeCompare(b.name));
}

function sortPresets(presets: StreamPreset[]) {
  presets.sort((a, b) => a.name.localeCompare(b.name));
}

function sortEvents(events: ScheduledEvent[]) {
  events.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

function describeEventSource(preset: StreamPreset | undefined) {
  if (!preset) {
    return undefined;
  }
  if (preset.sourceMode === "yt-dlp" || isYouTubeUrl(preset.sourceUrl)) {
    return "YouTube / yt-dlp";
  }

  const sourceProfile = detectSourceProfile(preset.sourceMode, preset.sourceUrl);
  switch (sourceProfile) {
    case "hls":
      return "HLS / Live-Stream";
    case "mpeg-ts":
      return "MPEG-TS / IPTV";
    case "file":
      return "Datei / Direktlink";
    default:
      return "Direktlink";
  }
}

function buildDiscordEventDescription(
  event: ScheduledEvent,
  channel: ChannelDefinition,
  preset: StreamPreset | undefined,
) {
  const description = event.description?.trim() || "";

  return [
    description,
    ...(description ? [""] : []),
    `Kanal: ${channel.name}`,
    preset ? `Preset: ${preset.name}` : "",
    preset ? `Quelle: ${describeEventSource(preset)}` : "",
    preset
      ? `Qualitaet: ${preset.width}x${preset.height} @ ${preset.fps} FPS`
      : "",
    event.seriesId ? `Serie: Folge ${event.occurrenceIndex}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildAdHocPresetName(
  sourceUrl: string,
  sourceMode: "direct" | "yt-dlp",
) {
  if (sourceMode === "yt-dlp" || isYouTubeUrl(sourceUrl)) {
    return "Quick Play YouTube";
  }
  try {
    const url = new URL(sourceUrl);
    return `Quick Play ${url.hostname}`;
  } catch {
    return "Quick Play";
  }
}

function createDefaultQueueConfig(): QueueConfig {
  return {
    active: false,
    loop: false,
    currentIndex: 0,
    conflictPolicy: "queue-first",
  };
}

function isFallbackSourceLike(value: unknown): value is Partial<FallbackSource> {
  return !!value && typeof value === "object";
}

function normalizeLegacyFallbackUrls(
  input: unknown,
  sourceMode: "direct" | "yt-dlp",
): FallbackSource[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }
    const url = entry.trim();
    return url
      ? [
          {
            url,
            sourceMode,
          },
        ]
      : [];
  });
}

type EventPlan = {
  recurrence: RecurrenceRule;
  events: ScheduledEvent[];
  seriesId?: string;
};

type EventMutationResult = {
  updatedCount: number;
  events: ScheduledEvent[];
  scope: EventSeriesScope;
};

export class ControlPanelService {
  private queueAdvancing = false;

  constructor(
    private readonly store: AppStateStore,
    private readonly runtime: StreamRuntime,
  ) {
    this.runtime.on("runEnded", (info: RunEndedInfo) => {
      this.onRunEnded(info);
      this.onQueueRunEnded(info);
    });
    this.runtime.on("runFailed", (info: RunFailedInfo) => {
      this.onRunFailed(info);
      this.onQueueRunFailed(info);
    });
    this.runtime.on("performanceWarning", (info: PerformanceWarningInfo) => {
      this.onPerformanceWarning(info);
    });
  }

  public snapshot(): ControlPanelState {
    return this.store.snapshot();
  }

  public subscribeState(listener: (state: ControlPanelState) => void) {
    return this.store.subscribe(listener);
  }

  public appendLog(
    level: "info" | "warn" | "error",
    message: string,
    context?: Record<string, string>,
  ) {
    this.store.appendLog(level, message, context);
  }

  public async listVoiceChannels(forceRefresh = false, botId?: string) {
    return this.runtime.listVoiceChannels(forceRefresh, botId);
  }

  public initializeNotificationSettings(defaults: NotificationSettingsInput) {
    const state = this.store.snapshot();
    if (state.notificationSettings.updatedAt) {
      return state.notificationSettings;
    }

    const settings = this.resolveNotificationSettings(defaults);
    this.store.update((draft) => {
      draft.notificationSettings = settings;
    });
    return settings;
  }

  public getNotificationSettings() {
    return this.resolveNotificationSettings(undefined, undefined, false);
  }

  public updateNotificationSettings(input: NotificationSettingsInput) {
    const current = this.resolveNotificationSettings();
    const settings = this.resolveNotificationSettings(input, current);
    this.store.update((draft) => {
      draft.notificationSettings = settings;
    });
    this.store.appendLog(
      "info",
      "Benachrichtigungseinstellungen aktualisiert",
      {
        webhook: settings.webhookUrl ? "configured" : "disabled",
        dmEnabled: settings.dmEnabled ? "1" : "0",
        activeRules: String(Object.values(settings.rules).filter(Boolean).length),
      },
    );
    return settings;
  }

  public async testNotificationSettings(
    input?: NotificationSettingsInput,
    botId?: string,
  ) {
    const settings = input
      ? this.resolveNotificationSettings(
          input,
          this.resolveNotificationSettings(),
        )
      : this.resolveNotificationSettings();
    if (!settings.webhookUrl && !settings.dmEnabled) {
      throw new Error(
        "Activate webhook or DM notifications before sending a test",
      );
    }
    await this.sendNotification(
      "Test-Benachrichtigung vom Stream Bot",
      "manualRuns",
      botId,
      settings,
    );
    return settings;
  }

  public exportConfiguration(): ControlPanelExportPayload {
    const snapshot = this.store.snapshot();
    return {
      version: 1,
      exportedAt: nowIso(),
      data: {
        channels: structuredClone(snapshot.channels),
        presets: structuredClone(snapshot.presets),
        events: structuredClone(snapshot.events),
        queue: structuredClone(snapshot.queue),
        queueConfig: {
          ...snapshot.queueConfig,
          active: false,
          pausedByEvent: false,
          pausedEventId: undefined,
          pausedAt: undefined,
        },
        notificationSettings: this.getNotificationSettings(),
      },
    };
  }

  public importConfiguration(input: unknown) {
    if (this.runtime.getActiveRuns().length > 0) {
      throw new Error(
        "Stop all active streams before importing a configuration",
      );
    }
    if (this.store.snapshot().queueConfig.active) {
      throw new Error("Stop the queue before importing a configuration");
    }

    const payload = this.parseImportPayload(input);
    const imported = this.normalizeImportedConfiguration(payload.data);

    this.store.update((draft) => {
      draft.channels = imported.channels;
      draft.presets = imported.presets;
      draft.events = imported.events;
      draft.queue = imported.queue;
      draft.queueConfig = imported.queueConfig;
      draft.notificationSettings = imported.notificationSettings;
    });

    this.store.appendLog("info", "Konfiguration importiert", {
      channels: String(imported.channels.length),
      presets: String(imported.presets.length),
      events: String(imported.events.length),
      queue: String(imported.queue.length),
    });

    return {
      importedAt: nowIso(),
      counts: {
        channels: imported.channels.length,
        presets: imported.presets.length,
        events: imported.events.length,
        queue: imported.queue.length,
      },
    };
  }

  public reconcileStateOnStartup() {
    const now = Date.now();
    const runtime = this.store.snapshot().runtime;
    const recoveredQueue = this.store.snapshot().queueConfig.active;
    const recoveredRuns =
      Array.isArray(runtime.activeRuns) && runtime.activeRuns.length
        ? runtime.activeRuns
        : runtime.activeRun
          ? [runtime.activeRun]
          : [];

    this.store.update((draft) => {
      if (
        draft.runtime.activeRun ||
        draft.runtime.activeRuns?.length ||
        draft.runtime.telemetry ||
        Object.keys(draft.runtime.telemetryByBot ?? {}).length ||
        draft.runtime.selectedVideoEncoder ||
        Object.keys(draft.runtime.selectedVideoEncodersByBot ?? {}).length
      ) {
        draft.runtime.activeRun = undefined;
        draft.runtime.activeRuns = [];
        draft.runtime.telemetry = undefined;
        draft.runtime.telemetryByBot = {};
        draft.runtime.selectedVideoEncoder = undefined;
        draft.runtime.selectedVideoEncodersByBot = {};
        draft.runtime.lastEndedAt = nowIso();
      }

      if (draft.queueConfig.active) {
        draft.queueConfig.active = false;
        draft.queueConfig.pausedByEvent = false;
        draft.queueConfig.pausedEventId = undefined;
        draft.queueConfig.pausedAt = undefined;
        for (const item of draft.queue) {
          if (item.status === "playing") {
            item.status = "pending";
          }
        }
      }

      for (const event of draft.events) {
        if (event.status !== "running") continue;
        if (Date.parse(event.endAt) <= now) {
          event.status = "completed";
          event.actualEndedAt ??= nowIso();
        } else {
          event.status = "scheduled";
          event.lastError = "Recovered after controller restart";
        }
        event.updatedAt = nowIso();
      }

      sortEvents(draft.events);
    });

    if (recoveredRuns.length) {
      this.store.appendLog(
        "warn",
        "Recovered stale active runs after restart",
        {
          count: String(recoveredRuns.length),
          bots: recoveredRuns.map((run) => run.botId).join(", "),
        },
      );
    }
    if (recoveredQueue) {
      this.store.appendLog("warn", "Recovered active queue after restart", {
        action: "queue-stopped",
      });
    }
  }

  public markMissedEvents(referenceDate = new Date()) {
    const now = referenceDate.getTime();
    this.store.update((draft) => {
      for (const event of draft.events) {
        if (event.status !== "scheduled") continue;
        if (Date.parse(event.endAt) > now) continue;
        event.status = "failed";
        event.lastError =
          "Schedule window elapsed before the event could start";
        event.actualEndedAt = nowIso();
        event.updatedAt = nowIso();
      }
    });
  }

  public createChannel(input: ChannelInput) {
    const botId = input.botId?.trim() || this.runtime.getPrimaryBotId();
    assertNonEmpty(input.name, "name");
    assertNonEmpty(input.guildId, "guildId");
    assertNonEmpty(input.channelId, "channelId");
    if (!this.runtime.hasBot(botId)) {
      throw new Error("Configured selfbot was not found");
    }

    const timestamp = nowIso();
    const channel: ChannelDefinition = {
      id: randomUUID(),
      botId,
      name: input.name.trim(),
      guildId: input.guildId.trim(),
      channelId: input.channelId.trim(),
      streamMode: input.streamMode,
      description: input.description?.trim() ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.store.update((draft) => {
      const duplicate = draft.channels.find(
        (entry) =>
          entry.botId === channel.botId &&
          entry.guildId === channel.guildId &&
          entry.channelId === channel.channelId,
      );
      if (duplicate) {
        throw new Error("This Discord voice channel is already configured");
      }
      draft.channels.push(channel);
      sortChannels(draft.channels);
    });

    return channel;
  }

  public updateChannel(id: string, input: ChannelInput) {
    const botId = input.botId?.trim() || this.runtime.getPrimaryBotId();
    assertNonEmpty(input.name, "name");
    assertNonEmpty(input.guildId, "guildId");
    assertNonEmpty(input.channelId, "channelId");
    if (!this.runtime.hasBot(botId)) {
      throw new Error("Configured selfbot was not found");
    }

    const updatedAt = nowIso();
    let updated: ChannelDefinition | undefined;

    this.store.update((draft) => {
      const channel = this.requireChannelFromDraft(draft, id);
      const duplicate = draft.channels.find(
        (entry) =>
          entry.id !== id &&
          entry.botId === botId &&
          entry.guildId === input.guildId.trim() &&
          entry.channelId === input.channelId.trim(),
      );
      if (duplicate) {
        throw new Error("This Discord voice channel is already configured");
      }

      channel.name = input.name.trim();
      channel.botId = botId;
      channel.guildId = input.guildId.trim();
      channel.channelId = input.channelId.trim();
      channel.streamMode = input.streamMode;
      channel.description = input.description?.trim() ?? "";
      channel.updatedAt = updatedAt;
      updated = { ...channel };
      sortChannels(draft.channels);
    });

    return updated;
  }

  public deleteChannel(id: string) {
    this.store.update((draft) => {
      if (draft.runtime.activeRuns?.some((run) => run.channelId === id)) {
        throw new Error("Cannot delete a channel while it is active");
      }
      if (draft.events.some((event) => event.channelId === id)) {
        throw new Error("Cannot delete a channel that is used by events");
      }
      const before = draft.channels.length;
      draft.channels = draft.channels.filter((channel) => channel.id !== id);
      if (draft.channels.length === before) {
        throw new Error("Channel not found");
      }
    });
  }

  public createPreset(input: PresetInput) {
    const normalizedInput = normalizePresetInput(input);
    this.validatePresetInput(normalizedInput);

    const timestamp = nowIso();
    const preset: StreamPreset = {
      id: randomUUID(),
      name: normalizedInput.name.trim(),
      sourceUrl: normalizedInput.sourceUrl.trim(),
      sourceMode: normalizedInput.sourceMode,
      fallbackSources: normalizedInput.fallbackSources.map((source) => ({
        url: source.url.trim(),
        sourceMode: source.sourceMode,
      })),
      qualityProfile: normalizedInput.qualityProfile,
      bufferProfile: normalizedInput.bufferProfile,
      description: normalizedInput.description?.trim() ?? "",
      includeAudio: normalizedInput.includeAudio,
      width: normalizedInput.width,
      height: normalizedInput.height,
      fps: normalizedInput.fps,
      bitrateVideoKbps: normalizedInput.bitrateVideoKbps,
      maxBitrateVideoKbps: normalizedInput.maxBitrateVideoKbps,
      bitrateAudioKbps: normalizedInput.bitrateAudioKbps,
      videoCodec: normalizedInput.videoCodec,
      hardwareAcceleration: normalizedInput.hardwareAcceleration,
      minimizeLatency: normalizedInput.minimizeLatency,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.store.update((draft) => {
      draft.presets.push(preset);
      sortPresets(draft.presets);
    });

    return preset;
  }

  public updatePreset(id: string, input: PresetInput) {
    const normalizedInput = normalizePresetInput(input);
    this.validatePresetInput(normalizedInput);

    const updatedAt = nowIso();
    let updated: StreamPreset | undefined;

    this.store.update((draft) => {
      if (draft.runtime.activeRuns?.some((run) => run.presetId === id)) {
        throw new Error("Cannot edit a preset while it is active");
      }

      const preset = this.requirePresetFromDraft(draft, id);
      preset.name = normalizedInput.name.trim();
      preset.sourceUrl = normalizedInput.sourceUrl.trim();
      preset.sourceMode = normalizedInput.sourceMode;
      preset.fallbackSources = normalizedInput.fallbackSources.map((source) => ({
        url: source.url.trim(),
        sourceMode: source.sourceMode,
      }));
      preset.qualityProfile = normalizedInput.qualityProfile;
      preset.bufferProfile = normalizedInput.bufferProfile;
      preset.description = normalizedInput.description?.trim() ?? "";
      preset.includeAudio = normalizedInput.includeAudio;
      preset.width = normalizedInput.width;
      preset.height = normalizedInput.height;
      preset.fps = normalizedInput.fps;
      preset.bitrateVideoKbps = normalizedInput.bitrateVideoKbps;
      preset.maxBitrateVideoKbps = normalizedInput.maxBitrateVideoKbps;
      preset.bitrateAudioKbps = normalizedInput.bitrateAudioKbps;
      preset.videoCodec = normalizedInput.videoCodec;
      preset.hardwareAcceleration = normalizedInput.hardwareAcceleration;
      preset.minimizeLatency = normalizedInput.minimizeLatency;
      preset.updatedAt = updatedAt;
      updated = { ...preset };
      sortPresets(draft.presets);
    });

    return updated;
  }

  public deletePreset(id: string) {
    this.store.update((draft) => {
      if (draft.runtime.activeRuns?.some((run) => run.presetId === id)) {
        throw new Error("Cannot delete a preset while it is active");
      }
      if (draft.events.some((event) => event.presetId === id)) {
        throw new Error("Cannot delete a preset that is used by events");
      }
      const before = draft.presets.length;
      draft.presets = draft.presets.filter((preset) => preset.id !== id);
      if (draft.presets.length === before) {
        throw new Error("Preset not found");
      }
    });
  }

  public createEvent(input: EventInput) {
    const timestamp = nowIso();
    const plan = this.planEvents(input, timestamp);

    this.store.update((draft) => {
      this.requireChannelFromDraft(draft, input.channelId);
      this.requirePresetFromDraft(draft, input.presetId);
      this.assertNoOverlap(draft, draft.events, plan.events);
      draft.events.push(...plan.events);
      sortEvents(draft.events);
    });

    // Sync to Discord in background (non-blocking)
    this.syncEventsToDiscord(plan.events, input.channelId).catch(() => {});

    return {
      createdCount: plan.events.length,
      events: plan.events,
      seriesId: plan.seriesId,
    };
  }

  public updateEvent(
    id: string,
    input: EventInput,
    scope: EventSeriesScope = "this-and-following",
  ): EventMutationResult {
    const timestamp = nowIso();
    let updated: EventMutationResult | undefined;
    let oldDiscordEventIds: string[] = [];
    let guildId: string | undefined;
    let botId = this.runtime.getPrimaryBotId();

    this.store.update((draft) => {
      const target = this.requireEventFromDraft(draft, id);
      if (target.status === "running") {
        throw new Error("Cannot edit a running event");
      }

      this.requireChannelFromDraft(draft, input.channelId);
      this.requirePresetFromDraft(draft, input.presetId);

      const channel = draft.channels.find((c) => c.id === input.channelId);
      guildId = channel?.guildId;
      botId = channel?.botId ?? botId;
      const effectiveScope = this.resolveEventSeriesScope(target, scope);
      const occurrenceOffset =
        effectiveScope === "this-and-following" ? target.occurrenceIndex : 1;
      const plannedInput =
        effectiveScope === "single" && target.seriesId
          ? {
              ...input,
              recurrence: { kind: "once" as const },
            }
          : input;

      const replacement = this.planEvents(
        plannedInput,
        timestamp,
        effectiveScope === "single" ? undefined : target.seriesId,
        occurrenceOffset,
      ).events;

      const replaceIds = this.collectReplaceIds(
        draft.events,
        target,
        effectiveScope,
      );

      // Collect old Discord event IDs for cleanup
      oldDiscordEventIds = draft.events
        .filter((e) => replaceIds.has(e.id) && e.discordEventId)
        .map((e) => e.discordEventId!);

      const retained = draft.events.filter(
        (event) => !replaceIds.has(event.id),
      );

      this.assertNoOverlap(draft, retained, replacement);

      draft.events = [...retained, ...replacement];
      sortEvents(draft.events);
      updated = {
        updatedCount: replacement.length,
        events: replacement,
        scope: effectiveScope,
      };
    });

    // Sync to Discord: delete old events and create new ones
    if (guildId && oldDiscordEventIds.length > 0) {
      this.deleteDiscordEvents(botId, guildId, oldDiscordEventIds).catch(
        () => {},
      );
    }
    if (updated) {
      this.syncEventsToDiscord(updated.events, input.channelId).catch(() => {});
    }

    return updated!;
  }

  public deleteEvent(id: string, scope: EventSeriesScope = "single") {
    let discordEventIds: string[] = [];
    let guildId: string | undefined;
    let botId = this.runtime.getPrimaryBotId();
    this.store.update((draft) => {
      const event = this.requireEventFromDraft(draft, id);
      if (event.status === "running") {
        throw new Error("Cannot delete a running event");
      }

      const replaceIds = this.collectReplaceIds(
        draft.events,
        event,
        this.resolveEventSeriesScope(event, scope),
      );
      discordEventIds = draft.events
        .filter((e) => replaceIds.has(e.id) && e.discordEventId)
        .map((e) => e.discordEventId!);
      const channel = draft.channels.find((c) => c.id === event.channelId);
      guildId = channel?.guildId;
      botId = channel?.botId ?? botId;

      const before = draft.events.length;
      draft.events = draft.events.filter((entry) => !replaceIds.has(entry.id));
      if (draft.events.length === before) {
        throw new Error("Event not found");
      }

      // Delete Discord events in background
    });
    if (guildId && discordEventIds.length > 0) {
      this.deleteDiscordEvents(botId, guildId, discordEventIds).catch(() => {});
    }
  }

  public async cancelEvent(id: string) {
    const state = this.store.snapshot();
    const event = this.requireEventFromSnapshot(state, id);
    const channel = this.requireChannelFromSnapshot(state, event.channelId);

    if (event.status === "running") {
      const stopped = this.runtime.stopActive("event-cancelled", channel.botId);
      if (!stopped) {
        throw new Error("The running event could not be stopped");
      }
      return;
    }

    // Cancel Discord scheduled event
    if (event.discordEventId) {
      this.deleteDiscordEvents(channel.botId, channel.guildId, [
        event.discordEventId,
      ]).catch(() => {});
    }

    this.store.update((draft) => {
      const current = this.requireEventFromDraft(draft, id);
      current.status = "canceled";
      current.actualEndedAt = nowIso();
      current.updatedAt = nowIso();
    });
  }

  public async startScheduledEvent(id: string) {
    const state = this.store.snapshot();
    const event = this.requireEventFromSnapshot(state, id);

    if (event.status !== "scheduled") {
      throw new Error("Only scheduled events can be started");
    }

    const endAt = asDate(event.endAt, "endAt");
    if (endAt.getTime() <= Date.now()) {
      throw new Error("Event end time is already in the past");
    }

    const channel = this.requireChannelFromSnapshot(state, event.channelId);
    const preset = this.requirePresetFromSnapshot(state, event.presetId);
    const queueOwnsBot =
      state.queueConfig.active &&
      state.queueConfig.botId === channel.botId &&
      !state.queueConfig.pausedByEvent;
    const canPreemptQueue =
      queueOwnsBot && state.queueConfig.conflictPolicy === "event-first";
    const preemptedQueue = canPreemptQueue
      ? this.preemptQueueForScheduledEvent(channel.botId, id)
      : false;

    if (queueOwnsBot && !canPreemptQueue) {
      throw new Error("Queue currently reserves this selfbot");
    }
    if (this.hasActiveRun(channel.botId)) {
      if (preemptedQueue) {
        throw new Error("Queue run is stopping for scheduled event");
      }
      throw new Error("Selected selfbot is already streaming");
    }

    this.store.update((draft) => {
      const current = this.requireEventFromDraft(draft, id);
      current.status = "running";
      current.actualStartedAt = nowIso();
      current.lastError = undefined;
      current.updatedAt = nowIso();
    });

    // Set Discord event to Active
    if (event.discordEventId) {
      this.setDiscordEventActive(
        channel.botId,
        channel.guildId,
        event.discordEventId,
      ).catch(() => {});
    }

    try {
      await this.runtime.startRun({
        kind: "event",
        eventId: id,
        channel,
        preset,
        plannedStopAt: event.endAt,
      });
      this.sendNotification(
        `Event gestartet: ${event.name} in ${channel.name}`,
        "scheduledEvents",
        channel.botId,
      ).catch(() => {});
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to start event";
      this.failEvent(id, message);
      if (preemptedQueue) {
        this.resumeQueueAfterScheduledEvent(channel.botId, id);
      }
      throw error;
    }
  }

  public async startManualRun(input: ManualRunInput) {
    assertNonEmpty(input.channelId, "channelId");
    assertNonEmpty(input.presetId, "presetId");

    const state = this.store.snapshot();
    const channel = this.requireChannelFromSnapshot(state, input.channelId);
    const preset = this.requirePresetFromSnapshot(state, input.presetId);
    const plannedStopAt = input.stopAt
      ? asDate(input.stopAt, "stopAt").toISOString()
      : undefined;

    if (plannedStopAt && Date.parse(plannedStopAt) <= Date.now()) {
      throw new Error("stopAt must be in the future");
    }

    return this.runtime
      .startRun({
        kind: "manual",
        channel,
        preset,
        plannedStopAt,
      })
      .then((result) => {
        this.sendNotification(
          `Stream gestartet: ${channel.name} mit ${preset.name}`,
          "manualRuns",
          channel.botId,
        ).catch(() => {});
        return result;
      });
  }

  public async startAdHocRun(input: {
    channel: ChannelDefinition;
    sourceUrl: string;
    sourceMode?: "direct" | "yt-dlp";
    stopAt?: string;
    name?: string;
  }) {
    assertNonEmpty(input.channel.id, "channel.id");
    assertNonEmpty(input.channel.botId, "channel.botId");
    assertNonEmpty(input.channel.guildId, "channel.guildId");
    assertNonEmpty(input.channel.channelId, "channel.channelId");
    assertNonEmpty(input.sourceUrl, "sourceUrl");

    const sourceMode =
      input.sourceMode ?? (isYouTubeUrl(input.sourceUrl) ? "yt-dlp" : "direct");
    const normalizedPreset = normalizePresetInput({
      name:
        input.name?.trim() || buildAdHocPresetName(input.sourceUrl, sourceMode),
      sourceUrl: input.sourceUrl.trim(),
      sourceMode,
      fallbackSources: [],
      qualityProfile: "1080p30",
      bufferProfile: sourceMode === "yt-dlp" ? "stable" : "auto",
      description: "Temporaeres Command-Preset",
      includeAudio: true,
      width: 1920,
      height: 1080,
      fps: 30,
      bitrateVideoKbps: 7000,
      maxBitrateVideoKbps: 9500,
      bitrateAudioKbps: 160,
      videoCodec: "H264",
      hardwareAcceleration: true,
      minimizeLatency: false,
    });
    const timestamp = nowIso();
    const preset: StreamPreset = {
      id: `adhoc-preset-${randomUUID()}`,
      ...normalizedPreset,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const plannedStopAt = input.stopAt
      ? asDate(input.stopAt, "stopAt").toISOString()
      : undefined;

    if (plannedStopAt && Date.parse(plannedStopAt) <= Date.now()) {
      throw new Error("stopAt must be in the future");
    }

    return this.runtime
      .startRun({
        kind: "manual",
        channel: input.channel,
        preset,
        plannedStopAt,
      })
      .then((result) => {
        this.sendNotification(
          `Stream gestartet: ${input.channel.name} mit ${preset.name}`,
          "manualRuns",
          input.channel.botId,
        ).catch(() => {});
        return result;
      });
  }

  public stopActive(reason = "manual-stop") {
    return this.stopActiveForBot(reason);
  }

  public stopActiveForBot(reason = "manual-stop", botId?: string) {
    const run = this.runtime.getActiveRun(botId);
    const stopped = this.runtime.stopActive(reason, botId);
    if (stopped && run && reason !== "queue-preempted-for-event") {
      this.sendNotification(
        `Stream gestoppt: ${run.channelName}`,
        "manualRuns",
        run.botId,
      ).catch(() => {});
    }
    return stopped;
  }

  public stopAllActive(reason = "manual-stop") {
    const runs = this.runtime.getActiveRuns();
    const stoppedCount = this.runtime.stopAllActive(reason);
    if (stoppedCount > 0) {
      this.sendNotification(
        stoppedCount === 1
          ? `Stream gestoppt: ${runs[0]?.channelName ?? "unbekannt"}`
          : `${stoppedCount} Streams werden gestoppt`,
        "manualRuns",
      ).catch(() => {});
    }
    return stoppedCount;
  }

  public hasActiveRun(botId?: string) {
    return botId
      ? !!this.runtime.getActiveRun(botId)
      : this.runtime.getActiveRuns().length > 0;
  }

  private onRunEnded(info: RunEndedInfo) {
    if (info.run.kind !== "event" || !info.run.eventId) return;

    let shouldMarkCompleted = false;
    let discordEventId: string | undefined;
    let channelId: string | undefined;
    let notificationMessage: string | undefined;

    this.store.update((draft) => {
      const event = this.requireEventFromDraft(draft, info.run.eventId!);
      event.updatedAt = nowIso();
      event.actualEndedAt = nowIso();

      if (
        info.reason === "aborted" &&
        (info.abortReason === "event-cancelled" ||
          info.abortReason === "manual-stop")
      ) {
        event.status = "canceled";
        notificationMessage = `Event abgebrochen: ${event.name}`;
      } else {
        event.status = "completed";
        notificationMessage = `Event abgeschlossen: ${event.name}`;
        if (event.discordEventId) {
          shouldMarkCompleted = true;
          discordEventId = event.discordEventId;
          channelId = event.channelId;
        }
      }
    });

    // Set Discord scheduled event status to COMPLETED
    if (shouldMarkCompleted && discordEventId && channelId) {
      const state = this.store.snapshot();
      const channel = state.channels.find((c) => c.id === channelId);
      if (channel) {
        this.setDiscordEventCompleted(
          channel.botId,
          channel.guildId,
          discordEventId,
        ).catch(() => {});
      }
    }

    if (notificationMessage) {
      this.sendNotification(
        notificationMessage,
        "scheduledEvents",
        info.run.botId,
      ).catch(() => {});
    }

    this.resumeQueueAfterScheduledEvent(info.run.botId, info.run.eventId);
  }

  private onRunFailed(info: RunFailedInfo) {
    if (info.run.kind !== "event" || !info.run.eventId) {
      this.sendNotification(
        `Stream fehlgeschlagen: ${info.run.channelName} | ${info.error}`,
        "failures",
        info.run.botId,
      ).catch(() => {});
      return;
    }
    this.failEvent(info.run.eventId, info.error);
    this.sendNotification(
      `Event fehlgeschlagen: ${info.run.channelName} | ${info.error}`,
      "failures",
      info.run.botId,
    ).catch(() => {});
    this.resumeQueueAfterScheduledEvent(info.run.botId, info.run.eventId);
  }

  private onPerformanceWarning(info: PerformanceWarningInfo) {
    const detail =
      info.kind === "lag"
        ? `Speed ${info.speed ?? "?"} | FPS ${info.fps ?? "?"}`
        : `Dropped Frames ${info.dropFrames ?? "?"}`;
    this.sendNotification(
      `Performance-Warnung: ${info.run.channelName} | ${detail}`,
      "performanceWarnings",
      info.run.botId,
    ).catch(() => {});
  }

  private failEvent(id: string, error: string) {
    this.store.update((draft) => {
      const event = this.requireEventFromDraft(draft, id);
      event.status = "failed";
      event.actualEndedAt = nowIso();
      event.updatedAt = nowIso();
      event.lastError = error;
    });
  }

  private validatePresetInput(input: PresetInput) {
    assertNonEmpty(input.name, "name");
    assertPositiveInteger(input.width, "width");
    assertPositiveInteger(input.height, "height");
    assertPositiveInteger(input.fps, "fps");
    assertPositiveInteger(input.bitrateVideoKbps, "bitrateVideoKbps");
    assertPositiveInteger(input.maxBitrateVideoKbps, "maxBitrateVideoKbps");
    assertPositiveInteger(input.bitrateAudioKbps, "bitrateAudioKbps");

    if (input.maxBitrateVideoKbps < input.bitrateVideoKbps) {
      throw new Error("maxBitrateVideoKbps must be >= bitrateVideoKbps");
    }

    this.validatePresetSource(
      {
        url: input.sourceUrl,
        sourceMode: input.sourceMode,
      },
      "sourceUrl",
    );

    for (const [index, fallbackSource] of input.fallbackSources.entries()) {
      this.validatePresetSource(
        fallbackSource,
        `fallbackSources[${index}].url`,
      );
    }
  }

  private validatePresetSource(source: FallbackSource, fieldName: string) {
    assertNonEmpty(source.url, fieldName);

    if (source.sourceMode === "direct" && isYouTubeUrl(source.url)) {
      throw new Error(`YouTube URLs require source mode 'yt-dlp' (${fieldName})`);
    }

    if (source.sourceMode === "yt-dlp" && !appConfig.ytDlpPath) {
      throw new Error(
        `yt-dlp source mode requires a detected yt-dlp binary (${fieldName})`,
      );
    }
  }

  private planEvents(
    input: EventInput,
    timestamp: string,
    seriesId?: string,
    occurrenceOffset = 1,
  ): EventPlan {
    assertNonEmpty(input.name, "name");
    assertNonEmpty(input.channelId, "channelId");
    assertNonEmpty(input.presetId, "presetId");

    const startAt = asDate(input.startAt, "startAt");
    const endAt = asDate(input.endAt, "endAt");
    if (endAt <= startAt) {
      throw new Error("endAt must be after startAt");
    }

    const recurrence = normalizeRecurrenceInput(
      input.recurrence,
      input.startAt,
    );
    const effectiveSeriesId =
      recurrence.kind === "once" ? undefined : (seriesId ?? randomUUID());
    const windows = buildOccurrenceWindows(
      startAt.toISOString(),
      endAt.toISOString(),
      recurrence,
    );

    return {
      recurrence,
      seriesId: effectiveSeriesId,
      events: windows.map((window) => ({
        id: randomUUID(),
        name: input.name.trim(),
        channelId: input.channelId,
        presetId: input.presetId,
        startAt: window.startAt,
        endAt: window.endAt,
        status: "scheduled",
        description: input.description?.trim() ?? "",
        recurrence,
        seriesId: effectiveSeriesId,
        occurrenceIndex: occurrenceOffset + window.occurrenceIndex - 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    };
  }

  private resolveEventSeriesScope(
    target: ScheduledEvent,
    scope: EventSeriesScope,
  ): EventSeriesScope {
    if (!target.seriesId) {
      return "single";
    }
    return scope;
  }

  private collectReplaceIds(
    events: ScheduledEvent[],
    target: ScheduledEvent,
    scope: EventSeriesScope,
  ) {
    const effectiveScope = this.resolveEventSeriesScope(target, scope);
    if (effectiveScope === "single") {
      return new Set([target.id]);
    }

    const targetStart = Date.parse(target.startAt);
    const related = events.filter(
      (event) => event.seriesId === target.seriesId,
    );

    if (related.some((event) => event.status === "running")) {
      throw new Error(
        "Cannot edit or delete a series while one occurrence is running",
      );
    }

    if (effectiveScope === "all") {
      return new Set(related.map((event) => event.id));
    }

    return new Set(
      related
        .filter((event) => Date.parse(event.startAt) >= targetStart)
        .map((event) => event.id),
    );
  }

  private assertNoOverlap(
    state: Pick<ControlPanelState, "channels">,
    existingEvents: ScheduledEvent[],
    candidateEvents: ScheduledEvent[],
  ) {
    const candidates = [...candidateEvents].sort(
      (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
    );
    const blocking = existingEvents.filter((event) =>
      blocksScheduling(event.status),
    );

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const candidateBotId = this.resolveEventBotId(state, candidate);
      const overlap = blocking.find(
        (event) =>
          this.resolveEventBotId(state, event) === candidateBotId &&
          this.eventsOverlap(candidate, event),
      );
      if (overlap) {
        throw new Error(
          `Event overlaps with "${overlap.name}" (${overlap.startAt} - ${overlap.endAt})`,
        );
      }

      const selfOverlap = candidates
        .slice(index + 1)
        .find(
          (event) =>
            this.resolveEventBotId(state, event) === candidateBotId &&
            this.eventsOverlap(candidate, event),
        );
      if (selfOverlap) {
        throw new Error(
          `Recurring series overlaps with itself (${candidate.startAt} - ${candidate.endAt})`,
        );
      }
    }
  }

  private resolveEventBotId(
    state: Pick<ControlPanelState, "channels">,
    event: Pick<ScheduledEvent, "channelId">,
  ) {
    return (
      state.channels.find((channel) => channel.id === event.channelId)?.botId ??
      this.runtime.getPrimaryBotId()
    );
  }

  private eventsOverlap(
    left: Pick<ScheduledEvent, "startAt" | "endAt">,
    right: Pick<ScheduledEvent, "startAt" | "endAt">,
  ) {
    return (
      Date.parse(left.startAt) < Date.parse(right.endAt) &&
      Date.parse(left.endAt) > Date.parse(right.startAt)
    );
  }

  private requireChannelFromDraft(state: ControlPanelState, id: string) {
    const channel = state.channels.find((entry) => entry.id === id);
    if (!channel) throw new Error("Channel not found");
    return channel;
  }

  private requirePresetFromDraft(state: ControlPanelState, id: string) {
    const preset = state.presets.find((entry) => entry.id === id);
    if (!preset) throw new Error("Preset not found");
    return preset;
  }

  private requireEventFromDraft(state: ControlPanelState, id: string) {
    const event = state.events.find((entry) => entry.id === id);
    if (!event) throw new Error("Event not found");
    return event;
  }

  private requireChannelFromSnapshot(state: ControlPanelState, id: string) {
    return this.requireChannelFromDraft(state, id);
  }

  private requirePresetFromSnapshot(state: ControlPanelState, id: string) {
    return this.requirePresetFromDraft(state, id);
  }

  private requireEventFromSnapshot(state: ControlPanelState, id: string) {
    return this.requireEventFromDraft(state, id);
  }

  // ── Discord Scheduled Event Sync ──────────────────────────────────

  private async syncEventsToDiscord(
    events: ScheduledEvent[],
    channelId: string,
  ) {
    try {
      const state = this.store.snapshot();
      const channel = state.channels.find((c) => c.id === channelId);
      if (!channel) return;
      await this.runtime.ensureReady(channel.botId);
      const client = this.runtime.getClient(channel.botId);
      if (!client.user) return;

      const guild = client.guilds.cache.get(channel.guildId);
      if (!guild) {
        this.store.appendLog(
          "warn",
          `Discord Event Sync: Guild ${channel.guildId} nicht im Cache`,
        );
        return;
      }

      for (const event of events) {
        try {
          const preset = state.presets.find((p) => p.id === event.presetId);
          const description = buildDiscordEventDescription(
            event,
            channel,
            preset,
          );

          const discordEvent = await guild.scheduledEvents.create({
            name: event.name,
            scheduledStartTime: new Date(event.startAt),
            scheduledEndTime: new Date(event.endAt),
            privacyLevel: 2,
            entityType: 2,
            channel: channel.channelId,
            description,
          });

          this.store.update((draft) => {
            const target = draft.events.find((e) => e.id === event.id);
            if (target) {
              target.discordEventId = discordEvent.id;
            }
          });

          this.store.appendLog(
            "info",
            `Discord Event erstellt: "${event.name}"`,
            { discordEventId: discordEvent.id },
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
          this.store.appendLog(
            "warn",
            `Discord Event konnte nicht erstellt werden: "${event.name}"`,
            { error: msg },
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      this.store.appendLog("warn", "Discord Event Sync fehlgeschlagen", {
        error: msg,
      });
    }
  }

  private async deleteDiscordEvents(
    botId: string,
    guildId: string,
    discordEventIds: string[],
  ) {
    try {
      await this.runtime.ensureReady(botId);
      const client = this.runtime.getClient(botId);
      if (!client.user) return;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      for (const eventId of discordEventIds) {
        try {
          const discordEvent = await guild.scheduledEvents.fetch(eventId);
          if (discordEvent) {
            await discordEvent.delete();
            this.store.appendLog("info", "Discord Event geloescht", {
              discordEventId: eventId,
            });
          }
        } catch {
          // Event might already be deleted
        }
      }
    } catch {
      // Non-blocking
    }
  }

  private async setDiscordEventActive(
    botId: string,
    guildId: string,
    discordEventId: string,
  ) {
    try {
      await this.runtime.ensureReady(botId);
      const client = this.runtime.getClient(botId);
      if (!client.user) return;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const discordEvent = await guild.scheduledEvents.fetch(discordEventId);
      if (discordEvent) {
        await discordEvent.setStatus("ACTIVE");
        this.store.appendLog("info", "Discord Event gestartet", {
          discordEventId,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      this.store.appendLog(
        "warn",
        "Discord Event Status-Update fehlgeschlagen",
        {
          error: msg,
        },
      );
    }
  }

  private async setDiscordEventCompleted(
    botId: string,
    guildId: string,
    discordEventId: string,
  ) {
    try {
      await this.runtime.ensureReady(botId);
      const client = this.runtime.getClient(botId);
      if (!client.user) return;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const discordEvent = await guild.scheduledEvents.fetch(discordEventId);
      if (discordEvent) {
        await discordEvent.setStatus("COMPLETED");
        this.store.appendLog(
          "info",
          "Discord Event als abgeschlossen markiert",
          {
            discordEventId,
          },
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      this.store.appendLog(
        "warn",
        "Discord Event Completed-Update fehlgeschlagen",
        { error: msg },
      );
    }
  }

  // ── Queue Management ──────────────────────────────────────────

  public addToQueue(
    url: string,
    name?: string,
    sourceMode?: "direct" | "yt-dlp",
  ): QueueItem {
    assertNonEmpty(url, "url");
    const item: QueueItem = {
      id: randomUUID(),
      url: url.trim(),
      name: (name?.trim() || url.trim()).slice(0, 120),
      sourceMode: sourceMode ?? (isYouTubeUrl(url) ? "yt-dlp" : "direct"),
      addedAt: nowIso(),
      status: "pending",
    };
    this.store.update((draft) => {
      draft.queue.push(item);
    });
    this.store.appendLog("info", "Queue: Item hinzugefuegt", {
      name: item.name,
    });
    return item;
  }

  public removeFromQueue(id: string) {
    this.store.update((draft) => {
      const idx = draft.queue.findIndex((i) => i.id === id);
      if (idx < 0) throw new Error("Queue item not found");
      draft.queue.splice(idx, 1);
      if (draft.queueConfig.currentIndex >= draft.queue.length) {
        draft.queueConfig.currentIndex = Math.max(0, draft.queue.length - 1);
      }
    });
  }

  public clearQueue() {
    this.store.update((draft) => {
      draft.queue = [];
      draft.queueConfig = {
        ...createDefaultQueueConfig(),
        loop: draft.queueConfig.loop,
        conflictPolicy: draft.queueConfig.conflictPolicy,
      };
    });
    this.store.appendLog("info", "Queue geleert");
  }

  public setQueueLoop(enabled: boolean) {
    this.store.update((draft) => {
      draft.queueConfig.loop = enabled;
    });
  }

  public updateQueueConfig(input: {
    loop?: boolean;
    conflictPolicy?: QueueConflictPolicy;
  }) {
    let updated: QueueConfig | undefined;
    this.store.update((draft) => {
      if (input.loop !== undefined) {
        draft.queueConfig.loop = input.loop;
      }
      if (input.conflictPolicy) {
        draft.queueConfig.conflictPolicy = input.conflictPolicy;
      }
      updated = { ...draft.queueConfig };
    });
    return updated!;
  }

  public async startQueue(channelId: string, presetId: string) {
    const state = this.store.snapshot();
    if (!state.queue.length) throw new Error("Queue is empty");
    const channel = state.channels.find((c) => c.id === channelId);
    if (!channel) throw new Error("Channel not found");
    const preset = state.presets.find((p) => p.id === presetId);
    if (!preset) throw new Error("Preset not found");
    if (this.hasActiveRun(channel.botId)) {
      throw new Error("Selected selfbot is already streaming");
    }

    this.store.update((draft) => {
      draft.queueConfig.active = true;
      draft.queueConfig.botId = channel.botId;
      draft.queueConfig.channelId = channelId;
      draft.queueConfig.presetId = presetId;
      draft.queueConfig.currentIndex = 0;
      draft.queueConfig.pausedByEvent = false;
      draft.queueConfig.pausedEventId = undefined;
      draft.queueConfig.pausedAt = undefined;
      for (const item of draft.queue) {
        item.status = "pending";
      }
    });

    this.store.appendLog("info", "Queue gestartet", {
      items: String(state.queue.length),
      channel: channel.name,
      botId: channel.botId,
    });
    await this.sendNotification(
      `Queue gestartet: ${state.queue.length} Items in ${channel.name}`,
      "queueLifecycle",
      channel.botId,
    );
    await this.playCurrentQueueItem();
  }

  public async skipQueueItem() {
    const state = this.store.snapshot();
    if (!state.queueConfig.active) throw new Error("Queue is not active");
    if (state.queueConfig.pausedByEvent) {
      throw new Error("Queue is paused by a scheduled event");
    }
    const queueBotId = state.queueConfig.botId;

    this.store.update((draft) => {
      const item = draft.queue[draft.queueConfig.currentIndex];
      if (item && item.status === "playing") {
        item.status = "skipped";
      }
    });

    if (this.runtime.getActiveRun(queueBotId)) {
      this.stopActiveForBot("manual-stop", queueBotId);
    } else {
      await this.advanceQueue();
    }
  }

  public stopQueue() {
    const queueState = this.store.snapshot().queueConfig;
    const queueBotId = queueState.botId;
    const wasActive = queueState.active;
    this.store.update((draft) => {
      draft.queueConfig.active = false;
      draft.queueConfig.pausedByEvent = false;
      draft.queueConfig.pausedEventId = undefined;
      draft.queueConfig.pausedAt = undefined;
    });
    if (!queueState.pausedByEvent && this.runtime.getActiveRun(queueBotId)) {
      this.stopActiveForBot("manual-stop", queueBotId);
    }
    this.store.appendLog("info", "Queue gestoppt");
    if (wasActive) {
      this.sendNotification("Queue gestoppt", "queueLifecycle", queueBotId).catch(
        () => {},
      );
    }
  }

  public reorderQueue(id: string, newIndex: number) {
    this.store.update((draft) => {
      const idx = draft.queue.findIndex((i) => i.id === id);
      if (idx < 0) throw new Error("Queue item not found");
      const [item] = draft.queue.splice(idx, 1);
      const clampedIndex = Math.max(0, Math.min(newIndex, draft.queue.length));
      draft.queue.splice(clampedIndex, 0, item);
    });
  }

  public preemptQueueForScheduledEvent(botId: string, eventId: string) {
    const state = this.store.snapshot();
    if (
      !state.queueConfig.active ||
      state.queueConfig.botId !== botId ||
      state.queueConfig.pausedByEvent
    ) {
      return false;
    }

    this.store.update((draft) => {
      if (!draft.queueConfig.active || draft.queueConfig.botId !== botId) {
        return;
      }
      draft.queueConfig.pausedByEvent = true;
      draft.queueConfig.pausedEventId = eventId;
      draft.queueConfig.pausedAt = nowIso();
      const currentItem = draft.queue[draft.queueConfig.currentIndex];
      if (currentItem?.status === "playing") {
        currentItem.status = "pending";
      }
    });

    this.store.appendLog("info", "Queue pausiert fuer geplantes Event", {
      botId,
      eventId,
    });

    if (this.runtime.getActiveRun(botId)) {
      this.stopActiveForBot("queue-preempted-for-event", botId);
    }

    return true;
  }

  public resumeQueueAfterScheduledEvent(botId?: string, eventId?: string) {
    const state = this.store.snapshot();
    if (
      !botId ||
      !state.queueConfig.active ||
      !state.queueConfig.pausedByEvent ||
      state.queueConfig.botId !== botId
    ) {
      return false;
    }
    if (
      eventId &&
      state.queueConfig.pausedEventId &&
      state.queueConfig.pausedEventId !== eventId
    ) {
      return false;
    }

    this.store.update((draft) => {
      if (
        !draft.queueConfig.active ||
        !draft.queueConfig.pausedByEvent ||
        draft.queueConfig.botId !== botId
      ) {
        return;
      }
      draft.queueConfig.pausedByEvent = false;
      draft.queueConfig.pausedEventId = undefined;
      draft.queueConfig.pausedAt = undefined;
    });

    this.store.appendLog("info", "Queue wird nach Event fortgesetzt", {
      botId,
    });
    setTimeout(() => this.playCurrentQueueItem().catch(() => {}), 1500);
    return true;
  }

  private async playCurrentQueueItem() {
    const state = this.store.snapshot();
    const { queueConfig, queue } = state;
    if (
      !queueConfig.active ||
      queueConfig.pausedByEvent ||
      !queueConfig.botId ||
      !queueConfig.channelId ||
      !queueConfig.presetId
    )
      return;
    if (queueConfig.currentIndex >= queue.length) return;

    const item = queue[queueConfig.currentIndex];
    if (!item) return;

    const channel = state.channels.find((c) => c.id === queueConfig.channelId);
    const basePreset = state.presets.find((p) => p.id === queueConfig.presetId);
    if (!channel || !basePreset) {
      this.stopQueue();
      return;
    }

    const queuePreset: StreamPreset = {
      ...basePreset,
      id: `queue-${item.id}`,
      name: `Queue: ${item.name}`,
      sourceUrl: item.url,
      sourceMode: item.sourceMode,
    };

    this.store.update((draft) => {
      const qi = draft.queue[draft.queueConfig.currentIndex];
      if (qi) qi.status = "playing";
    });

    try {
      await this.runtime.startRun({
        kind: "manual",
        channel,
        preset: queuePreset,
      });
      await this.sendNotification(
        `Queue [${queueConfig.currentIndex + 1}/${queue.length}]: ${item.name}`,
        "queueItems",
        channel.botId,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      this.store.update((draft) => {
        const qi = draft.queue[draft.queueConfig.currentIndex];
        if (qi) qi.status = "failed";
      });
      this.store.appendLog("error", "Queue Item Fehler", {
        name: item.name,
        error: msg,
      });
      await this.sendNotification(
        `Queue-Item fehlgeschlagen: ${item.name} | ${msg}`,
        "failures",
        channel.botId,
      );
      await this.advanceQueue();
    }
  }

  private async advanceQueue() {
    if (this.queueAdvancing) return;
    this.queueAdvancing = true;
    try {
      const state = this.store.snapshot();
      if (!state.queueConfig.active) return;

      const nextIndex = state.queueConfig.currentIndex + 1;
      if (nextIndex >= state.queue.length) {
        if (state.queueConfig.loop && state.queue.length > 0) {
          this.store.update((draft) => {
            draft.queueConfig.currentIndex = 0;
            for (const item of draft.queue) {
              if (item.status !== "pending") item.status = "pending";
            }
          });
          this.store.appendLog("info", "Queue: Loop - starte von vorne");
          await this.playCurrentQueueItem();
        } else {
          this.store.update((draft) => {
            draft.queueConfig.active = false;
          });
          this.store.appendLog("info", "Queue abgeschlossen");
          await this.sendNotification(
            "Queue abgeschlossen - alle Items gespielt",
            "queueLifecycle",
            state.queueConfig.botId,
          );
        }
      } else {
        this.store.update((draft) => {
          draft.queueConfig.currentIndex = nextIndex;
        });
        await this.playCurrentQueueItem();
      }
    } finally {
      this.queueAdvancing = false;
    }
  }

  private onQueueRunEnded(info: RunEndedInfo) {
    const state = this.store.snapshot();
    if (!state.queueConfig.active || !state.queueConfig.botId) return;
    if (info.run.botId !== state.queueConfig.botId) return;
    if (state.queueConfig.pausedByEvent) return;

    this.store.update((draft) => {
      const item = draft.queue[draft.queueConfig.currentIndex];
      if (item && item.status === "playing") {
        item.status = "completed";
      }
    });

    setTimeout(() => this.advanceQueue().catch(() => {}), 1500);
  }

  private onQueueRunFailed(info: RunFailedInfo) {
    const state = this.store.snapshot();
    if (!state.queueConfig.active || !state.queueConfig.botId) return;
    if (info.run.botId !== state.queueConfig.botId) return;
    if (state.queueConfig.pausedByEvent) return;

    this.store.update((draft) => {
      const item = draft.queue[draft.queueConfig.currentIndex];
      if (item && item.status === "playing") {
        item.status = "failed";
      }
    });

    setTimeout(() => this.advanceQueue().catch(() => {}), 2000);
  }

  // ── Notifications ─────────────────────────────────────────────

  public async sendNotification(
    message: string,
    eventType: NotificationEventType,
    botId?: string,
    settingsOverride?: NotificationSettings,
  ) {
    const settings = settingsOverride ?? this.resolveNotificationSettings();
    if (!settings.rules[eventType]) {
      return;
    }
    const tasks: Promise<void>[] = [];

    if (settings.webhookUrl) {
      tasks.push(this.sendWebhookNotification(message, settings.webhookUrl));
    }
    if (settings.dmEnabled) {
      tasks.push(this.sendDmNotification(message, botId));
    }

    await Promise.allSettled(tasks);
  }

  private async sendWebhookNotification(message: string, webhookUrl: string) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message,
          username: "Stream Bot",
        }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      this.store.appendLog("warn", "Webhook Benachrichtigung fehlgeschlagen", {
        error: msg,
      });
    }
  }

  private async sendDmNotification(message: string, botId?: string) {
    try {
      const resolvedBotId =
        botId ??
        this.runtime.getActiveRun()?.botId ??
        this.runtime.getPrimaryBotId();
      await this.runtime.ensureReady(resolvedBotId);
      const client = this.runtime.getClient(resolvedBotId);
      if (!client.user) return;
      const dmChannel = await client.user.createDM();
      await dmChannel.send(message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      this.store.appendLog("warn", "DM Benachrichtigung fehlgeschlagen", {
        error: msg,
      });
    }
  }

  private resolveNotificationSettings(
    input?: NotificationSettingsInput,
    fallback?: NotificationSettings,
    stampUpdate = true,
  ): NotificationSettings {
    const stored = this.store.snapshot().notificationSettings;
    const base =
      fallback ??
      (stored.updatedAt
        ? stored
        : {
            webhookUrl: appConfig.notificationWebhookUrl,
            dmEnabled: appConfig.notificationDmEnabled,
            rules: createDefaultNotificationRules(),
          });

    return {
      webhookUrl: normalizeWebhookUrl(input?.webhookUrl ?? base.webhookUrl),
      dmEnabled:
        typeof input?.dmEnabled === "boolean"
          ? input.dmEnabled
          : !!base.dmEnabled,
      rules: mergeNotificationRules(input?.rules, base.rules),
      updatedAt: stampUpdate ? nowIso() : base.updatedAt,
    };
  }

  private parseImportPayload(input: unknown): ControlPanelExportPayload {
    if (!input || typeof input !== "object") {
      throw new Error("Import payload must be a JSON object");
    }

    const raw = input as Partial<ControlPanelExportPayload> & {
      data?: unknown;
      channels?: unknown;
      presets?: unknown;
      events?: unknown;
      queue?: unknown;
      queueConfig?: unknown;
      notificationSettings?: unknown;
    };

    if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
      return {
        version: raw.version === 1 ? 1 : 1,
        exportedAt:
          typeof raw.exportedAt === "string" ? raw.exportedAt : nowIso(),
        data: raw.data as ControlPanelExportPayload["data"],
      };
    }

    return {
      version: 1,
      exportedAt: nowIso(),
      data: {
        channels: Array.isArray(raw.channels) ? raw.channels : [],
        presets: Array.isArray(raw.presets) ? raw.presets : [],
        events: Array.isArray(raw.events) ? raw.events : [],
        queue: Array.isArray(raw.queue) ? raw.queue : [],
        queueConfig:
          raw.queueConfig && typeof raw.queueConfig === "object"
            ? (raw.queueConfig as ControlPanelExportPayload["data"]["queueConfig"])
            : createDefaultQueueConfig(),
        notificationSettings:
          raw.notificationSettings &&
          typeof raw.notificationSettings === "object"
            ? (raw.notificationSettings as NotificationSettings)
            : this.getNotificationSettings(),
      },
    };
  }

  private normalizeImportedConfiguration(
    input: ControlPanelExportPayload["data"],
  ): ControlPanelExportPayload["data"] {
    const working = {
      channels: Array.isArray(input.channels)
        ? structuredClone(input.channels)
        : [],
      presets: Array.isArray(input.presets)
        ? structuredClone(input.presets)
        : [],
      events: Array.isArray(input.events) ? structuredClone(input.events) : [],
      queue: Array.isArray(input.queue) ? structuredClone(input.queue) : [],
      queueConfig:
        input.queueConfig && typeof input.queueConfig === "object"
          ? structuredClone(input.queueConfig)
          : createDefaultQueueConfig(),
      notificationSettings: this.resolveNotificationSettings(
        input.notificationSettings,
        this.resolveNotificationSettings(),
      ),
    };

    const botIds = new Set<string>();
    for (const channel of working.channels) {
      if (!channel || typeof channel !== "object") {
        throw new Error("Import contains an invalid channel entry");
      }
      if (typeof channel.id !== "string" || !channel.id.trim()) {
        throw new Error("Imported channels require a valid id");
      }
      if (typeof channel.botId !== "string" || !channel.botId.trim()) {
        channel.botId = this.runtime.getPrimaryBotId();
      }
      if (!this.runtime.hasBot(channel.botId)) {
        botIds.add(channel.botId);
      }
    }

    if (botIds.size > 0) {
      throw new Error(
        `Import references unknown selfbots: ${[...botIds].join(", ")}`,
      );
    }

    const channelIds = new Set(working.channels.map((channel) => channel.id));
    const presetIds = new Set(working.presets.map((preset) => preset.id));
    const timestamp = nowIso();
    const now = Date.now();

    for (const preset of working.presets) {
      if (!preset || typeof preset !== "object") {
        throw new Error("Import contains an invalid preset entry");
      }
      if (typeof preset.id !== "string" || !preset.id.trim()) {
        throw new Error("Imported presets require a valid id");
      }
      preset.sourceMode =
        preset.sourceMode === "yt-dlp" || preset.sourceMode === "direct"
          ? preset.sourceMode
          : "direct";
      const legacyFallbackSources = normalizeLegacyFallbackUrls(
        (preset as { fallbackUrls?: unknown }).fallbackUrls,
        preset.sourceMode,
      );
      if (Array.isArray(preset.fallbackSources)) {
        preset.fallbackSources = preset.fallbackSources
          .filter(isFallbackSourceLike)
          .filter(
            (source) => typeof source.url === "string" && source.url.trim(),
          )
          .map((source) => ({
            url: source.url.trim(),
            sourceMode:
              source.sourceMode === "yt-dlp" || source.sourceMode === "direct"
                ? source.sourceMode
                : preset.sourceMode,
          }));
      } else {
        preset.fallbackSources = legacyFallbackSources;
      }
    }

    working.events = working.events.map((event) => {
      if (!event || typeof event !== "object") {
        throw new Error("Import contains an invalid event entry");
      }
      if (!channelIds.has(event.channelId)) {
        throw new Error(
          `Imported event references missing channel: ${event.channelId}`,
        );
      }
      if (!presetIds.has(event.presetId)) {
        throw new Error(
          `Imported event references missing preset: ${event.presetId}`,
        );
      }

      if (event.status === "running") {
        if (Date.parse(event.endAt) <= now) {
          return {
            ...event,
            status: "completed" as const,
            actualEndedAt: event.actualEndedAt ?? timestamp,
            updatedAt: timestamp,
          };
        }
        return {
          ...event,
          status: "scheduled" as const,
          lastError: "Imported without active runtime session",
          actualStartedAt: undefined,
          updatedAt: timestamp,
        };
      }

      return event;
    });

    this.assertNoOverlap(
      { channels: working.channels },
      [],
      working.events.filter((event) => blocksScheduling(event.status)),
    );
    sortChannels(working.channels);
    sortPresets(working.presets);
    sortEvents(working.events);

    working.queue = working.queue.map((item) => {
      if (!item || typeof item !== "object") {
        throw new Error("Import contains an invalid queue entry");
      }
      return {
        ...item,
        status: item.status === "playing" ? "pending" : item.status,
      };
    });

    working.queueConfig = {
      ...createDefaultQueueConfig(),
      ...working.queueConfig,
      pausedByEvent: false,
      pausedEventId: undefined,
      pausedAt: undefined,
    };

    if (
      working.queueConfig.channelId &&
      !channelIds.has(working.queueConfig.channelId)
    ) {
      working.queueConfig.channelId = undefined;
      working.queueConfig.botId = undefined;
    }

    if (working.queueConfig.channelId) {
      working.queueConfig.botId = working.channels.find(
        (channel) => channel.id === working.queueConfig.channelId,
      )?.botId;
    }

    if (
      working.queueConfig.presetId &&
      !presetIds.has(working.queueConfig.presetId)
    ) {
      working.queueConfig.presetId = undefined;
    }

    working.queueConfig.active = false;
    working.queueConfig.currentIndex = Math.max(
      0,
      Math.min(
        Number.isInteger(working.queueConfig.currentIndex)
          ? working.queueConfig.currentIndex
          : 0,
        Math.max(0, working.queue.length - 1),
      ),
    );

    return working;
  }
}
