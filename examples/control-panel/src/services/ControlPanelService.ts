import { randomUUID } from "node:crypto";
import { appConfig } from "../config/appConfig.js";
import { normalizePresetInput } from "../domain/presetProfiles.js";
import {
  buildOccurrenceWindows,
  normalizeRecurrenceInput,
} from "../domain/recurrence.js";
import type {
  ChannelDefinition,
  ChannelInput,
  ControlPanelState,
  EventInput,
  EventStatus,
  ManualRunInput,
  QueueItem,
  RecurrenceRule,
  PresetInput,
  ScheduledEvent,
  StreamPreset,
} from "../domain/types.js";
import { isYouTubeUrl } from "../runtime/SourceResolver.js";
import {
  StreamRuntime,
  type RunEndedInfo,
  type RunFailedInfo,
} from "../runtime/StreamRuntime.js";
import { AppStateStore } from "../state/AppStateStore.js";

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

type EventPlan = {
  recurrence: RecurrenceRule;
  events: ScheduledEvent[];
  seriesId?: string;
};

type EventMutationResult = {
  updatedCount: number;
  events: ScheduledEvent[];
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
  }

  public snapshot(): ControlPanelState {
    return this.store.snapshot();
  }

  public appendLog(level: "info" | "warn" | "error", message: string, context?: Record<string, string>) {
    this.store.appendLog(level, message, context);
  }

  public async listVoiceChannels(forceRefresh = false, botId?: string) {
    return this.runtime.listVoiceChannels(forceRefresh, botId);
  }

  public reconcileStateOnStartup() {
    const now = Date.now();
    const recoveredRun = this.store.snapshot().runtime.activeRun;

    this.store.update((draft) => {
      if (draft.runtime.activeRun) {
        draft.runtime.activeRun = undefined;
        draft.runtime.lastEndedAt = nowIso();
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

    if (recoveredRun) {
      this.store.appendLog("warn", "Recovered stale active run after restart", {
        kind: recoveredRun.kind,
        channel: recoveredRun.channelName,
        preset: recoveredRun.presetName,
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
        event.lastError = "Schedule window elapsed before the event could start";
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
      if (draft.runtime.activeRun?.channelId === id) {
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
      if (draft.runtime.activeRun?.presetId === id) {
        throw new Error("Cannot edit a preset while it is active");
      }

      const preset = this.requirePresetFromDraft(draft, id);
      preset.name = normalizedInput.name.trim();
      preset.sourceUrl = normalizedInput.sourceUrl.trim();
      preset.sourceMode = normalizedInput.sourceMode;
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
      if (draft.runtime.activeRun?.presetId === id) {
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
      this.assertNoOverlap(draft.events, plan.events);
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

  public updateEvent(id: string, input: EventInput): EventMutationResult {
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

      const replacement = this.planEvents(
        input,
        timestamp,
        target.seriesId,
        target.occurrenceIndex,
      ).events;

      const replaceIds = this.collectReplaceIds(draft.events, target);

      // Collect old Discord event IDs for cleanup
      oldDiscordEventIds = draft.events
        .filter((e) => replaceIds.has(e.id) && e.discordEventId)
        .map((e) => e.discordEventId!);

      const retained = draft.events.filter((event) => !replaceIds.has(event.id));

      this.assertNoOverlap(retained, replacement);

      draft.events = [...retained, ...replacement];
      sortEvents(draft.events);
      updated = {
        updatedCount: replacement.length,
        events: replacement,
      };
    });

    // Sync to Discord: delete old events and create new ones
    if (guildId && oldDiscordEventIds.length > 0) {
      this.deleteDiscordEvents(botId, guildId, oldDiscordEventIds).catch(() => {});
    }
    if (updated) {
      this.syncEventsToDiscord(updated.events, input.channelId).catch(() => {});
    }

    return updated!;
  }

  public deleteEvent(id: string) {
    let discordEventIds: string[] = [];
    let guildId: string | undefined;
    let botId = this.runtime.getPrimaryBotId();
    this.store.update((draft) => {
      const event = this.requireEventFromDraft(draft, id);
      if (event.status === "running") {
        throw new Error("Cannot delete a running event");
      }

      const replaceIds = this.collectReplaceIds(draft.events, event);
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

    if (event.status === "running") {
      const stopped = this.runtime.stopActive("event-cancelled");
      if (!stopped) {
        throw new Error("The running event could not be stopped");
      }
      return;
    }

    // Cancel Discord scheduled event
    if (event.discordEventId) {
      const channel = state.channels.find((c) => c.id === event.channelId);
      if (channel) {
        this.deleteDiscordEvents(channel.botId, channel.guildId, [event.discordEventId]).catch(
          () => {},
        );
      }
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

    this.store.update((draft) => {
      const current = this.requireEventFromDraft(draft, id);
      current.status = "running";
      current.actualStartedAt = nowIso();
      current.lastError = undefined;
      current.updatedAt = nowIso();
    });

    // Set Discord event to Active
    if (event.discordEventId) {
      this.setDiscordEventActive(channel.botId, channel.guildId, event.discordEventId).catch(
        () => {},
      );
    }

    try {
      await this.runtime.startRun({
        kind: "event",
        eventId: id,
        channel,
        preset,
        plannedStopAt: event.endAt,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to start event";
      this.failEvent(id, message);
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

    return this.runtime.startRun({
      kind: "manual",
      channel,
      preset,
      plannedStopAt,
    }).then((result) => {
      this.sendNotification(
        `Stream gestartet: ${channel.name} mit ${preset.name}`,
      ).catch(() => {});
      return result;
    });
  }

  public stopActive(reason = "manual-stop") {
    const run = this.runtime.getActiveRun();
    const stopped = this.runtime.stopActive(reason);
    if (stopped && run) {
      this.sendNotification(`Stream gestoppt: ${run.channelName}`).catch(
        () => {},
      );
    }
    return stopped;
  }

  public hasActiveRun() {
    return !!this.runtime.getActiveRun();
  }

  private onRunEnded(info: RunEndedInfo) {
    if (info.run.kind !== "event" || !info.run.eventId) return;

    let shouldMarkCompleted = false;
    let discordEventId: string | undefined;
    let channelId: string | undefined;

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
      } else {
        event.status = "completed";
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
        this.setDiscordEventCompleted(channel.botId, channel.guildId, discordEventId).catch(
          () => {},
        );
      }
    }
  }

  private onRunFailed(info: RunFailedInfo) {
    if (info.run.kind !== "event" || !info.run.eventId) return;
    this.failEvent(info.run.eventId, info.error);
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
    assertNonEmpty(input.sourceUrl, "sourceUrl");
    assertPositiveInteger(input.width, "width");
    assertPositiveInteger(input.height, "height");
    assertPositiveInteger(input.fps, "fps");
    assertPositiveInteger(input.bitrateVideoKbps, "bitrateVideoKbps");
    assertPositiveInteger(input.maxBitrateVideoKbps, "maxBitrateVideoKbps");
    assertPositiveInteger(input.bitrateAudioKbps, "bitrateAudioKbps");

    if (input.maxBitrateVideoKbps < input.bitrateVideoKbps) {
      throw new Error("maxBitrateVideoKbps must be >= bitrateVideoKbps");
    }

    if (input.sourceMode === "direct" && isYouTubeUrl(input.sourceUrl)) {
      throw new Error("YouTube URLs require source mode 'yt-dlp'");
    }

    if (input.sourceMode === "yt-dlp" && !appConfig.ytDlpPath) {
      throw new Error("yt-dlp source mode requires a detected yt-dlp binary");
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

    const recurrence = normalizeRecurrenceInput(input.recurrence, input.startAt);
    const effectiveSeriesId =
      recurrence.kind === "once" ? undefined : seriesId ?? randomUUID();
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

  private collectReplaceIds(events: ScheduledEvent[], target: ScheduledEvent) {
    if (!target.seriesId) {
      return new Set([target.id]);
    }

    const targetStart = Date.parse(target.startAt);
    const related = events.filter((event) => event.seriesId === target.seriesId);

    if (related.some((event) => event.status === "running")) {
      throw new Error("Cannot edit or delete a series while one occurrence is running");
    }

    return new Set(
      related
        .filter((event) => Date.parse(event.startAt) >= targetStart)
        .map((event) => event.id),
    );
  }

  private assertNoOverlap(
    existingEvents: ScheduledEvent[],
    candidateEvents: ScheduledEvent[],
  ) {
    const candidates = [...candidateEvents].sort(
      (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
    );
    const blocking = existingEvents.filter((event) => blocksScheduling(event.status));

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const overlap = blocking.find((event) => this.eventsOverlap(candidate, event));
      if (overlap) {
        throw new Error(
          `Event overlaps with "${overlap.name}" (${overlap.startAt} - ${overlap.endAt})`,
        );
      }

      const selfOverlap = candidates
        .slice(index + 1)
        .find((event) => this.eventsOverlap(candidate, event));
      if (selfOverlap) {
        throw new Error(
          `Recurring series overlaps with itself (${candidate.startAt} - ${candidate.endAt})`,
        );
      }
    }
  }

  private eventsOverlap(left: Pick<ScheduledEvent, "startAt" | "endAt">, right: Pick<ScheduledEvent, "startAt" | "endAt">) {
    return Date.parse(left.startAt) < Date.parse(right.endAt)
      && Date.parse(left.endAt) > Date.parse(right.startAt);
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

      const preset = events[0]
        ? state.presets.find((p) => p.id === events[0].presetId)
        : undefined;

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
          const description = [
            event.description || "",
            "",
            `Stream: ${channel.name} (${channel.streamMode})`,
            preset ? `Preset: ${preset.name}` : "",
            preset ? `Quelle: ${preset.sourceUrl}` : "",
            preset
              ? `Qualitaet: ${preset.width}x${preset.height} @ ${preset.fps}fps`
              : "",
            event.seriesId
              ? `Serie #${event.occurrenceIndex}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
            .trim();

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
          const msg =
            err instanceof Error ? err.message : "Unbekannter Fehler";
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
      this.store.appendLog("warn", "Discord Event Status-Update fehlgeschlagen", {
        error: msg,
      });
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
        this.store.appendLog("info", "Discord Event als abgeschlossen markiert", {
          discordEventId,
        });
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
        active: false,
        loop: draft.queueConfig.loop,
        currentIndex: 0,
      };
    });
    this.store.appendLog("info", "Queue geleert");
  }

  public setQueueLoop(enabled: boolean) {
    this.store.update((draft) => {
      draft.queueConfig.loop = enabled;
    });
  }

  public async startQueue(channelId: string, presetId: string) {
    const state = this.store.snapshot();
    if (!state.queue.length) throw new Error("Queue is empty");
    const channel = state.channels.find((c) => c.id === channelId);
    if (!channel) throw new Error("Channel not found");
    const preset = state.presets.find((p) => p.id === presetId);
    if (!preset) throw new Error("Preset not found");

    this.store.update((draft) => {
      draft.queueConfig.active = true;
      draft.queueConfig.channelId = channelId;
      draft.queueConfig.presetId = presetId;
      draft.queueConfig.currentIndex = 0;
      for (const item of draft.queue) {
        item.status = "pending";
      }
    });

    this.store.appendLog("info", "Queue gestartet", {
      items: String(state.queue.length),
      channel: channel.name,
    });
    await this.sendNotification(
      `Queue gestartet: ${state.queue.length} Items in ${channel.name}`,
    );
    await this.playCurrentQueueItem();
  }

  public async skipQueueItem() {
    const state = this.store.snapshot();
    if (!state.queueConfig.active) throw new Error("Queue is not active");

    this.store.update((draft) => {
      const item = draft.queue[draft.queueConfig.currentIndex];
      if (item && item.status === "playing") {
        item.status = "skipped";
      }
    });

    if (this.runtime.getActiveRun()) {
      this.stopActive();
    } else {
      await this.advanceQueue();
    }
  }

  public stopQueue() {
    this.store.update((draft) => {
      draft.queueConfig.active = false;
    });
    if (this.runtime.getActiveRun()) {
      this.stopActive();
    }
    this.store.appendLog("info", "Queue gestoppt");
  }

  public reorderQueue(id: string, newIndex: number) {
    this.store.update((draft) => {
      const idx = draft.queue.findIndex((i) => i.id === id);
      if (idx < 0) throw new Error("Queue item not found");
      const [item] = draft.queue.splice(idx, 1);
      const clampedIndex = Math.max(
        0,
        Math.min(newIndex, draft.queue.length),
      );
      draft.queue.splice(clampedIndex, 0, item);
    });
  }

  private async playCurrentQueueItem() {
    const state = this.store.snapshot();
    const { queueConfig, queue } = state;
    if (!queueConfig.active || !queueConfig.channelId || !queueConfig.presetId)
      return;
    if (queueConfig.currentIndex >= queue.length) return;

    const item = queue[queueConfig.currentIndex];
    if (!item) return;

    const channel = state.channels.find(
      (c) => c.id === queueConfig.channelId,
    );
    const basePreset = state.presets.find(
      (p) => p.id === queueConfig.presetId,
    );
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
          await this.sendNotification("Queue abgeschlossen - alle Items gespielt");
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

  private onQueueRunEnded(_info: RunEndedInfo) {
    const state = this.store.snapshot();
    if (!state.queueConfig.active) return;

    this.store.update((draft) => {
      const item = draft.queue[draft.queueConfig.currentIndex];
      if (item && item.status === "playing") {
        item.status = "completed";
      }
    });

    setTimeout(() => this.advanceQueue().catch(() => {}), 1500);
  }

  private onQueueRunFailed(_info: RunFailedInfo) {
    const state = this.store.snapshot();
    if (!state.queueConfig.active) return;

    this.store.update((draft) => {
      const item = draft.queue[draft.queueConfig.currentIndex];
      if (item && item.status === "playing") {
        item.status = "failed";
      }
    });

    setTimeout(() => this.advanceQueue().catch(() => {}), 2000);
  }

  // ── Notifications ─────────────────────────────────────────────

  public async sendNotification(message: string) {
    const tasks: Promise<void>[] = [];

    if (appConfig.notificationWebhookUrl) {
      tasks.push(this.sendWebhookNotification(message));
    }
    if (appConfig.notificationDmEnabled) {
      tasks.push(this.sendDmNotification(message));
    }

    await Promise.allSettled(tasks);
  }

  private async sendWebhookNotification(message: string) {
    try {
      await fetch(appConfig.notificationWebhookUrl, {
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

  private async sendDmNotification(message: string) {
    try {
      const activeBotId = this.runtime.getActiveRun()?.botId;
      await this.runtime.ensureReady(activeBotId);
      const client = this.runtime.getClient(activeBotId);
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
}
