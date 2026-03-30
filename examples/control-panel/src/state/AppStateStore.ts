import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, parse, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  coerceBufferProfile,
  coerceQualityProfile,
} from "../domain/presetProfiles.js";
import { coerceRecurrenceRule } from "../domain/recurrence.js";
import type {
  ControlPanelState,
  LogEntry,
  LogLevel,
  NotificationSettings,
  QueueConfig,
  RuntimeState,
} from "../domain/types.js";
import { DEFAULT_SELFBOT_ID } from "../domain/types.js";

function defaultRuntime(): RuntimeState {
  return {
    discordStatus: "starting",
    primaryBotId: DEFAULT_SELFBOT_ID,
    bots: [],
    activeRuns: [],
    telemetryByBot: {},
    selectedVideoEncodersByBot: {},
    ytDlpAvailable: false,
    commandAuthorIds: [],
  };
}

function defaultQueueConfig(): QueueConfig {
  return { active: false, loop: false, currentIndex: 0 };
}

function defaultNotificationSettings(): NotificationSettings {
  return {
    webhookUrl: "",
    dmEnabled: false,
  };
}

function createDefaultState(): ControlPanelState {
  return {
    channels: [],
    presets: [],
    events: [],
    queue: [],
    queueConfig: defaultQueueConfig(),
    notificationSettings: defaultNotificationSettings(),
    runtime: defaultRuntime(),
    logs: [],
  };
}

function normalizeState(input: unknown): ControlPanelState {
  const fallback = createDefaultState();
  if (!input || typeof input !== "object") return fallback;

  const state = input as Partial<ControlPanelState>;
  return {
    channels: Array.isArray(state.channels)
      ? state.channels.map((channel) => ({
          ...channel,
          botId:
            typeof channel.botId === "string" && channel.botId.trim()
              ? channel.botId
              : DEFAULT_SELFBOT_ID,
        }))
      : fallback.channels,
    presets: Array.isArray(state.presets)
        ? state.presets.map((preset) => {
          const sourceMode =
            typeof preset.sourceMode === "string" ? preset.sourceMode : "direct";
          const qualityProfile = coerceQualityProfile(preset.qualityProfile);
          const bufferProfile = coerceBufferProfile(
            preset.bufferProfile,
            !!preset.minimizeLatency,
          );
          return {
            ...preset,
            sourceMode,
            qualityProfile,
            bufferProfile,
          };
        })
      : fallback.presets,
    events: Array.isArray(state.events)
      ? state.events.map((event) => {
          const recurrence = coerceRecurrenceRule(
            event.recurrence,
            typeof event.startAt === "string"
              ? event.startAt
              : new Date().toISOString(),
          );
          const occurrenceIndex =
            typeof event.occurrenceIndex === "number" && event.occurrenceIndex > 0
              ? event.occurrenceIndex
              : 1;
          return {
            ...event,
            recurrence,
            occurrenceIndex,
          };
        })
      : fallback.events,
    queue: Array.isArray(state.queue) ? state.queue : [],
    queueConfig:
      state.queueConfig && typeof state.queueConfig === "object"
        ? { ...defaultQueueConfig(), ...state.queueConfig }
        : defaultQueueConfig(),
    notificationSettings:
      state.notificationSettings && typeof state.notificationSettings === "object"
        ? {
            ...defaultNotificationSettings(),
            webhookUrl:
              typeof state.notificationSettings.webhookUrl === "string"
                ? state.notificationSettings.webhookUrl.trim()
                : "",
            dmEnabled: !!state.notificationSettings.dmEnabled,
            updatedAt:
              typeof state.notificationSettings.updatedAt === "string"
                ? state.notificationSettings.updatedAt
                : undefined,
          }
        : defaultNotificationSettings(),
    runtime:
      state.runtime && typeof state.runtime === "object"
        ? {
            ...fallback.runtime,
            ...state.runtime,
            activeRuns: Array.isArray(state.runtime.activeRuns)
              ? state.runtime.activeRuns
              : state.runtime.activeRun
                ? [state.runtime.activeRun]
                : fallback.runtime.activeRuns,
            telemetryByBot:
              state.runtime.telemetryByBot &&
                typeof state.runtime.telemetryByBot === "object"
                ? state.runtime.telemetryByBot
                : fallback.runtime.telemetryByBot,
            selectedVideoEncodersByBot:
              state.runtime.selectedVideoEncodersByBot &&
                typeof state.runtime.selectedVideoEncodersByBot === "object"
                ? state.runtime.selectedVideoEncodersByBot
                : fallback.runtime.selectedVideoEncodersByBot,
          }
        : fallback.runtime,
    logs: Array.isArray(state.logs) ? state.logs.slice(0, 200) : fallback.logs,
  };
}

export class AppStateStore {
  private state: ControlPanelState;
  private readonly listeners = new Set<(state: ControlPanelState) => void>();
  private readonly logsFilePath: string;

  constructor(private readonly filePath: string) {
    this.filePath = resolve(filePath);
    this.logsFilePath = this.deriveLogsFilePath(this.filePath);
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.state = this.load();
    this.save();
  }

  private load(): ControlPanelState {
    const rawState = this.readJsonFileWithBackup(this.filePath);
    if (!rawState) {
      return createDefaultState();
    }

    const normalized = normalizeState(rawState);
    const rawLogs = this.readJsonFileWithBackup(this.logsFilePath);
    if (Array.isArray(rawLogs)) {
      normalized.logs = rawLogs.slice(0, 200) as LogEntry[];
    }
    return normalized;
  }

  private save() {
    const statePayload = JSON.stringify({
      ...this.state,
      logs: [],
    }, null, 2);
    const logsPayload = JSON.stringify(this.state.logs, null, 2);

    this.writeJsonFile(this.filePath, statePayload);
    this.writeJsonFile(this.logsFilePath, logsPayload);
  }

  private writeJsonFile(targetPath: string, payload: string) {
    const tempPath = `${targetPath}.tmp`;
    const backupPath = `${targetPath}.bak`;
    writeFileSync(tempPath, payload, "utf-8");

    if (existsSync(targetPath)) {
      copyFileSync(targetPath, backupPath);
    }

    try {
      renameSync(tempPath, targetPath);
      return;
    } catch (error: unknown) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";

      // Windows can reject the replace-style rename if the destination file is
      // temporarily observed by another process. Fall back to a direct write so
      // the controller keeps running instead of crashing mid-stream.
      if (code !== "EPERM" && code !== "EEXIST") {
        throw error;
      }
    }

    writeFileSync(targetPath, payload, "utf-8");
    rmSync(tempPath, { force: true });
  }

  private readJsonFileWithBackup(targetPath: string) {
    const primary = this.tryReadJsonFile(targetPath);
    if (primary !== undefined) {
      return primary;
    }
    return this.tryReadJsonFile(`${targetPath}.bak`);
  }

  private tryReadJsonFile(targetPath: string) {
    if (!existsSync(targetPath)) {
      return undefined;
    }

    try {
      const raw = readFileSync(targetPath, "utf-8");
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }

  private deriveLogsFilePath(filePath: string) {
    const parts = parse(filePath);
    const extension = parts.ext || ".json";
    return resolve(parts.dir, `${parts.name}.logs${extension}`);
  }

  public snapshot(): ControlPanelState {
    return structuredClone(this.state);
  }

  public update(
    updater: (draft: ControlPanelState) => void,
  ): ControlPanelState {
    const draft = structuredClone(this.state);
    updater(draft);
    this.state = normalizeState(draft);
    this.save();
    this.emit();
    return this.snapshot();
  }

  public setRuntime(updater: (runtime: RuntimeState) => void): ControlPanelState {
    return this.update((draft) => {
      updater(draft.runtime);
    });
  }

  public appendLog(
    level: LogLevel,
    message: string,
    context?: Record<string, string>,
  ): LogEntry {
    const entry: LogEntry = {
      id: randomUUID(),
      level,
      message,
      context,
      createdAt: new Date().toISOString(),
    };

    this.update((draft) => {
      draft.logs.unshift(entry);
      draft.logs = draft.logs.slice(0, 200);
    });

    return entry;
  }

  public subscribe(listener: (state: ControlPanelState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Never let a subscriber break state persistence.
      }
    }
  }
}
