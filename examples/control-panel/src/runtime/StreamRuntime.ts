import { EventEmitter } from "node:events";
import {
  Client,
  StageChannel,
  VoiceChannel,
} from "discord.js-selfbot-v13";
import { Streamer, Utils, prepareStream, playStream } from "@dank074/discord-video-stream";
import { setFFmpegPath, setFFprobePath } from "fluent-ffmpeg-simplified";
import { appConfig } from "../config/appConfig.js";
import { resolveRuntimePresetConfig } from "../domain/presetProfiles.js";
import type {
  ActiveRun,
  ChannelDefinition,
  RunKind,
  StreamPreset,
  VoiceChannelOption,
} from "../domain/types.js";
import { AppStateStore } from "../state/AppStateStore.js";
import { SourceResolver } from "./SourceResolver.js";

function isSplitMediaInput(
  input: Awaited<ReturnType<SourceResolver["resolve"]>>["input"],
): input is { video: string; audio?: string } {
  return typeof input === "object" && input !== null && "video" in input;
}

type StartRunOptions = {
  kind: RunKind;
  eventId?: string;
  channel: ChannelDefinition;
  preset: StreamPreset;
  plannedStopAt?: string;
};

export type RunEndedInfo = {
  run: ActiveRun;
  reason: "completed" | "aborted";
  abortReason?: string;
};

export type RunFailedInfo = {
  run: ActiveRun;
  error: string;
};

type ActiveSession = {
  run: ActiveRun;
  channel: ChannelDefinition;
  preset: StreamPreset;
  controller: AbortController;
  stopReason?: string;
  closed: boolean;
  stopTimeout?: NodeJS.Timeout;
};

type CommandProcessLike = {
  pid?: number;
  exitCode?: number | null;
};

export class StreamRuntime extends EventEmitter {
  private readonly client = new Client();
  private readonly streamer = new Streamer(this.client);
  private readonly store: AppStateStore;
  private readonly sourceResolver: SourceResolver;
  private loginPromise?: Promise<void>;
  private activeSession?: ActiveSession;
  private voiceChannelsCache?: {
    expiresAt: number;
    value: VoiceChannelOption[];
  };

  constructor(store: AppStateStore) {
    super();
    this.store = store;
    this.sourceResolver = new SourceResolver(store);

    if (appConfig.ffmpegPath) {
      setFFmpegPath(appConfig.ffmpegPath);
    }
    if (appConfig.ffprobePath) {
      setFFprobePath(appConfig.ffprobePath);
    }

    this.store.setRuntime((runtime) => {
      runtime.discordStatus = "starting";
      runtime.ffmpegPath = appConfig.ffmpegPath;
      runtime.ffprobePath = appConfig.ffprobePath;
      runtime.ytDlpPath = appConfig.ytDlpPath;
      runtime.ytDlpVersion = appConfig.ytDlpVersion;
      runtime.ytDlpAvailable = !!appConfig.ytDlpPath;
      runtime.commandPrefix = appConfig.commandEnabled
        ? appConfig.commandPrefix
        : undefined;
      runtime.commandAuthorIds = appConfig.commandAllowedAuthorIds;
    });

    this.client.on("ready", () => {
      this.store.setRuntime((runtime) => {
        runtime.discordStatus = "ready";
        runtime.discordUserTag = this.client.user?.tag;
        runtime.discordUserId = this.client.user?.id;
        runtime.lastError = undefined;
      });
      this.store.appendLog("info", "Discord client is ready", {
        userTag: this.client.user?.tag ?? "unknown",
      });
      this.emit("discordReady");
    });

    this.client.on("error", (error) => {
      this.store.setRuntime((runtime) => {
        runtime.discordStatus = "error";
        runtime.lastError = error.message;
      });
      this.store.appendLog("error", "Discord client error", {
        error: error.message,
      });
    });
  }

  public async ensureReady() {
    if (this.client.user) return;
    if (!appConfig.discordToken) {
      const message = "DISCORD_TOKEN is missing";
      this.store.setRuntime((runtime) => {
        runtime.discordStatus = "error";
        runtime.lastError = message;
      });
      throw new Error(message);
    }

    if (!this.loginPromise) {
      this.loginPromise = this.client.login(appConfig.discordToken).then(() => {
        if (!this.client.user) {
          throw new Error("Discord login completed without a ready user");
        }
      }).catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Discord login failed";
        this.store.setRuntime((runtime) => {
          runtime.discordStatus = "error";
          runtime.lastError = message;
        });
        this.store.appendLog("error", "Discord login failed", {
          error: message,
        });
        throw error;
      });
    }

    await this.loginPromise;
  }

  public getActiveRun() {
    return this.activeSession?.run;
  }

  public getClient() {
    return this.client;
  }

  public async listVoiceChannels(forceRefresh = false): Promise<VoiceChannelOption[]> {
    await this.ensureReady();

    if (
      !forceRefresh &&
      this.voiceChannelsCache &&
      this.voiceChannelsCache.expiresAt > Date.now()
    ) {
      return this.voiceChannelsCache.value;
    }

    const result: VoiceChannelOption[] = [];
    const guilds = [...this.client.guilds.cache.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const guild of guilds) {
      const channels = await guild.channels.fetch();
      const voiceChannels = [...channels.values()]
        .filter(
          (channel): channel is StageChannel | VoiceChannel =>
            channel instanceof StageChannel || channel instanceof VoiceChannel,
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const channel of voiceChannels) {
        result.push({
          guildId: guild.id,
          guildName: guild.name,
          channelId: channel.id,
          channelName: channel.name,
          streamMode: "go-live",
        });
      }
    }

    this.voiceChannelsCache = {
      expiresAt: Date.now() + 30_000,
      value: result,
    };

    return result;
  }

  public async startRun(options: StartRunOptions): Promise<ActiveRun> {
    if (this.activeSession) {
      throw new Error("A stream is already active");
    }

    await this.ensureReady();

    const run: ActiveRun = {
      kind: options.kind,
      eventId: options.eventId,
      channelId: options.channel.id,
      presetId: options.preset.id,
      channelName: options.channel.name,
      presetName: options.preset.name,
      startedAt: new Date().toISOString(),
      plannedStopAt: options.plannedStopAt,
      status: "starting",
    };

    this.store.setRuntime((runtime) => {
      runtime.activeRun = run;
      runtime.lastStartedAt = run.startedAt;
      runtime.lastError = undefined;
    });
    this.store.appendLog("info", "Starting stream", {
      kind: run.kind,
      channel: options.channel.name,
      preset: options.preset.name,
    });

    const controller = new AbortController();
    const session: ActiveSession = {
      run,
      channel: options.channel,
      preset: options.preset,
      controller,
      closed: false,
    };
    this.activeSession = session;

    const channel = await this.client.channels.fetch(options.channel.channelId);
    if (!channel || !channel.isVoice()) {
      this.failSession(session, "Configured Discord channel is not a voice channel");
      throw new Error("Configured Discord channel is not a voice channel");
    }

    let command: ReturnType<typeof prepareStream>["command"];
    let output: ReturnType<typeof prepareStream>["output"];
    let waitForStartup: Promise<void> | undefined;
    const resolvedPreset = resolveRuntimePresetConfig(options.preset);

    try {
      const resolvedSource = await this.sourceResolver.resolve(
        options.preset,
        controller.signal,
      );

      this.store.appendLog("info", "Source resolved", {
        preset: options.preset.name,
        mode: resolvedSource.resolverKind,
        title: resolvedSource.resolvedTitle ?? "",
        live: resolvedSource.isLive ? "true" : "false",
        separateAudio: isSplitMediaInput(resolvedSource.input) && resolvedSource.input.audio
          ? "true"
          : "false",
        qualityProfile: resolvedPreset.qualityProfile,
        bufferProfile: resolvedPreset.effectiveBufferProfile,
      });

      ({ command, output } = prepareStream(
        resolvedSource.input,
        {
          includeAudio: options.preset.includeAudio,
          width: resolvedPreset.preserveSource ? undefined : options.preset.width,
          height: resolvedPreset.preserveSource ? undefined : options.preset.height,
          frameRate: resolvedPreset.preserveSource ? undefined : options.preset.fps,
          bitrateVideo: options.preset.bitrateVideoKbps,
          bitrateVideoMax: options.preset.maxBitrateVideoKbps,
          bitrateAudio: options.preset.bitrateAudioKbps,
          hardwareAcceleratedDecoding: options.preset.hardwareAcceleration,
          minimizeLatency: resolvedPreset.minimizeLatency,
          customInputOptions: resolvedPreset.customInputOptions,
          bitrateBufferFactor: resolvedPreset.bitrateBufferFactor,
          videoCodec: Utils.normalizeVideoCodec(options.preset.videoCodec),
        },
        controller.signal,
      ));
      waitForStartup = this.createStartupWatcher(command, controller.signal);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Source preparation failed";
      this.failSession(session, message);
      throw error instanceof Error ? error : new Error(message);
    }

    await this.streamer.joinVoice(options.channel.guildId, options.channel.channelId);

    if (channel instanceof StageChannel) {
      await this.streamer.client.user?.voice?.setSuppressed(false);
    }

    void playStream(
      output,
      this.streamer,
      {
        type: options.channel.streamMode,
        readrateInitialBurst: resolvedPreset.readrateInitialBurst,
      },
      controller.signal,
    )
      .then(() => {
        this.completeSession(session, "completed");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          this.completeSession(session, "aborted", session.stopReason);
          return;
        }
        const message =
          error instanceof Error ? error.message : "Streaming failed";
        this.failSession(session, message);
      });

    try {
      await waitForStartup;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Stream startup failed";
      this.failSession(session, message);
      throw error instanceof Error ? error : new Error(message);
    }

    if (this.activeSession !== session) {
      throw new Error("Stream session ended before startup completed");
    }

    this.activeSession.run = {
      ...this.activeSession.run,
      status: "running",
    };
    this.store.setRuntime((runtime) => {
      if (!runtime.activeRun) return;
      runtime.activeRun.status = "running";
    });
    this.emit("runStarted", this.activeSession.run);
    this.store.appendLog("info", "Stream is running", {
      kind: run.kind,
      channel: options.channel.name,
      preset: options.preset.name,
    });

    return this.activeSession.run;
  }

  public stopActive(reason = "manual-stop"): boolean {
    if (!this.activeSession) return false;
    if (this.activeSession.run.status === "stopping") {
      this.activeSession.stopReason ??= reason;
      if (!this.activeSession.stopTimeout) {
        this.armStopFallback(this.activeSession);
      }
      return true;
    }

    this.activeSession.stopReason = reason;
    this.activeSession.run = {
      ...this.activeSession.run,
      status: "stopping",
    };
    this.store.setRuntime((runtime) => {
      if (!runtime.activeRun) return;
      runtime.activeRun.status = "stopping";
    });
    this.activeSession.controller.abort();
    this.armStopFallback(this.activeSession);
    return true;
  }

  private armStopFallback(session: ActiveSession) {
    if (session.stopTimeout) {
      clearTimeout(session.stopTimeout);
    }

    session.stopTimeout = setTimeout(() => {
      if (session.closed || this.activeSession !== session) return;
      this.store.appendLog("warn", "Force-closing stuck stream session", {
        kind: session.run.kind,
        channel: session.channel.name,
        preset: session.preset.name,
        reason: session.stopReason ?? "unknown",
      });
      this.completeSession(session, "aborted", session.stopReason ?? "forced-stop");
    }, 5_000);
  }

  private createStartupWatcher(
    command: ReturnType<typeof prepareStream>["command"],
    cancelSignal: AbortSignal,
  ) {
    const proc = this.getInternalProcess(command);
    if (proc?.pid && proc.exitCode == null) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for FFmpeg to start"));
      }, appConfig.startupTimeoutMs);

      const onStart = () => {
        cleanup();
        resolve();
      };
      const onError = (error: unknown) => {
        cleanup();
        if (cancelSignal.aborted) {
          reject(new Error("Stream startup aborted"));
          return;
        }
        reject(error instanceof Error ? error : new Error("FFmpeg startup failed"));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        command.off("start", onStart);
        command.off("error", onError);
      };

      command.once("start", onStart);
      command.once("error", onError);

      const currentProc = this.getInternalProcess(command);
      if (currentProc?.pid && currentProc.exitCode == null) {
        cleanup();
        resolve();
      } else if (
        typeof currentProc?.exitCode === "number" &&
        currentProc.exitCode !== 0
      ) {
        cleanup();
        reject(new Error("FFmpeg exited before startup completed"));
      }
    });
  }

  private getInternalProcess(command: ReturnType<typeof prepareStream>["command"]) {
    return (command as unknown as { _proc?: CommandProcessLike })._proc;
  }

  private async cleanupVoiceState() {
    try {
      this.streamer.stopStream();
    } catch {}
    try {
      this.streamer.leaveVoice();
    } catch {}
  }

  private completeSession(
    session: ActiveSession,
    reason: "completed" | "aborted",
    abortReason?: string,
  ) {
    if (session.closed) return;
    session.closed = true;
    if (session.stopTimeout) {
      clearTimeout(session.stopTimeout);
      session.stopTimeout = undefined;
    }

    if (this.activeSession === session) {
      this.activeSession = undefined;
    }

    void this.cleanupVoiceState();

    this.store.setRuntime((runtime) => {
      runtime.activeRun = undefined;
      runtime.lastEndedAt = new Date().toISOString();
      if (reason === "aborted" && abortReason) {
        runtime.lastError = undefined;
      }
    });

    this.store.appendLog("info", "Stream ended", {
      kind: session.run.kind,
      channel: session.channel.name,
      preset: session.preset.name,
      reason,
      abortReason: abortReason ?? "",
    });

    this.emit("runEnded", {
      run: session.run,
      reason,
      abortReason,
    } satisfies RunEndedInfo);
  }

  private failSession(session: ActiveSession, error: string) {
    if (session.closed) return;
    session.closed = true;
    if (session.stopTimeout) {
      clearTimeout(session.stopTimeout);
      session.stopTimeout = undefined;
    }

    if (this.activeSession === session) {
      this.activeSession = undefined;
    }

    void this.cleanupVoiceState();

    this.store.setRuntime((runtime) => {
      runtime.activeRun = undefined;
      runtime.lastEndedAt = new Date().toISOString();
      runtime.lastError = error;
    });
    this.store.appendLog("error", "Stream failed", {
      kind: session.run.kind,
      channel: session.channel.name,
      preset: session.preset.name,
      error,
    });

    this.emit("runFailed", {
      run: session.run,
      error,
    } satisfies RunFailedInfo);
  }
}
