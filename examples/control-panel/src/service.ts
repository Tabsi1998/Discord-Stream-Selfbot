import { randomUUID } from "node:crypto";
import { appConfig } from "./config.js";
import { normalizePresetInput } from "./presetProfiles.js";
import {
  buildOccurrenceWindows,
  normalizeRecurrenceInput,
} from "./recurrence.js";
import { isYouTubeUrl } from "./sourceResolver.js";
import { StreamRuntime, type RunEndedInfo, type RunFailedInfo } from "./runtime.js";
import { AppStateStore } from "./storage.js";
import type {
  ChannelDefinition,
  ChannelInput,
  ControlPanelState,
  EventInput,
  EventStatus,
  ManualRunInput,
  RecurrenceRule,
  PresetInput,
  ScheduledEvent,
  StreamPreset,
} from "./types.js";

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
  constructor(
    private readonly store: AppStateStore,
    private readonly runtime: StreamRuntime,
  ) {
    this.runtime.on("runEnded", (info: RunEndedInfo) => this.onRunEnded(info));
    this.runtime.on("runFailed", (info: RunFailedInfo) => this.onRunFailed(info));
  }

  public snapshot(): ControlPanelState {
    return this.store.snapshot();
  }

  public async listVoiceChannels(forceRefresh = false) {
    return this.runtime.listVoiceChannels(forceRefresh);
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
    assertNonEmpty(input.name, "name");
    assertNonEmpty(input.guildId, "guildId");
    assertNonEmpty(input.channelId, "channelId");

    const timestamp = nowIso();
    const channel: ChannelDefinition = {
      id: randomUUID(),
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
          entry.guildId === channel.guildId && entry.channelId === channel.channelId,
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
    assertNonEmpty(input.name, "name");
    assertNonEmpty(input.guildId, "guildId");
    assertNonEmpty(input.channelId, "channelId");

    const updatedAt = nowIso();
    let updated: ChannelDefinition | undefined;

    this.store.update((draft) => {
      const channel = this.requireChannelFromDraft(draft, id);
      const duplicate = draft.channels.find(
        (entry) =>
          entry.id !== id &&
          entry.guildId === input.guildId.trim() &&
          entry.channelId === input.channelId.trim(),
      );
      if (duplicate) {
        throw new Error("This Discord voice channel is already configured");
      }

      channel.name = input.name.trim();
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

    return {
      createdCount: plan.events.length,
      events: plan.events,
      seriesId: plan.seriesId,
    };
  }

  public updateEvent(id: string, input: EventInput): EventMutationResult {
    const timestamp = nowIso();
    let updated: EventMutationResult | undefined;

    this.store.update((draft) => {
      const target = this.requireEventFromDraft(draft, id);
      if (target.status === "running") {
        throw new Error("Cannot edit a running event");
      }

      this.requireChannelFromDraft(draft, input.channelId);
      this.requirePresetFromDraft(draft, input.presetId);

      const replacement = this.planEvents(
        input,
        timestamp,
        target.seriesId,
        target.occurrenceIndex,
      ).events;

      const replaceIds = this.collectReplaceIds(draft.events, target);
      const retained = draft.events.filter((event) => !replaceIds.has(event.id));

      this.assertNoOverlap(retained, replacement);

      draft.events = [...retained, ...replacement];
      sortEvents(draft.events);
      updated = {
        updatedCount: replacement.length,
        events: replacement,
      };
    });

    return updated!;
  }

  public deleteEvent(id: string) {
    this.store.update((draft) => {
      const event = this.requireEventFromDraft(draft, id);
      if (event.status === "running") {
        throw new Error("Cannot delete a running event");
      }

      const replaceIds = this.collectReplaceIds(draft.events, event);
      const before = draft.events.length;
      draft.events = draft.events.filter((entry) => !replaceIds.has(entry.id));
      if (draft.events.length === before) {
        throw new Error("Event not found");
      }
    });
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
    });
  }

  public stopActive(reason = "manual-stop") {
    return this.runtime.stopActive(reason);
  }

  public hasActiveRun() {
    return !!this.runtime.getActiveRun();
  }

  private onRunEnded(info: RunEndedInfo) {
    if (info.run.kind !== "event" || !info.run.eventId) return;

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
      }
    });
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
}
