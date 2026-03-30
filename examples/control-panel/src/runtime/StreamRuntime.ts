import { EventEmitter } from "node:events";
import {
  Client,
  StageChannel,
  VoiceChannel,
} from "discord.js-selfbot-v13";
import {
  Encoders,
  Streamer,
  type EncoderSettingsGetter,
  Utils,
  playStream,
  prepareStream,
} from "@dank074/discord-video-stream";
import { setFFmpegPath, setFFprobePath } from "fluent-ffmpeg-simplified";
import { appConfig } from "../config/appConfig.js";
import {
  buildManagedSelfbotState,
  type SelfbotProfileConfig,
} from "../config/selfbotConfig.js";
import {
  applyRuntimePerformanceGuardrails,
  resolveRuntimePresetConfig,
} from "../domain/presetProfiles.js";
import type {
  ActiveRun,
  ChannelDefinition,
  HardwareEncoder,
  ManagedSelfbotState,
  PreferredHardwareEncoder,
  RuntimeState,
  RunKind,
  StreamTelemetry,
  StreamPreset,
  VideoEncoderMode,
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

type ManagedBot = {
  profile: SelfbotProfileConfig;
  client: Client;
  streamer: Streamer;
  loginPromise?: Promise<void>;
  voiceChannelsCache?: {
    expiresAt: number;
    value: VoiceChannelOption[];
  };
};

type ActiveSession = {
  botId: string;
  run: ActiveRun;
  channel: ChannelDefinition;
  preset: StreamPreset;
  selectedEncoderMode: VideoEncoderMode;
  effectiveWidth: number;
  effectiveHeight: number;
  effectiveFps: number;
  lagTelemetrySamples: number;
  lowFpsTelemetrySamples: number;
  lagWarningIssued: boolean;
  dropWarningIssued: boolean;
  controller: AbortController;
  stopReason?: string;
  closed: boolean;
  stopTimeout?: NodeJS.Timeout;
};

type CommandProcessLike = {
  pid?: number;
  exitCode?: number | null;
};

type ResolvedVideoEncoder = {
  mode: VideoEncoderMode;
  encoder: EncoderSettingsGetter;
  fallbackReason?: string;
};

type PresenceTemplateContext = {
  botId: string;
  botName: string;
  channelId?: string;
  channelName?: string;
  presetId?: string;
  presetName?: string;
  title?: string;
  sourceUrl?: string;
};

function parseIntegerTelemetryValue(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFloatTelemetryValue(value: string) {
  const normalized = value.replace(/[^0-9.+-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOutTimeSecondsFromCounter(value: string) {
  const parsed = parseIntegerTelemetryValue(value);
  if (typeof parsed !== "number") return undefined;
  return parsed > 100_000
    ? Math.max(0, Math.round(parsed / 1_000_000))
    : Math.max(0, Math.round(parsed / 1_000));
}

function parseOutTimeSecondsFromClock(value: string) {
  const match = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseFloat(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) {
    return undefined;
  }
  return Math.max(0, Math.round(hours * 3600 + minutes * 60 + seconds));
}

function renderTemplate(
  template: string | undefined,
  context: PresenceTemplateContext,
) {
  const normalized = template?.trim();
  if (!normalized) return undefined;

  return normalized.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = context[key as keyof PresenceTemplateContext];
    return typeof value === "string" ? value : "";
  }).trim() || undefined;
}

export class StreamRuntime extends EventEmitter {
  private readonly store: AppStateStore;
  private readonly sourceResolver: SourceResolver;
  private readonly bots = new Map<string, ManagedBot>();
  private activeSession?: ActiveSession;

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

    for (const profile of appConfig.selfbotProfiles) {
      const client = new Client();
      const bot: ManagedBot = {
        profile,
        client,
        streamer: new Streamer(client),
      };
      this.bots.set(profile.id, bot);
      this.registerBotEvents(bot);
    }

    this.store.setRuntime((runtime) => {
      runtime.discordStatus = "starting";
      runtime.primaryBotId = appConfig.primarySelfbotId;
      runtime.bots = appConfig.selfbotProfiles.map(buildManagedSelfbotState);
      runtime.ffmpegPath = appConfig.ffmpegPath;
      runtime.ffprobePath = appConfig.ffprobePath;
      runtime.ytDlpPath = appConfig.ytDlpPath;
      runtime.ytDlpVersion = appConfig.ytDlpVersion;
      runtime.ytDlpAvailable = !!appConfig.ytDlpPath;
      runtime.commandPrefix = appConfig.commandEnabled
        ? appConfig.commandPrefix
        : undefined;
      runtime.commandAuthorIds = appConfig.commandAllowedAuthorIds;
      runtime.panelAuthEnabled = appConfig.panelAuthEnabled;
      runtime.availableVideoEncoders = [
        "software",
        ...appConfig.availableHardwareEncoders,
      ];
      runtime.preferredHardwareEncoder = appConfig.preferredHardwareEncoder;
      runtime.ffmpegLogLevel = appConfig.ffmpegLogLevel;
    });
  }

  public getPrimaryBotId() {
    return appConfig.primarySelfbotId;
  }

  public hasBot(botId: string) {
    return this.bots.has(botId);
  }

  public async ensureReady(botId = appConfig.primarySelfbotId) {
    const bot = this.requireBot(botId);
    if (bot.client.user) return;
    if (!bot.profile.token) {
      const message = `Discord token is missing for bot "${bot.profile.name}"`;
      this.setBotError(bot, message);
      throw new Error(message);
    }

    if (!bot.loginPromise) {
      bot.loginPromise = bot.client.login(bot.profile.token).then(() => {
        if (!bot.client.user) {
          throw new Error("Discord login completed without a ready user");
        }
      }).catch((error: unknown) => {
        bot.loginPromise = undefined;
        const message =
          error instanceof Error ? error.message : "Discord login failed";
        this.setBotError(bot, message);
        this.store.appendLog("error", "Discord login failed", {
          botId: bot.profile.id,
          botName: bot.profile.name,
          error: message,
        });
        throw error;
      });
    }

    await bot.loginPromise;
  }

  public getActiveRun() {
    return this.activeSession?.run;
  }

  public getClient(botId = appConfig.primarySelfbotId) {
    return this.requireBot(botId).client;
  }

  public async listVoiceChannels(
    forceRefresh = false,
    botId = appConfig.primarySelfbotId,
  ): Promise<VoiceChannelOption[]> {
    const bot = this.requireBot(botId);
    await this.ensureReady(botId);

    if (
      !forceRefresh &&
      bot.voiceChannelsCache &&
      bot.voiceChannelsCache.expiresAt > Date.now()
    ) {
      return bot.voiceChannelsCache.value;
    }

    const result: VoiceChannelOption[] = [];
    const guilds = [...bot.client.guilds.cache.values()].sort((a, b) =>
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
          botId: bot.profile.id,
          botName: bot.profile.name,
          guildId: guild.id,
          guildName: guild.name,
          channelId: channel.id,
          channelName: channel.name,
          streamMode: "go-live",
        });
      }
    }

    bot.voiceChannelsCache = {
      expiresAt: Date.now() + 30_000,
      value: result,
    };

    return result;
  }

  public async startRun(options: StartRunOptions): Promise<ActiveRun> {
    if (this.activeSession) {
      throw new Error("A stream is already active");
    }

    const botId = options.channel.botId || appConfig.primarySelfbotId;
    const bot = this.requireBot(botId);
    await this.ensureReady(botId);

    const run: ActiveRun = {
      kind: options.kind,
      eventId: options.eventId,
      botId: bot.profile.id,
      botName: bot.profile.name,
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
      botId: bot.profile.id,
      botName: bot.profile.name,
      kind: run.kind,
      channel: options.channel.name,
      preset: options.preset.name,
    });

    const controller = new AbortController();
    const resolvedEncoder = this.resolveVideoEncoder(options.preset);
    const guardedPreset = applyRuntimePerformanceGuardrails(
      options.preset,
      resolvedEncoder.mode,
    );
    const resolvedPreset = resolveRuntimePresetConfig({
      ...options.preset,
      width: guardedPreset.width,
      height: guardedPreset.height,
      fps: guardedPreset.fps,
      bitrateVideoKbps: guardedPreset.bitrateVideoKbps,
      maxBitrateVideoKbps: guardedPreset.maxBitrateVideoKbps,
      bitrateAudioKbps: guardedPreset.bitrateAudioKbps,
    });
    const session: ActiveSession = {
      botId: bot.profile.id,
      run,
      channel: options.channel,
      preset: options.preset,
      selectedEncoderMode: resolvedEncoder.mode,
      effectiveWidth: guardedPreset.width,
      effectiveHeight: guardedPreset.height,
      effectiveFps: guardedPreset.fps,
      lagTelemetrySamples: 0,
      lowFpsTelemetrySamples: 0,
      lagWarningIssued: false,
      dropWarningIssued: false,
      controller,
      closed: false,
    };
    this.activeSession = session;

    const channel = await bot.client.channels.fetch(options.channel.channelId);
    if (!channel || !channel.isVoice()) {
      this.failSession(session, "Configured Discord channel is not a voice channel");
      throw new Error("Configured Discord channel is not a voice channel");
    }

    let command: ReturnType<typeof prepareStream>["command"];
    let output: ReturnType<typeof prepareStream>["output"];
    let waitForStartup: Promise<void> | undefined;
    let presenceContext: PresenceTemplateContext = {
      botId: bot.profile.id,
      botName: bot.profile.name,
      channelId: options.channel.id,
      channelName: options.channel.name,
      presetId: options.preset.id,
      presetName: options.preset.name,
      sourceUrl: options.preset.sourceUrl,
      title: options.preset.name,
    };

    try {
      const resolvedSource = await this.sourceResolver.resolve(
        options.preset,
        controller.signal,
      );

      presenceContext = {
        ...presenceContext,
        title: resolvedSource.resolvedTitle ?? options.preset.name,
        sourceUrl: resolvedSource.inputUrl,
      };

      this.store.appendLog("info", "Source resolved", {
        botId: bot.profile.id,
        botName: bot.profile.name,
        preset: options.preset.name,
        mode: resolvedSource.resolverKind,
        title: resolvedSource.resolvedTitle ?? "",
        live: resolvedSource.isLive ? "true" : "false",
        separateAudio: isSplitMediaInput(resolvedSource.input) && resolvedSource.input.audio
          ? "true"
          : "false",
        encoder: resolvedEncoder.mode,
        width: String(guardedPreset.width),
        height: String(guardedPreset.height),
        fps: String(guardedPreset.fps),
        qualityProfile: resolvedPreset.qualityProfile,
        bufferProfile: resolvedPreset.effectiveBufferProfile,
      });

      if (resolvedEncoder.fallbackReason) {
        this.store.appendLog("warn", "Hardware acceleration fallback", {
          botId: bot.profile.id,
          botName: bot.profile.name,
          preset: options.preset.name,
          fallback: resolvedEncoder.fallbackReason,
          selectedEncoder: resolvedEncoder.mode,
        });
      }

      for (const warning of guardedPreset.warnings) {
        this.store.appendLog("warn", "Runtime performance guardrail applied", {
          botId: bot.profile.id,
          botName: bot.profile.name,
          preset: options.preset.name,
          warning,
          width: String(guardedPreset.width),
          height: String(guardedPreset.height),
          fps: String(guardedPreset.fps),
          encoder: resolvedEncoder.mode,
        });
      }

      this.store.setRuntime((runtime) => {
        runtime.selectedVideoEncoder = resolvedEncoder.mode;
        runtime.telemetry = {
          updatedAt: new Date().toISOString(),
        };
      });

      ({ command, output } = prepareStream(
        resolvedSource.input,
        {
          includeAudio: options.preset.includeAudio,
          width: resolvedPreset.preserveSource ? undefined : guardedPreset.width,
          height: resolvedPreset.preserveSource ? undefined : guardedPreset.height,
          frameRate: resolvedPreset.preserveSource ? undefined : guardedPreset.fps,
          bitrateVideo: guardedPreset.bitrateVideoKbps,
          bitrateVideoMax: guardedPreset.maxBitrateVideoKbps,
          bitrateAudio: guardedPreset.bitrateAudioKbps,
          encoder: resolvedEncoder.encoder,
          hardwareAcceleratedDecoding: options.preset.hardwareAcceleration,
          minimizeLatency: resolvedPreset.minimizeLatency,
          customInputOptions: [
            "-progress",
            "pipe:2",
            "-stats_period",
            "2",
            ...resolvedPreset.customInputOptions,
          ],
          bitrateBufferFactor: resolvedPreset.bitrateBufferFactor,
          videoCodec: Utils.normalizeVideoCodec(options.preset.videoCodec),
          logLevel: appConfig.ffmpegLogLevel,
        },
        controller.signal,
      ));
      this.attachFfmpegTelemetry(session, command);
      waitForStartup = this.createStartupWatcher(command, controller.signal);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Source preparation failed";
      this.failSession(session, message);
      throw error instanceof Error ? error : new Error(message);
    }

    await bot.streamer.joinVoice(
      options.channel.guildId,
      options.channel.channelId,
    );

    if (channel instanceof StageChannel) {
      await bot.streamer.client.user?.voice?.setSuppressed(false);
    }

    void playStream(
      output,
      bot.streamer,
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
      botId: bot.profile.id,
      botName: bot.profile.name,
      kind: run.kind,
      channel: options.channel.name,
      preset: options.preset.name,
    });

    void this.applyStreamingPresence(bot, presenceContext).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to apply streaming presence";
      this.store.appendLog("warn", "Streaming presence update failed", {
        botId: bot.profile.id,
        botName: bot.profile.name,
        error: message,
      });
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

  private requireBot(botId: string) {
    const bot = this.bots.get(botId);
    if (!bot) {
      throw new Error(`Configured selfbot "${botId}" was not found`);
    }
    return bot;
  }

  private registerBotEvents(bot: ManagedBot) {
    bot.client.on("ready", () => {
      this.updateBotRuntime(bot.profile.id, (entry, runtime) => {
        entry.status = "ready";
        entry.userTag = bot.client.user?.tag;
        entry.userId = bot.client.user?.id;
        entry.lastError = undefined;

        if (bot.profile.id === appConfig.primarySelfbotId) {
          runtime.discordStatus = "ready";
          runtime.discordUserTag = bot.client.user?.tag;
          runtime.discordUserId = bot.client.user?.id;
          runtime.lastError = undefined;
        }
      });

      this.store.appendLog("info", "Discord client is ready", {
        botId: bot.profile.id,
        botName: bot.profile.name,
        userTag: bot.client.user?.tag ?? "unknown",
      });

      if (!this.activeSession || this.activeSession.botId !== bot.profile.id) {
        void this.applyIdlePresence(bot).catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Failed to apply idle presence";
          this.store.appendLog("warn", "Idle presence update failed", {
            botId: bot.profile.id,
            botName: bot.profile.name,
            error: message,
          });
        });
      }

      if (bot.profile.id === appConfig.primarySelfbotId) {
        this.emit("discordReady");
      }
    });

    bot.client.on("error", (error) => {
      this.setBotError(bot, error.message);
      this.store.appendLog("error", "Discord client error", {
        botId: bot.profile.id,
        botName: bot.profile.name,
        error: error.message,
      });
    });
  }

  private setBotError(bot: ManagedBot, message: string) {
    this.updateBotRuntime(bot.profile.id, (entry, runtime) => {
      entry.status = "error";
      entry.lastError = message;

      if (bot.profile.id === appConfig.primarySelfbotId) {
        runtime.discordStatus = "error";
        runtime.lastError = message;
      }
    });
  }

  private updateBotRuntime(
    botId: string,
    updater: (
      entry: ManagedSelfbotState,
      runtime: RuntimeState,
    ) => void,
  ) {
    this.store.setRuntime((runtime) => {
      runtime.bots ??= appConfig.selfbotProfiles.map(buildManagedSelfbotState);
      let entry = runtime.bots.find((item) => item.id === botId);
      if (!entry) {
        const profile = appConfig.selfbotProfiles.find((item) => item.id === botId);
        if (!profile) return;
        entry = buildManagedSelfbotState(profile);
        runtime.bots.push(entry);
      }
      updater(entry, runtime);
    });
  }

  private async applyIdlePresence(bot: ManagedBot) {
    const activityText = renderTemplate(bot.profile.idleActivityText, {
      botId: bot.profile.id,
      botName: bot.profile.name,
    });

    this.applyPresence(
      bot,
      bot.profile.idlePresenceStatus,
      bot.profile.idleActivityType,
      activityText,
    );

    this.updateBotRuntime(bot.profile.id, (entry) => {
      entry.lastPresenceText = activityText;
      entry.lastVoiceStatus = undefined;
    });
  }

  private async applyStreamingPresence(
    bot: ManagedBot,
    context: PresenceTemplateContext,
  ) {
    const activityText = renderTemplate(
      bot.profile.streamActivityText,
      context,
    );
    const voiceStatus = renderTemplate(
      bot.profile.voiceStatusTemplate,
      context,
    );

    this.applyPresence(
      bot,
      bot.profile.streamPresenceStatus,
      bot.profile.streamActivityType,
      activityText,
    );
    await this.setVoiceStatus(bot, voiceStatus);

    this.updateBotRuntime(bot.profile.id, (entry) => {
      entry.lastPresenceText = activityText;
      entry.lastVoiceStatus = voiceStatus;
    });
  }

  private applyPresence(
    bot: ManagedBot,
    status: SelfbotProfileConfig["idlePresenceStatus"],
    type: SelfbotProfileConfig["idleActivityType"],
    text: string | undefined,
  ) {
    const user = bot.client.user;
    if (!user) return;

    const activity = text
      ? [{
          name: text,
          type,
          ...(type === "STREAMING"
            ? { url: "https://www.twitch.tv/discord" }
            : {}),
        }]
      : [];

    user.setPresence({
      status,
      activities: activity,
    });
  }

  private async setVoiceStatus(bot: ManagedBot, statusText: string | undefined) {
    const voiceState = bot.client.user?.voice;
    if (!voiceState?.channel) return;

    await voiceState.setStatus(statusText ?? "");
  }

  private armStopFallback(session: ActiveSession) {
    if (session.stopTimeout) {
      clearTimeout(session.stopTimeout);
    }

    session.stopTimeout = setTimeout(() => {
      if (session.closed || this.activeSession !== session) return;
      this.store.appendLog("warn", "Force-closing stuck stream session", {
        botId: session.botId,
        botName: session.run.botName,
        kind: session.run.kind,
        channel: session.channel.name,
        preset: session.preset.name,
        reason: session.stopReason ?? "unknown",
      });
      this.completeSession(session, "aborted", session.stopReason ?? "forced-stop");
    }, 10_000);
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

  private async cleanupVoiceState(bot: ManagedBot) {
    try {
      await this.setVoiceStatus(bot, "");
    } catch {}
    try {
      bot.streamer.stopStream();
    } catch {}
    try {
      bot.streamer.leaveVoice();
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

    const bot = this.requireBot(session.botId);
    void this.cleanupVoiceState(bot);
    void this.applyIdlePresence(bot).catch(() => {});

    this.store.setRuntime((runtime) => {
      runtime.activeRun = undefined;
      runtime.lastEndedAt = new Date().toISOString();
      runtime.selectedVideoEncoder = undefined;
      runtime.telemetry = undefined;
      if (reason === "aborted" && abortReason) {
        runtime.lastError = undefined;
      }
    });

    this.store.appendLog("info", "Stream ended", {
      botId: session.botId,
      botName: session.run.botName,
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

    const bot = this.requireBot(session.botId);
    void this.cleanupVoiceState(bot);
    void this.applyIdlePresence(bot).catch(() => {});

    this.store.setRuntime((runtime) => {
      runtime.activeRun = undefined;
      runtime.lastEndedAt = new Date().toISOString();
      runtime.selectedVideoEncoder = undefined;
      runtime.telemetry = undefined;
      runtime.lastError = error;
    });
    this.store.appendLog("error", "Stream failed", {
      botId: session.botId,
      botName: session.run.botName,
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

  private resolveVideoEncoder(preset: StreamPreset): ResolvedVideoEncoder {
    if (!preset.hardwareAcceleration) {
      return {
        mode: "software",
        encoder: Encoders.software(),
      };
    }

    const available = appConfig.availableHardwareEncoders;
    if (!available.length) {
      return {
        mode: "software",
        encoder: Encoders.software(),
        fallbackReason: "no supported hardware encoder detected",
      };
    }

    const requested = this.pickPreferredHardwareEncoder(
      available,
      appConfig.preferredHardwareEncoder,
    );
    if (!requested) {
      return {
        mode: "software",
        encoder: Encoders.software(),
        fallbackReason: "preferred hardware encoder is unavailable",
      };
    }

    if (requested === "nvenc") {
      return {
        mode: "nvenc",
        encoder: Encoders.nvenc({
          preset: preset.minimizeLatency ? "p3" : "p4",
          spatialAq: !preset.minimizeLatency,
          temporalAq: !preset.minimizeLatency,
        }),
      };
    }

    return {
      mode: "vaapi",
      encoder: Encoders.vaapi({
        device: appConfig.vaapiDevice,
      }),
    };
  }

  private pickPreferredHardwareEncoder(
    available: readonly HardwareEncoder[],
    preferred: PreferredHardwareEncoder,
  ) {
    if (preferred !== "auto" && available.includes(preferred)) {
      return preferred;
    }
    return available[0];
  }

  private evaluatePerformance(
    session: ActiveSession,
    telemetry: StreamTelemetry,
  ) {
    if (this.activeSession !== session || session.closed) return;

    const speed = telemetry.speed;
    const fps = telemetry.fps;
    const dropFrames = telemetry.dropFrames ?? 0;
    const targetFps = session.effectiveFps;

    if (typeof speed === "number" && speed < 0.95) {
      session.lagTelemetrySamples += 1;
    } else {
      session.lagTelemetrySamples = 0;
    }

    if (
      typeof fps === "number" &&
      targetFps > 0 &&
      fps < Math.max(targetFps * 0.82, 20)
    ) {
      session.lowFpsTelemetrySamples += 1;
    } else {
      session.lowFpsTelemetrySamples = 0;
    }

    if (
      !session.lagWarningIssued &&
      (session.lagTelemetrySamples >= 3 || session.lowFpsTelemetrySamples >= 3)
    ) {
      session.lagWarningIssued = true;
      this.store.appendLog("warn", "Encoder is falling behind realtime", {
        botId: session.botId,
        botName: session.run.botName,
        channel: session.channel.name,
        preset: session.preset.name,
        encoder: session.selectedEncoderMode,
        speed: typeof speed === "number" ? speed.toFixed(2) : "",
        fps: typeof fps === "number" ? fps.toFixed(1) : "",
        targetFps: String(targetFps),
        hint:
          session.selectedEncoderMode === "software"
            ? "Use hardware acceleration or lower the preset"
            : "Lower the preset or bitrate if the source remains unstable",
      });
    }

    if (!session.dropWarningIssued && dropFrames >= 20) {
      session.dropWarningIssued = true;
      this.store.appendLog("warn", "Dropped video frames detected", {
        botId: session.botId,
        botName: session.run.botName,
        channel: session.channel.name,
        preset: session.preset.name,
        encoder: session.selectedEncoderMode,
        dropped: String(dropFrames),
      });
    }
  }

  private attachFfmpegTelemetry(
    session: ActiveSession,
    command: ReturnType<typeof prepareStream>["command"],
  ) {
    const sample: StreamTelemetry = {};

    command.on("stderr", (line: string) => {
      if (this.activeSession !== session || session.closed) return;

      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("=")) return;

      const separator = trimmed.indexOf("=");
      if (separator < 0) return;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();

      switch (key) {
        case "frame":
          sample.frame = parseIntegerTelemetryValue(value);
          break;
        case "fps":
          sample.fps = parseFloatTelemetryValue(value);
          break;
        case "bitrate":
          sample.bitrateKbps = parseFloatTelemetryValue(value);
          break;
        case "speed":
          sample.speed = parseFloatTelemetryValue(value);
          break;
        case "dup_frames":
          sample.dupFrames = parseIntegerTelemetryValue(value);
          break;
        case "drop_frames":
          sample.dropFrames = parseIntegerTelemetryValue(value);
          break;
        case "out_time":
          sample.outTimeSeconds = parseOutTimeSecondsFromClock(value);
          break;
        case "out_time_ms":
        case "out_time_us":
          sample.outTimeSeconds = parseOutTimeSecondsFromCounter(value);
          break;
        case "progress":
          if (value === "continue" || value === "end") {
            const telemetrySnapshot = {
              ...sample,
              updatedAt: new Date().toISOString(),
            };
            this.store.setRuntime((runtime) => {
              if (this.activeSession !== session || !runtime.activeRun) return;
              runtime.telemetry = {
                ...runtime.telemetry,
                ...telemetrySnapshot,
              };
            });
            this.evaluatePerformance(session, telemetrySnapshot);
          }
          break;
        default:
          break;
      }
    });
  }
}
