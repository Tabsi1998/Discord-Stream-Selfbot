export type StreamMode = "go-live" | "camera";
export type VideoCodec = "H264" | "H265";
export type SourceMode = "direct" | "yt-dlp";
export type QualityProfile =
  | "original"
  | "720p30"
  | "720p60"
  | "1080p30"
  | "1080p60"
  | "1440p30"
  | "1440p60"
  | "custom";
export type BufferProfile =
  | "auto"
  | "stable"
  | "balanced"
  | "low-latency";
export type RecurrenceKind = "once" | "daily" | "weekly";
export type EventStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "canceled"
  | "failed";
export type RunKind = "manual" | "event";
export type DiscordStatus = "starting" | "ready" | "error";
export type LogLevel = "info" | "warn" | "error";

export type ChannelDefinition = {
  id: string;
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
};

export type ActiveRun = {
  kind: RunKind;
  eventId?: string;
  channelId: string;
  presetId: string;
  channelName: string;
  presetName: string;
  startedAt: string;
  plannedStopAt?: string;
  status: "starting" | "running" | "stopping";
};

export type RuntimeState = {
  discordStatus: DiscordStatus;
  discordUserTag?: string;
  discordUserId?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  ytDlpPath?: string;
  ytDlpAvailable?: boolean;
  commandPrefix?: string;
  commandAuthorIds?: string[];
  activeRun?: ActiveRun;
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

export type ControlPanelState = {
  channels: ChannelDefinition[];
  presets: StreamPreset[];
  events: ScheduledEvent[];
  runtime: RuntimeState;
  logs: LogEntry[];
};

export type VoiceChannelOption = {
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
  streamMode: StreamMode;
};

export type ChannelInput = {
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
