import type {
  BufferProfile,
  ChannelInput,
  EventInput,
  EventSeriesScope,
  ManualRunInput,
  NotificationRuleSet,
  NotificationSettingsInput,
  PresetInput,
  QualityProfile,
  QueueConflictPolicy,
  RecurrenceInput,
  SourceMode,
  StreamMode,
  VideoCodec,
} from "../domain/types.js";

const STREAM_MODES = [
  "go-live",
  "camera",
] as const satisfies readonly StreamMode[];
const SOURCE_MODES = [
  "direct",
  "yt-dlp",
] as const satisfies readonly SourceMode[];
const QUALITY_PROFILES = [
  "720p30",
  "720p60",
  "1080p30",
  "1080p60",
  "1440p30",
  "1440p60",
  "2160p30",
  "2160p60",
  "custom",
] as const satisfies readonly QualityProfile[];
const BUFFER_PROFILES = [
  "auto",
  "stable",
  "balanced",
  "low-latency",
] as const satisfies readonly BufferProfile[];
const VIDEO_CODECS = ["H264", "H265"] as const satisfies readonly VideoCodec[];
const RECURRENCE_KINDS = ["once", "daily", "weekly"] as const;
const EVENT_SERIES_SCOPES = [
  "single",
  "this-and-following",
  "all",
] as const satisfies readonly EventSeriesScope[];
const QUEUE_CONFLICT_POLICIES = [
  "queue-first",
  "event-first",
] as const satisfies readonly QueueConflictPolicy[];

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

type JsonObject = Record<string, unknown>;

function ensureObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `${label} must be a JSON object`);
  }
  return value as JsonObject;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readRequiredText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalString(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a string`);
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function readBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new HttpError(400, `${fieldName} must be a boolean`);
  }
  return value;
}

function readOptionalBoolean(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readBoolean(value, fieldName);
}

function readInteger(value: unknown, fieldName: string, minimum?: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, `${fieldName} must be an integer`);
  }
  if (minimum !== undefined && value < minimum) {
    throw new HttpError(400, `${fieldName} must be >= ${minimum}`);
  }
  return value;
}

function readOptionalInteger(
  value: unknown,
  fieldName: string,
  minimum?: number,
) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readInteger(value, fieldName, minimum);
}

function readEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(
      400,
      `${fieldName} must be one of: ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

function readOptionalEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return readEnum(value, fieldName, allowed);
}

function readOptionalWeekdays(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, "recurrence.daysOfWeek must be an array");
  }

  const weekdays = value.map((entry, index) => {
    const parsed = readInteger(entry, `recurrence.daysOfWeek[${index}]`, 0);
    if (parsed > 6) {
      throw new HttpError(
        400,
        "recurrence.daysOfWeek values must be between 0 and 6",
      );
    }
    return parsed;
  });

  return [...new Set(weekdays)];
}

export function getRouteParam(
  value: string | string[] | undefined,
  name: string,
) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new HttpError(400, `Missing route parameter: ${name}`);
}

export function parseBootstrapQuery(query: Record<string, unknown>) {
  return {
    botId: readOptionalString(query.botId, "botId"),
    forceRefresh: query.refresh === "1",
  };
}

export function parseVoiceChannelsQuery(query: Record<string, unknown>) {
  return {
    botId: readOptionalString(query.botId, "botId"),
    forceRefresh: query.refresh === "1",
  };
}

export function parseLogsQuery(query: Record<string, unknown>) {
  const raw =
    typeof query.limit === "string"
      ? Number.parseInt(query.limit, 10)
      : Number.NaN;
  return Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 200) : 50;
}

export function parseOptionalBotQuery(query: Record<string, unknown>) {
  return readOptionalString(query.botId, "botId");
}

export function parseChannelInput(value: unknown): ChannelInput {
  const body = ensureObject(value, "Channel payload");
  return {
    botId: readOptionalString(body.botId, "botId"),
    name: readRequiredString(body.name, "name"),
    guildId: readRequiredString(body.guildId, "guildId"),
    channelId: readRequiredString(body.channelId, "channelId"),
    streamMode: readEnum(body.streamMode, "streamMode", STREAM_MODES),
    description: readOptionalString(body.description, "description"),
  };
}

export function parsePresetInput(value: unknown): PresetInput {
  const body = ensureObject(value, "Preset payload");
  const sourceMode = readEnum(body.sourceMode, "sourceMode", SOURCE_MODES);
  return {
    name: readRequiredString(body.name, "name"),
    sourceUrl: readRequiredString(body.sourceUrl, "sourceUrl"),
    sourceMode,
    fallbackSources: parseFallbackSources(body.fallbackSources, sourceMode),
    qualityProfile: readEnum(
      body.qualityProfile,
      "qualityProfile",
      QUALITY_PROFILES,
    ),
    bufferProfile: readEnum(
      body.bufferProfile,
      "bufferProfile",
      BUFFER_PROFILES,
    ),
    description: readOptionalString(body.description, "description"),
    includeAudio: readBoolean(body.includeAudio, "includeAudio"),
    width: readInteger(body.width, "width", 1),
    height: readInteger(body.height, "height", 1),
    fps: readInteger(body.fps, "fps", 1),
    bitrateVideoKbps: readInteger(body.bitrateVideoKbps, "bitrateVideoKbps", 1),
    maxBitrateVideoKbps: readInteger(
      body.maxBitrateVideoKbps,
      "maxBitrateVideoKbps",
      1,
    ),
    bitrateAudioKbps: readInteger(body.bitrateAudioKbps, "bitrateAudioKbps", 1),
    videoCodec: readEnum(body.videoCodec, "videoCodec", VIDEO_CODECS),
    hardwareAcceleration: readBoolean(
      body.hardwareAcceleration,
      "hardwareAcceleration",
    ),
    minimizeLatency: readBoolean(body.minimizeLatency, "minimizeLatency"),
  };
}

function parseFallbackSources(value: unknown, defaultSourceMode: SourceMode) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, "fallbackSources must be an array");
  }

  return value.map((entry, index) => {
    const body = ensureObject(entry, `fallbackSources[${index}]`);
    return {
      url: readRequiredString(body.url, `fallbackSources[${index}].url`),
      sourceMode:
        readOptionalEnum(
          body.sourceMode,
          `fallbackSources[${index}].sourceMode`,
          SOURCE_MODES,
        ) ?? defaultSourceMode,
    };
  });
}

function parseRecurrenceInput(value: unknown): RecurrenceInput | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const recurrence = ensureObject(value, "recurrence");
  const kind = readEnum(recurrence.kind, "recurrence.kind", RECURRENCE_KINDS);
  return {
    kind,
    interval: readOptionalInteger(
      recurrence.interval,
      "recurrence.interval",
      1,
    ),
    daysOfWeek: readOptionalWeekdays(recurrence.daysOfWeek),
    until: readOptionalString(recurrence.until, "recurrence.until"),
  };
}

export function parseEventInput(value: unknown): EventInput {
  const body = ensureObject(value, "Event payload");
  return {
    name: readRequiredString(body.name, "name"),
    channelId: readRequiredString(body.channelId, "channelId"),
    presetId: readRequiredString(body.presetId, "presetId"),
    startAt: readRequiredString(body.startAt, "startAt"),
    endAt: readRequiredString(body.endAt, "endAt"),
    description: readOptionalString(body.description, "description"),
    recurrence: parseRecurrenceInput(body.recurrence),
  };
}

export function parseEventUpdateInput(value: unknown) {
  const body = ensureObject(value, "Event update payload");
  const scope =
    readOptionalEnum(body.scope, "scope", EVENT_SERIES_SCOPES) ??
    "this-and-following";
  return {
    input: parseEventInput(body),
    scope,
  };
}

export function parseEventDeleteInput(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { scope: "single" as const };
  }

  const body = ensureObject(value, "Event delete payload");
  return {
    scope:
      readOptionalEnum(body.scope, "scope", EVENT_SERIES_SCOPES) ?? "single",
  };
}

export function parseManualRunInput(value: unknown): ManualRunInput {
  const body = ensureObject(value, "Manual run payload");
  return {
    channelId: readRequiredString(body.channelId, "channelId"),
    presetId: readRequiredString(body.presetId, "presetId"),
    stopAt: readOptionalString(body.stopAt, "stopAt"),
  };
}

export function parseStopInput(value: unknown) {
  const body =
    value === undefined || value === null
      ? {}
      : ensureObject(value, "Stop payload");
  return {
    botId: readOptionalString(body.botId, "botId"),
    all: readOptionalBoolean(body.all, "all") ?? false,
  };
}

export function parsePresetTestUrlInput(value: unknown) {
  const body = ensureObject(value, "Preset test payload");
  return {
    url: readRequiredString(body.url, "url"),
  };
}

export function parseQueueAddInput(value: unknown) {
  const body = ensureObject(value, "Queue payload");
  return {
    url: readRequiredString(body.url, "url"),
    name: readOptionalString(body.name, "name"),
    sourceMode: readOptionalEnum(body.sourceMode, "sourceMode", SOURCE_MODES),
  };
}

export function parseQueueLoopInput(value: unknown) {
  const body = ensureObject(value, "Queue loop payload");
  return {
    enabled: readBoolean(body.enabled, "enabled"),
  };
}

export function parseQueueConfigInput(value: unknown) {
  const body = ensureObject(value, "Queue config payload");
  const loop = readOptionalBoolean(body.loop, "loop");
  const conflictPolicy = readOptionalEnum(
    body.conflictPolicy,
    "conflictPolicy",
    QUEUE_CONFLICT_POLICIES,
  );

  if (loop === undefined && !conflictPolicy) {
    throw new HttpError(
      400,
      "Queue config payload must include loop or conflictPolicy",
    );
  }

  return {
    loop,
    conflictPolicy,
  };
}

export function parseQueueStartInput(value: unknown) {
  const body = ensureObject(value, "Queue start payload");
  return {
    channelId: readRequiredString(body.channelId, "channelId"),
    presetId: readRequiredString(body.presetId, "presetId"),
  };
}

export function parseQueueReorderInput(value: unknown) {
  const body = ensureObject(value, "Queue reorder payload");
  return {
    id: readRequiredString(body.id, "id"),
    newIndex: readInteger(body.newIndex, "newIndex", 0),
  };
}

export function parseNotificationSettingsInput(value: unknown) {
  const body = ensureObject(value ?? {}, "Notification payload");
  return {
    webhookUrl: readOptionalString(body.webhookUrl, "webhookUrl"),
    dmEnabled: readOptionalBoolean(body.dmEnabled, "dmEnabled"),
    rules: parseNotificationRules(body.rules),
  } satisfies NotificationSettingsInput;
}

export function parseNotificationTestInput(value: unknown) {
  const body = ensureObject(value ?? {}, "Notification test payload");
  return {
    webhookUrl: readOptionalString(body.webhookUrl, "webhookUrl"),
    dmEnabled: readOptionalBoolean(body.dmEnabled, "dmEnabled"),
    rules: parseNotificationRules(body.rules),
    botId: readOptionalString(body.botId, "botId"),
  };
}

function parseNotificationRules(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const body = ensureObject(value, "rules");
  return {
    manualRuns: readOptionalBoolean(body.manualRuns, "rules.manualRuns"),
    scheduledEvents: readOptionalBoolean(
      body.scheduledEvents,
      "rules.scheduledEvents",
    ),
    queueLifecycle: readOptionalBoolean(
      body.queueLifecycle,
      "rules.queueLifecycle",
    ),
    queueItems: readOptionalBoolean(body.queueItems, "rules.queueItems"),
    failures: readOptionalBoolean(body.failures, "rules.failures"),
    performanceWarnings: readOptionalBoolean(
      body.performanceWarnings,
      "rules.performanceWarnings",
    ),
  } satisfies Partial<NotificationRuleSet>;
}

export function parseConfigImportInput(value: unknown) {
  return ensureObject(value, "Import payload");
}

export function parseCookieUploadInput(value: unknown) {
  const body = ensureObject(value, "Cookie payload");
  return {
    content: readRequiredText(body.content, "content"),
  };
}

export function getStatusCodeForError(error: unknown) {
  if (error instanceof HttpError) {
    return error.status;
  }

  const message = error instanceof Error ? error.message : "";
  if (/not found/i.test(message)) {
    return 404;
  }
  if (
    /already/i.test(message) ||
    /cannot /i.test(message) ||
    /overlap/i.test(message) ||
    /queue is empty/i.test(message) ||
    /queue is not active/i.test(message) ||
    /already streaming/i.test(message) ||
    /before importing/i.test(message) ||
    /only scheduled events/i.test(message)
  ) {
    return 409;
  }
  if (
    /must be/i.test(message) ||
    /is required/i.test(message) ||
    /invalid/i.test(message) ||
    /activate /i.test(message) ||
    /missing/i.test(message)
  ) {
    return 400;
  }
  return 500;
}
