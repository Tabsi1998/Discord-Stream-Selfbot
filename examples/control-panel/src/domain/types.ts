export type StreamMode = "go-live" | "camera";
export type VideoCodec = "H264" | "H265";
export type SourceMode = "direct" | "yt-dlp";
export type FallbackSource = {
  url: string;
  sourceMode: SourceMode;
};
export type HardwareEncoder = "nvenc" | "vaapi";
export type VideoEncoderMode = "software" | HardwareEncoder;
export type PreferredHardwareEncoder = "auto" | HardwareEncoder;
export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";
export type PresenceActivityType =
  | "PLAYING"
  | "STREAMING"
  | "LISTENING"
  | "WATCHING"
  | "COMPETING";
export type QualityProfile =
  | "720p30"
  | "720p60"
  | "1080p30"
  | "1080p60"
  | "1440p30"
  | "1440p60"
  | "2160p30"
  | "2160p60"
  | "custom";
export type BufferProfile = "auto" | "stable" | "balanced" | "low-latency";
export type RecurrenceKind = "once" | "daily" | "weekly";
export type EventSeriesScope = "single" | "this-and-following" | "all";
export type EventStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "canceled"
  | "failed";
export type RunKind = "manual" | "event";
export type DiscordStatus = "starting" | "ready" | "error";
export type ControlBotStatus = "disabled" | "connecting" | "ready" | "error";
export type LogLevel = "info" | "warn" | "error";
export type QueueConflictPolicy = "queue-first" | "event-first";
export const DEFAULT_SELFBOT_ID = "primary";

export type ManagedSelfbotState = {
  id: string;
  name: string;
  status: DiscordStatus;
  commandEnabled: boolean;
  userTag?: string;
  userId?: string;
  lastError?: string;
  idlePresenceStatus: PresenceStatus;
  idleActivityType: PresenceActivityType;
  idleActivityText?: string;
  streamPresenceStatus: PresenceStatus;
  streamActivityType: PresenceActivityType;
  streamActivityText?: string;
  voiceStatusTemplate?: string;
  lastPresenceText?: string;
  lastVoiceStatus?: string;
};

export type ChannelDefinition = {
  id: string;
  botId: string;
  name: string;
  guildId: string;
  channelId: string;
  streamMode: StreamMode;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type RecurrenceRule = {
  kind: RecurrenceKind;
  interval: number;
  daysOfWeek: number[];
  until?: string;
};

export type StreamPreset = {
  id: string;
  name: string;
  sourceUrl: string;
  sourceMode: SourceMode;
  fallbackSources: FallbackSource[];
  qualityProfile: QualityProfile;
  bufferProfile: BufferProfile;
  description: string;
  includeAudio: boolean;
  width: number;
  height: number;
  fps: number;
  bitrateVideoKbps: number;
  maxBitrateVideoKbps: number;
  bitrateAudioKbps: number;
  videoCodec: VideoCodec;
  hardwareAcceleration: boolean;
  minimizeLatency: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledEvent = {
  id: string;
  name: string;
  channelId: string;
  presetId: string;
  startAt: string;
  endAt: string;
  status: EventStatus;
  description: string;
  recurrence: RecurrenceRule;
  seriesId?: string;
  occurrenceIndex: number;
  createdAt: string;
  updatedAt: string;
  actualStartedAt?: string;
  actualEndedAt?: string;
  lastError?: string;
  discordEventId?: string;
};

export type ActiveRun = {
  kind: RunKind;
  eventId?: string;
  botId: string;
  botName: string;
  channelId: string;
  presetId: string;
  channelName: string;
  presetName: string;
  startedAt: string;
  plannedStopAt?: string;
  status: "starting" | "running" | "stopping";
};

export type StreamTelemetry = {
  frame?: number;
  fps?: number;
  bitrateKbps?: number;
  speed?: number;
  dupFrames?: number;
  dropFrames?: number;
  outTimeSeconds?: number;
  updatedAt?: string;
};

export type RuntimeState = {
  discordStatus: DiscordStatus;
  primaryBotId?: string;
  bots?: ManagedSelfbotState[];
  discordUserTag?: string;
  discordUserId?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  ytDlpPath?: string;
  ytDlpVersion?: string;
  ytDlpAvailable?: boolean;
  commandPrefix?: string;
  commandPrefixes?: string[];
  commandAuthorIds?: string[];
  commandListenerBotIds?: string[];
  commandAuthMode?: "selfbots-only" | "allowlist";
  commandMentionPrefix?: string;
  lastRejectedCommandAt?: string;
  lastRejectedCommandAuthorId?: string;
  lastRejectedCommandPrefix?: string;
  lastRejectedCommandReason?: string;
  controlBotStatus?: ControlBotStatus;
  controlBotUserTag?: string;
  controlBotUserId?: string;
  controlBotEnabled?: boolean;
  panelAuthEnabled?: boolean;
  availableVideoEncoders?: VideoEncoderMode[];
  preferredHardwareEncoder?: PreferredHardwareEncoder;
  selectedVideoEncoder?: VideoEncoderMode;
  selectedVideoEncodersByBot?: Record<string, VideoEncoderMode | undefined>;
  ffmpegLogLevel?: string;
  telemetry?: StreamTelemetry;
  telemetryByBot?: Record<string, StreamTelemetry | undefined>;
  activeRun?: ActiveRun;
  activeRuns?: ActiveRun[];
  lastError?: string;
  lastStartedAt?: string;
  lastEndedAt?: string;
};

export type LogEntry = {
  id: string;
  level: LogLevel;
  message: string;
  createdAt: string;
  context?: Record<string, string>;
};

export type NotificationRuleSet = {
  manualRuns: boolean;
  scheduledEvents: boolean;
  queueLifecycle: boolean;
  queueItems: boolean;
  failures: boolean;
  performanceWarnings: boolean;
};

export type NotificationEventType = keyof NotificationRuleSet;

export type NotificationSettings = {
  webhookUrl: string;
  dmEnabled: boolean;
  rules: NotificationRuleSet;
  updatedAt?: string;
};

export type NotificationSettingsInput = {
  webhookUrl?: string;
  dmEnabled?: boolean;
  rules?: Partial<NotificationRuleSet>;
};

export type ControlPanelState = {
  channels: ChannelDefinition[];
  presets: StreamPreset[];
  events: ScheduledEvent[];
  queue: QueueItem[];
  queueConfig: QueueConfig;
  notificationSettings: NotificationSettings;
  runtime: RuntimeState;
  logs: LogEntry[];
};

export type ControlPanelExportData = {
  channels: ChannelDefinition[];
  presets: StreamPreset[];
  events: ScheduledEvent[];
  queue: QueueItem[];
  queueConfig: QueueConfig;
  notificationSettings: NotificationSettings;
};

export type ControlPanelExportPayload = {
  version: 1;
  exportedAt: string;
  data: ControlPanelExportData;
};

export type VoiceChannelOption = {
  botId: string;
  botName: string;
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
  streamMode: StreamMode;
};

export type ChannelInput = {
  botId?: string;
  name: string;
  guildId: string;
  channelId: string;
  streamMode: StreamMode;
  description?: string;
};

export type PresetInput = {
  name: string;
  sourceUrl: string;
  sourceMode: SourceMode;
  fallbackSources: FallbackSource[];
  qualityProfile: QualityProfile;
  bufferProfile: BufferProfile;
  description?: string;
  includeAudio: boolean;
  width: number;
  height: number;
  fps: number;
  bitrateVideoKbps: number;
  maxBitrateVideoKbps: number;
  bitrateAudioKbps: number;
  videoCodec: VideoCodec;
  hardwareAcceleration: boolean;
  minimizeLatency: boolean;
};

export type RecurrenceInput = {
  kind: RecurrenceKind;
  interval?: number;
  daysOfWeek?: number[];
  until?: string;
};

export type EventInput = {
  name: string;
  channelId: string;
  presetId: string;
  startAt: string;
  endAt: string;
  description?: string;
  recurrence?: RecurrenceInput;
};

export type ManualRunInput = {
  channelId: string;
  presetId: string;
  stopAt?: string;
};

// ── Queue System ────────────────────────────────────────────────
export type QueueItemStatus =
  | "pending"
  | "playing"
  | "completed"
  | "skipped"
  | "failed";

export type QueueItem = {
  id: string;
  url: string;
  name: string;
  sourceMode: SourceMode;
  addedAt: string;
  status: QueueItemStatus;
};

export type QueueConfig = {
  active: boolean;
  loop: boolean;
  botId?: string;
  channelId?: string;
  presetId?: string;
  currentIndex: number;
  conflictPolicy: QueueConflictPolicy;
  pausedByEvent?: boolean;
  pausedEventId?: string;
  pausedAt?: string;
};
