import {
  Client as ControlBotClient,
  GatewayIntentBits,
  Partials,
  type Message as ControlBotMessage,
} from "discord.js";
import type { Message as SelfbotMessage } from "discord.js-selfbot-v13";
import { appConfig } from "../config/appConfig.js";
import type { ScheduledEvent } from "../domain/types.js";
import type { ControlPanelService } from "../services/ControlPanelService.js";
import type { AppStateStore } from "../state/AppStateStore.js";
import type { StreamRuntime } from "./StreamRuntime.js";

type CommandMessageLike = {
  content: string;
  author: {
    id: string;
    bot?: boolean;
  };
  channel: {
    send(content: string): Promise<unknown>;
  };
};

function toCommandMessage(
  message: SelfbotMessage | ControlBotMessage,
): CommandMessageLike | undefined {
  const channel = message.channel;
  if (!("send" in channel) || typeof channel.send !== "function") {
    return undefined;
  }

  return {
    content: message.content,
    author: {
      id: message.author.id,
      bot: "bot" in message.author ? !!message.author.bot : false,
    },
    channel: {
      send: (content: string) => channel.send(content),
    },
  };
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function splitSegments(input: string) {
  return input
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function matchesQuery(value: string, query: string) {
  const normalizedValue = normalizeValue(value);
  const normalizedQuery = normalizeValue(query);
  return (
    normalizedValue === normalizedQuery ||
    normalizedValue.includes(normalizedQuery)
  );
}

export class DiscordCommandBridge {
  private started = false;
  private controlBotClient?: ControlBotClient;
  private readonly selfbotListenerIds = appConfig.selfbotProfiles
    .filter((profile) => profile.commandEnabled)
    .map((profile) => profile.id);

  constructor(
    private readonly runtime: StreamRuntime,
    private readonly service: ControlPanelService,
    private readonly store: AppStateStore,
  ) {}

  public start() {
    if (!appConfig.commandEnabled || this.started) return;
    this.started = true;
    for (const botId of this.selfbotListenerIds) {
      this.runtime
        .getClient(botId)
        .on("messageCreate", this.handleSelfbotMessage);
    }
    if (appConfig.controlBotToken) {
      this.startControlBot();
    } else {
      this.store.setRuntime((runtime) => {
        runtime.controlBotStatus = "disabled";
        runtime.controlBotEnabled = false;
        runtime.controlBotUserTag = undefined;
        runtime.controlBotUserId = undefined;
      });
    }
    this.store.appendLog("info", "Discord command bridge enabled", {
      prefix: appConfig.commandPrefix,
      selfbotListeners: this.selfbotListenerIds.join(",") || "none",
      controlBot: appConfig.controlBotToken ? "enabled" : "disabled",
    });
  }

  private readonly handleSelfbotMessage = async (message: SelfbotMessage) => {
    const commandMessage = toCommandMessage(message);
    if (!commandMessage) return;
    await this.handleMessage(commandMessage);
  };

  private readonly handleControlBotMessage = async (
    message: ControlBotMessage,
  ) => {
    if (message.author.bot) return;
    const commandMessage = toCommandMessage(message);
    if (!commandMessage) return;
    await this.handleMessage(commandMessage);
  };

  private async startControlBot() {
    if (this.controlBotClient) {
      return;
    }
    this.store.setRuntime((runtime) => {
      runtime.controlBotEnabled = true;
      runtime.controlBotStatus = "connecting";
    });

    const client = new ControlBotClient({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    client.on("ready", () => {
      const user = client.user;
      if (!user) {
        return;
      }
      const userTag = user.tag;
      const userId = user.id;
      this.store.setRuntime((runtime) => {
        runtime.controlBotEnabled = true;
        runtime.controlBotStatus = "ready";
        runtime.controlBotUserTag = userTag;
        runtime.controlBotUserId = userId;
      });
      this.store.appendLog("info", "Discord control bot ready", {
        userTag,
        userId,
      });
    });

    client.on("error", (error: Error) => {
      this.store.setRuntime((runtime) => {
        runtime.controlBotEnabled = true;
        runtime.controlBotStatus = "error";
      });
      this.store.appendLog("error", "Discord control bot failed", {
        error: error.message,
      });
    });

    client.on("messageCreate", this.handleControlBotMessage);

    try {
      await client.login(appConfig.controlBotToken);
      this.controlBotClient = client;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Discord control bot login failed";
      this.store.setRuntime((runtime) => {
        runtime.controlBotEnabled = true;
        runtime.controlBotStatus = "error";
      });
      this.store.appendLog("error", "Discord control bot login failed", {
        error: message,
      });
    }
  }

  private readonly handleMessage = async (message: CommandMessageLike) => {
    if (!message.content.startsWith(appConfig.commandPrefix)) return;
    if (!this.isAllowedAuthor(message.author.id)) return;

    const body = message.content.slice(appConfig.commandPrefix.length).trim();
    try {
      if (!body) {
        await this.sendHelp(message);
        return;
      }

      if (body === "help") {
        await this.sendHelp(message);
        return;
      }

      if (body === "status") {
        await this.sendStatus(message);
        return;
      }

      if (body === "stop") {
        const activeRuns = this.runtime.getActiveRuns();
        if (!activeRuns.length) {
          await message.channel.send("Kein aktiver Stream.");
          return;
        }

        if (activeRuns.length === 1) {
          const stopped = this.service.stopActiveForBot(
            "manual-stop",
            activeRuns[0].botId,
          );
          await message.channel.send(
            stopped
              ? `Stream wird gestoppt: ${activeRuns[0].channelName}`
              : "Kein aktiver Stream.",
          );
          return;
        }

        const stoppedCount = this.service.stopAllActive();
        await message.channel.send(
          stoppedCount > 0
            ? `${stoppedCount} aktive Streams werden gestoppt.`
            : "Kein aktiver Stream.",
        );
        return;
      }

      if (body === "channels") {
        await this.sendChannelList(message);
        return;
      }

      if (body === "presets") {
        await this.sendPresetList(message);
        return;
      }

      if (body === "events") {
        await this.sendEventList(message);
        return;
      }

      if (body.startsWith("start ")) {
        await this.startManualFromCommand(message, body.slice("start ".length));
        return;
      }

      if (body.startsWith("event start ")) {
        const id = body.slice("event start ".length).trim();
        await this.service.startScheduledEvent(id);
        await message.channel.send(`Event ${id} wird gestartet.`);
        return;
      }

      if (body.startsWith("event cancel ")) {
        const id = body.slice("event cancel ".length).trim();
        await this.service.cancelEvent(id);
        await message.channel.send(`Event ${id} wurde abgebrochen.`);
        return;
      }

      // ── Queue Commands ────────────────────────────────────
      if (body === "queue") {
        await this.sendQueue(message);
        return;
      }

      if (body.startsWith("queue add ")) {
        const urlPart = body.slice("queue add ".length).trim();
        const segments = splitSegments(urlPart);
        const url = segments[0];
        const name = segments[1];
        if (!url) {
          await message.channel.send(
            "Bitte URL angeben: queue add <url> | [name]",
          );
          return;
        }
        const item = this.service.addToQueue(url, name);
        await message.channel.send(`Queue: "${item.name}" hinzugefuegt.`);
        return;
      }

      if (body === "queue clear") {
        this.service.clearQueue();
        await message.channel.send("Queue geleert.");
        return;
      }

      if (body === "queue skip") {
        await this.service.skipQueueItem();
        await message.channel.send("Queue: naechstes Item.");
        return;
      }

      if (body.startsWith("queue start ")) {
        const segments = splitSegments(body.slice("queue start ".length));
        if (segments.length < 2) {
          await message.channel.send("Nutzung: queue start <kanal> | <preset>");
          return;
        }
        const state = this.store.snapshot();
        const channel = this.resolveChannel(segments[0]);
        const preset = this.resolvePreset(segments[1]);
        await this.service.startQueue(channel.id, preset.id);
        await message.channel.send(
          `Queue gestartet: ${state.queue.length} Items in ${channel.name}`,
        );
        return;
      }

      if (body === "queue stop") {
        this.service.stopQueue();
        await message.channel.send("Queue gestoppt.");
        return;
      }

      if (body === "queue loop on") {
        this.service.setQueueLoop(true);
        await message.channel.send("Queue Loop: AN");
        return;
      }

      if (body === "queue loop off") {
        this.service.setQueueLoop(false);
        await message.channel.send("Queue Loop: AUS");
        return;
      }

      // ── Info / Logs / Restart ─────────────────────────────
      if (body === "info") {
        await this.sendSystemInfo(message);
        return;
      }

      if (body.startsWith("logs")) {
        const countStr = body.slice("logs".length).trim();
        const count = Math.min(Number.parseInt(countStr, 10) || 5, 20);
        await this.sendLogs(message, count);
        return;
      }

      if (body === "restart" || body.startsWith("restart ")) {
        await this.restartActive(
          message,
          body === "restart" ? undefined : body.slice("restart ".length),
        );
        return;
      }

      await message.channel.send("Unbekannter Befehl. Nutze 'help'.");
    } catch (error: unknown) {
      const command = body || "help";
      const messageText =
        error instanceof Error ? error.message : "Unbekannter Fehler";
      this.store.appendLog("warn", "Discord command failed", {
        command,
        error: messageText,
      });
      await message.channel.send(`Fehler: ${messageText}`);
    }
  };

  private isAllowedAuthor(authorId: string) {
    const allowed = new Set(appConfig.commandAllowedAuthorIds);
    for (const botId of this.selfbotListenerIds) {
      const userId = this.runtime.getClient(botId).user?.id;
      if (userId) {
        allowed.add(userId);
      }
    }
    return allowed.has(authorId);
  }

  private resolveChannel(query: string) {
    const channels = this.service.snapshot().channels;
    return this.resolveByQuery(channels, query, (item) => item.name, "channel");
  }

  private resolvePreset(query: string) {
    const presets = this.service.snapshot().presets;
    return this.resolveByQuery(presets, query, (item) => item.name, "preset");
  }

  private resolveByQuery<T extends { id: string }>(
    items: T[],
    query: string,
    label: (item: T) => string,
    typeName: string,
  ) {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Error(`${typeName} query is required`);
    }

    const byId = items.find((item) => item.id === trimmed);
    if (byId) return byId;

    const matches = items.filter((item) => matchesQuery(label(item), trimmed));
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new Error(`Multiple ${typeName}s match "${trimmed}"`);
    }

    throw new Error(`${typeName} not found: ${trimmed}`);
  }

  private async sendHelp(message: CommandMessageLike) {
    const prefix = appConfig.commandPrefix;
    await message.channel.send(
      [
        `Befehle mit ${prefix}`,
        `${prefix} help`,
        `${prefix} status`,
        `${prefix} start <kanal|id> | <preset|id> | [zeit]`,
        `${prefix} stop`,
        `${prefix} restart [bot|kanal|id]`,
        `${prefix} channels`,
        `${prefix} presets`,
        `${prefix} events`,
        `${prefix} event start <event-id>`,
        `${prefix} event cancel <event-id>`,
        `${prefix} queue`,
        `${prefix} queue add <url> | [name]`,
        `${prefix} queue start <kanal> | <preset>`,
        `${prefix} queue stop`,
        `${prefix} queue skip`,
        `${prefix} queue clear`,
        `${prefix} queue loop on/off`,
        `${prefix} info`,
        `${prefix} logs [n]`,
      ].join("\n"),
    );
  }

  private async sendStatus(message: CommandMessageLike) {
    const state = this.service.snapshot();
    const activeRuns = state.runtime.activeRuns ?? [];
    if (!activeRuns.length) {
      await message.channel.send("Kein aktiver Stream.");
      return;
    }

    await message.channel.send(
      [
        `Aktive Streams: ${activeRuns.length}`,
        ...activeRuns
          .slice(0, 8)
          .map(
            (run, index) =>
              `${index + 1}. ${run.botName} | ${run.channelName} -> ${run.presetName} | ${run.status} | ${formatDate(run.startedAt)}${
                run.plannedStopAt
                  ? ` | Stop ${formatDate(run.plannedStopAt)}`
                  : ""
              }`,
          ),
      ].join("\n"),
    );
  }

  private async sendChannelList(message: CommandMessageLike) {
    const lines = this.service
      .snapshot()
      .channels.slice(0, 12)
      .map((channel) => `${channel.name} | ${channel.id} | ${channel.botId}`);
    await message.channel.send(
      lines.length ? lines.join("\n") : "Keine Kanaele konfiguriert.",
    );
  }

  private async sendPresetList(message: CommandMessageLike) {
    const lines = this.service
      .snapshot()
      .presets.slice(0, 12)
      .map((preset) => `${preset.name} | ${preset.id} | ${preset.sourceMode}`);
    await message.channel.send(
      lines.length ? lines.join("\n") : "Keine Presets konfiguriert.",
    );
  }

  private async sendEventList(message: CommandMessageLike) {
    const now = Date.now();
    const events = this.service
      .snapshot()
      .events.filter(
        (event) => event.status === "running" || Date.parse(event.endAt) > now,
      )
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
      .slice(0, 12);

    const lines = events.map((event) => this.formatEventLine(event));
    await message.channel.send(
      lines.length ? lines.join("\n") : "Keine kommenden Events.",
    );
  }

  private formatEventLine(event: ScheduledEvent) {
    return `${event.name} | ${event.id} | ${event.status} | ${formatDate(event.startAt)} -> ${formatDate(event.endAt)}`;
  }

  private async startManualFromCommand(
    message: CommandMessageLike,
    rawArgs: string,
  ) {
    const [channelQuery, presetQuery, stopAtRaw] = splitSegments(rawArgs);
    if (!channelQuery || !presetQuery) {
      throw new Error("Use: start <channel|id> | <preset|id> | [stopAt]");
    }

    const channel = this.resolveChannel(channelQuery);
    const preset = this.resolvePreset(presetQuery);
    const stopAt = stopAtRaw ? new Date(stopAtRaw) : undefined;
    if (stopAtRaw && (!stopAt || Number.isNaN(stopAt.getTime()))) {
      throw new Error("stopAt must be a valid date/time");
    }

    await this.service.startManualRun({
      channelId: channel.id,
      presetId: preset.id,
      stopAt: stopAt?.toISOString(),
    });

    await message.channel.send(
      [
        `Stream startet: ${channel.name}`,
        `Bot: ${channel.botId}`,
        `Preset: ${preset.name}`,
        stopAt
          ? `Stop um: ${formatDate(stopAt.toISOString())}`
          : "Stop: manuell",
      ].join("\n"),
    );
  }

  private async sendQueue(message: CommandMessageLike) {
    const state = this.store.snapshot();
    const { queue, queueConfig } = state;
    if (!queue.length) {
      await message.channel.send("Queue ist leer.");
      return;
    }
    const lines = queue.slice(0, 15).map((item, i) => {
      const marker =
        queueConfig.active && i === queueConfig.currentIndex ? ">" : " ";
      const status =
        item.status === "playing"
          ? "[SPIELT]"
          : item.status === "completed"
            ? "[FERTIG]"
            : item.status === "failed"
              ? "[FEHLER]"
              : item.status === "skipped"
                ? "[SKIP]"
                : "";
      return `${marker} ${i + 1}. ${item.name} ${status}`;
    });
    const header = queueConfig.active
      ? `Queue (aktiv auf ${queueConfig.botId ?? "unbekannt"}, ${queueConfig.loop ? "Loop AN" : "Loop AUS"})`
      : `Queue (${queue.length} Items)`;
    await message.channel.send([header, ...lines].join("\n"));
  }

  private async sendSystemInfo(message: CommandMessageLike) {
    const state = this.store.snapshot();
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const mem = process.memoryUsage();
    const rss = Math.round(mem.rss / 1024 / 1024);
    const heap = Math.round(mem.heapUsed / 1024 / 1024);

    const activeRuns = state.runtime.activeRuns ?? [];
    const encoderSummary = activeRuns.length
      ? activeRuns
          .map(
            (run) =>
              `${run.botName}:${state.runtime.selectedVideoEncodersByBot?.[run.botId] ?? "idle"}`,
          )
          .join(", ")
      : (state.runtime.selectedVideoEncoder ?? "idle");

    await message.channel.send(
      [
        "System Info",
        `Discord: ${state.runtime.discordStatus}`,
        `Control Bot: ${
          state.runtime.controlBotEnabled
            ? `${state.runtime.controlBotStatus ?? "connecting"}${state.runtime.controlBotUserTag ? ` (${state.runtime.controlBotUserTag})` : ""}`
            : "aus"
        }`,
        `yt-dlp: ${state.runtime.ytDlpAvailable ? `ja (${state.runtime.ytDlpVersion ?? "Version unbekannt"})` : "nein"}`,
        `Panel Login: ${state.runtime.panelAuthEnabled ? "an" : "aus"}`,
        `Aktive Streams: ${activeRuns.length}`,
        `Encoder: ${encoderSummary} (bevorzugt: ${state.runtime.preferredHardwareEncoder ?? "auto"})`,
        `Kanaele: ${state.channels.length}`,
        `Presets: ${state.presets.length}`,
        `Events: ${state.events.length}`,
        `Queue: ${state.queue.length}`,
        `Uptime: ${hours}h ${minutes}m`,
        `RAM: ${rss} MB (Heap: ${heap} MB)`,
      ].join("\n"),
    );
  }

  private async sendLogs(message: CommandMessageLike, count: number) {
    const logs = this.store.snapshot().logs.slice(0, count);
    if (!logs.length) {
      await message.channel.send("Keine Logs vorhanden.");
      return;
    }
    const lines = logs.map(
      (log) =>
        `[${log.level.toUpperCase()}] ${formatDate(log.createdAt)} ${log.message}`,
    );
    const text = lines.join("\n");
    await message.channel.send(
      text.length > 1900 ? `${text.slice(0, 1900)}...` : text,
    );
  }

  private resolveActiveRun(query?: string) {
    const activeRuns = this.runtime.getActiveRuns();
    if (!activeRuns.length) {
      throw new Error("Kein aktiver Stream zum Neustarten.");
    }

    const trimmed = query?.trim();
    if (!trimmed) {
      if (activeRuns.length > 1) {
        throw new Error("Mehrere Streams aktiv. Nutze: restart <bot|kanal|id>");
      }
      return activeRuns[0];
    }

    const exact = activeRuns.find(
      (run) =>
        run.botId === trimmed ||
        run.channelId === trimmed ||
        run.presetId === trimmed,
    );
    if (exact) return exact;

    const matches = activeRuns.filter(
      (run) =>
        matchesQuery(run.botName, trimmed) ||
        matchesQuery(run.channelName, trimmed) ||
        matchesQuery(run.presetName, trimmed) ||
        matchesQuery(run.botId, trimmed) ||
        matchesQuery(run.channelId, trimmed) ||
        matchesQuery(run.presetId, trimmed),
    );
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new Error(`Mehrere aktive Streams passen zu "${trimmed}"`);
    }
    throw new Error(`Kein aktiver Stream passt zu "${trimmed}"`);
  }

  private async restartActive(message: CommandMessageLike, query?: string) {
    const run = this.resolveActiveRun(query);
    const stopAt = run.plannedStopAt;
    const state = this.store.snapshot();
    const channel = state.channels.find((entry) => entry.id === run.channelId);
    const preset = state.presets.find((entry) => entry.id === run.presetId);
    if (!channel || !preset) {
      await message.channel.send(
        "Neustart nicht moeglich: Kanal oder Preset nicht mehr vorhanden.",
      );
      return;
    }

    this.service.stopActiveForBot("manual-stop", run.botId);
    await message.channel.send(
      `Stream wird neugestartet: ${run.botName} | ${run.channelName} -> ${run.presetName}`,
    );

    setTimeout(async () => {
      try {
        await this.service.startManualRun({
          channelId: channel.id,
          presetId: preset.id,
          stopAt,
        });
      } catch {
        await message.channel.send("Neustart fehlgeschlagen.");
      }
    }, 2000);
  }
}
