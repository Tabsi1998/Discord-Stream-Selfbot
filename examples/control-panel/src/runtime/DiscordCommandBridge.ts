import {
  Client as ControlBotClient,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message as ControlBotMessage,
} from "discord.js";
import type { Message as SelfbotMessage } from "discord.js-selfbot-v13";
import { appConfig } from "../config/appConfig.js";
import type {
  ChannelDefinition,
  QuickPlayQualityOption,
  ScheduledEvent,
} from "../domain/types.js";
import type { ControlPanelService } from "../services/ControlPanelService.js";
import type { AppStateStore } from "../state/AppStateStore.js";
import type { StreamRuntime } from "./StreamRuntime.js";

type CommandMessageLike = {
  content: string;
  author: {
    id: string;
    bot?: boolean;
  };
  guildId?: string;
  guildName?: string;
  voiceChannelId?: string;
  voiceChannelName?: string;
  channel: {
    send(content: string): Promise<unknown>;
  };
};

type CommandPrefixMatch = {
  matchedPrefix: string;
  body: string;
};

type SlashGuildSelection = {
  guildIds: string[];
  source: "explicit" | "configured-channels" | "single-guild" | "none";
};

const CONTROL_BOT_SLASH_COMMANDS = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Zeigt die verfuegbaren Stream-Befehle an")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("whoami")
    .setDescription("Zeigt deine Discord-ID und Freigabe an")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Zeigt den aktuellen Stream-Status")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Startet eine URL im aktuellen Voice-Channel")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Direkte URL oder YouTube-Link")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("stop_at")
        .setDescription("Optionale Stoppzeit, z.B. 2026-04-30 22:30"),
    )
    .addStringOption((option) =>
      option
        .setName("quality")
        .setDescription("Optionale Zielqualitaet fuer Quick Play")
        .addChoices(...QUICK_PLAY_QUALITY_CHOICES),
    ),
  new SlashCommandBuilder()
    .setName("start")
    .setDescription("Startet einen gespeicherten Kanal mit einem Preset")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("channel")
        .setDescription("Kanalname oder interne ID")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("preset")
        .setDescription("Preset-Name oder interne ID")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("stop_at")
        .setDescription("Optionale Stoppzeit, z.B. 2026-04-30 22:30"),
    ),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stoppt aktive Streams")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Startet einen aktiven Stream neu")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("target")
        .setDescription(
          "Optional: Bot, Kanal oder Preset eines aktiven Streams",
        ),
    ),
  new SlashCommandBuilder()
    .setName("channels")
    .setDescription("Listet konfigurierte Kanaele auf")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("presets")
    .setDescription("Listet konfigurierte Presets auf")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("events")
    .setDescription("Listet kommende Events auf")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("event")
    .setDescription("Steuert geplante Events")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Startet ein Event sofort")
        .addStringOption((option) =>
          option.setName("id").setDescription("Event-ID").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Bricht ein Event ab")
        .addStringOption((option) =>
          option.setName("id").setDescription("Event-ID").setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Steuert die Stream-Queue")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Zeigt die Queue an"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Fuegt eine URL zur Queue hinzu")
        .addStringOption((option) =>
          option.setName("url").setDescription("Queue-URL").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("name").setDescription("Optionaler Anzeigename"),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Startet die Queue")
        .addStringOption((option) =>
          option
            .setName("channel")
            .setDescription("Kanalname oder interne ID")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("preset")
            .setDescription("Preset-Name oder interne ID")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stop").setDescription("Stoppt die Queue"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("skip")
        .setDescription("Springt zum naechsten Queue-Item"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("clear").setDescription("Leert die Queue"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("loop")
        .setDescription("Schaltet den Queue-Loop um")
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Loop aktivieren")
            .setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Zeigt Runtime- und System-Infos")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Zeigt die neuesten Logs")
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription("Anzahl der Logeintraege")
        .setMinValue(1)
        .setMaxValue(20),
    ),
].map((command) => command.toJSON());

const DISCORD_MESSAGE_LIMIT = 1900;

const QUICK_PLAY_QUALITY_CHOICES = [
  { name: "Auto", value: "auto" },
  { name: "720p / 30 FPS", value: "720p30" },
  { name: "720p / 60 FPS", value: "720p60" },
  { name: "1080p / 30 FPS", value: "1080p30" },
  { name: "1080p / 60 FPS", value: "1080p60" },
  { name: "1440p / 30 FPS", value: "1440p30" },
  { name: "1440p / 60 FPS", value: "1440p60" },
] as const;

function isQuickPlayQualityOption(
  value: string | undefined,
): value is QuickPlayQualityOption {
  const normalized = value?.trim().toLowerCase();
  return (
    !!normalized &&
    QUICK_PLAY_QUALITY_CHOICES.some((entry) => entry.value === normalized)
  );
}

function splitDiscordMessage(content: string, limit = DISCORD_MESSAGE_LIMIT) {
  const normalized = content.replaceAll("\r\n", "\n").trim();
  if (!normalized) {
    return ["(leer)"];
  }

  const lines = normalized.split("\n");
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const line of lines) {
    if (line.length > limit) {
      flush();
      for (let index = 0; index < line.length; index += limit) {
        chunks.push(line.slice(index, index + limit));
      }
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit) {
      flush();
      current = line;
    } else {
      current = candidate;
    }
  }

  flush();
  return chunks.length ? chunks : ["(leer)"];
}

function truncateCommandError(message: string, limit = 900) {
  const normalized = message.replaceAll(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}... Siehe Logs im Panel fuer Details.`;
}

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
    guildId:
      "guildId" in message && typeof message.guildId === "string"
        ? message.guildId
        : undefined,
    guildName:
      "guild" in message &&
      message.guild &&
      typeof message.guild === "object" &&
      "name" in message.guild &&
      typeof message.guild.name === "string"
        ? message.guild.name
        : undefined,
    voiceChannelId:
      "member" in message &&
      message.member &&
      typeof message.member === "object" &&
      "voice" in message.member &&
      message.member.voice &&
      typeof message.member.voice === "object" &&
      "channelId" in message.member.voice &&
      typeof message.member.voice.channelId === "string"
        ? message.member.voice.channelId
        : undefined,
    voiceChannelName:
      "member" in message &&
      message.member &&
      typeof message.member === "object" &&
      "voice" in message.member &&
      message.member.voice &&
      typeof message.member.voice === "object" &&
      "channel" in message.member.voice &&
      message.member.voice.channel &&
      typeof message.member.voice.channel === "object" &&
      "name" in message.member.voice.channel &&
      typeof message.member.voice.channel.name === "string"
        ? message.member.voice.channel.name
        : undefined,
    channel: {
      send: async (content: string) => {
        let result: unknown;
        for (const chunk of splitDiscordMessage(content)) {
          result = await channel.send(chunk);
        }
        return result;
      },
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

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function parseQuickPlayArgs(rawArgs: string) {
  const [url, ...rest] = splitSegments(rawArgs);
  let stopAtRaw: string | undefined;
  let quality: QuickPlayQualityOption | undefined;

  for (const segment of rest) {
    if (isQuickPlayQualityOption(segment)) {
      if (quality) {
        throw new Error("quality was provided more than once");
      }
      quality = segment.trim().toLowerCase() as QuickPlayQualityOption;
      continue;
    }
    if (stopAtRaw) {
      throw new Error("Use: play <url> | [stopAt] | [quality]");
    }
    stopAtRaw = segment;
  }

  return {
    url,
    stopAtRaw,
    quality,
  };
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
  private readonly controlBotExclusiveMode = !!appConfig.controlBotToken;
  private readonly selfbotListeners = appConfig.selfbotProfiles
    .filter((profile) => profile.commandEnabled)
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
    }));
  private readonly rejectedCommandTimestamps = new Map<string, number>();

  constructor(
    private readonly runtime: StreamRuntime,
    private readonly service: ControlPanelService,
    private readonly store: AppStateStore,
  ) {}

  public start() {
    if (!appConfig.commandEnabled || this.started) return;
    this.started = true;
    if (!this.controlBotExclusiveMode) {
      for (const listener of this.selfbotListeners) {
        this.runtime
          .getClient(listener.id)
          .on("messageCreate", this.handleSelfbotMessage);
      }
    }
    if (appConfig.controlBotToken) {
      this.startControlBot();
    } else {
      this.store.setRuntime((runtime) => {
        runtime.controlBotStatus = "disabled";
        runtime.controlBotEnabled = false;
        runtime.controlBotUserTag = undefined;
        runtime.controlBotUserId = undefined;
        runtime.controlBotSlashEnabled = false;
        runtime.controlBotSlashStatus = "disabled";
        runtime.controlBotSlashGuildIds = [];
        runtime.commandMentionPrefix = undefined;
      });
    }
    this.store.appendLog("info", "Discord command bridge enabled", {
      prefixes: appConfig.commandPrefixes.join(","),
      selfbotListeners: !this.controlBotExclusiveMode
        ? this.selfbotListeners.map((listener) => listener.id).join(",") ||
          "none"
        : "disabled (control-bot-only)",
      mode: this.controlBotExclusiveMode ? "control-bot-only" : "selfbot+bot",
      controlBot: appConfig.controlBotToken ? "enabled" : "disabled",
    });
  }

  private readonly handleSelfbotMessage = async (message: SelfbotMessage) => {
    if (this.controlBotExclusiveMode) {
      return;
    }
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

  private readonly handleControlBotInteraction = async (
    interaction: ChatInputCommandInteraction,
  ) => {
    const commandMessage = this.toInteractionCommandMessage(interaction);
    if (!commandMessage) return;

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({
          ephemeral: true,
        });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to defer interaction";
      this.store.appendLog("warn", "Discord interaction setup failed", {
        command: interaction.commandName,
        error: message,
      });
      return;
    }

    const allowedAuthor = this.isAllowedAuthor(commandMessage.author.id);
    const body = this.buildSlashCommandBody(interaction);
    if (!body) return;

    try {
      await this.executeCommand(commandMessage, body, "/", allowedAuthor);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Discord interaction command execution failed";
      this.store.appendLog("warn", "Discord interaction execution failed", {
        command: interaction.commandName,
        error: message,
      });
    }
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
        GatewayIntentBits.GuildVoiceStates,
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
        runtime.commandMentionPrefix = `<@${userId}>`;
      });
      this.store.appendLog("info", "Discord control bot ready", {
        userTag,
        userId,
      });
      void this.syncControlBotSlashCommands(client).catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Control bot slash command sync failed";
        this.store.setRuntime((runtime) => {
          runtime.controlBotSlashEnabled = true;
          runtime.controlBotSlashStatus = "error";
          runtime.controlBotSlashGuildIds = [];
        });
        this.store.appendLog("error", "Control bot slash command sync failed", {
          error: message,
        });
      });
    });

    client.on("error", (error: Error) => {
      this.store.setRuntime((runtime) => {
        runtime.controlBotEnabled = true;
        runtime.controlBotStatus = "error";
        runtime.controlBotSlashEnabled = true;
        runtime.controlBotSlashStatus = "error";
        runtime.controlBotSlashGuildIds = [];
        runtime.commandMentionPrefix = undefined;
      });
      this.store.appendLog("error", "Discord control bot failed", {
        error: error.message,
      });
    });

    client.on("messageCreate", this.handleControlBotMessage);
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) {
        return;
      }
      await this.handleControlBotInteraction(interaction);
    });

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
        runtime.controlBotSlashEnabled = true;
        runtime.controlBotSlashStatus = "error";
        runtime.controlBotSlashGuildIds = [];
        runtime.commandMentionPrefix = undefined;
      });
      this.store.appendLog("error", "Discord control bot login failed", {
        error: message,
      });
    }
  }

  private readonly handleMessage = async (message: CommandMessageLike) => {
    const match = this.extractCommandPrefix(message.content);
    if (!match) return;

    await this.executeCommand(
      message,
      match.body,
      match.matchedPrefix,
      this.isAllowedAuthor(message.author.id),
    );
  };

  private async executeCommand(
    message: CommandMessageLike,
    body: string,
    matchedPrefix: string,
    allowedAuthor: boolean,
  ) {
    try {
      if (body === "whoami") {
        await this.sendWhoAmI(message, matchedPrefix, allowedAuthor);
        return;
      }

      if (!allowedAuthor) {
        this.recordRejectedCommand(
          message.author.id,
          matchedPrefix,
          "author-not-allowed",
        );
        return;
      }

      if (!body || body === "help") {
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

      if (body.startsWith("play ")) {
        await this.playFromCommand(message, body.slice("play ".length));
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

      await message.channel.send(
        `Unbekannter Befehl. Nutze '${appConfig.commandPrefix} help'.`,
      );
    } catch (error: unknown) {
      const command = body || "help";
      const messageText =
        error instanceof Error ? error.message : "Unbekannter Fehler";
      this.store.appendLog("warn", "Discord command failed", {
        command,
        error: messageText,
      });
      await message.channel.send(
        `Fehler: ${truncateCommandError(messageText)}`,
      );
    }
  }

  private toInteractionCommandMessage(
    interaction: ChatInputCommandInteraction,
  ): CommandMessageLike {
    const member = interaction.member;
    return {
      content: "",
      author: {
        id: interaction.user.id,
        bot: interaction.user.bot,
      },
      guildId: interaction.guildId ?? undefined,
      guildName: interaction.guild?.name,
      voiceChannelId:
        member &&
        typeof member === "object" &&
        "voice" in member &&
        member.voice &&
        typeof member.voice === "object" &&
        "channelId" in member.voice &&
        typeof member.voice.channelId === "string"
          ? member.voice.channelId
          : undefined,
      voiceChannelName:
        member &&
        typeof member === "object" &&
        "voice" in member &&
        member.voice &&
        typeof member.voice === "object" &&
        "channel" in member.voice &&
        member.voice.channel &&
        typeof member.voice.channel === "object" &&
        "name" in member.voice.channel &&
        typeof member.voice.channel.name === "string"
          ? member.voice.channel.name
          : undefined,
      channel: {
        send: async (content: string) =>
          this.replyToInteraction(interaction, content),
      },
    };
  }

  private async replyToInteraction(
    interaction: ChatInputCommandInteraction,
    content: string,
  ) {
    const chunks = splitDiscordMessage(content);
    let result: unknown;

    for (const [index, chunk] of chunks.entries()) {
      if (index === 0 && interaction.deferred && !interaction.replied) {
        result = await interaction.editReply({
          content: chunk,
        });
        continue;
      }

      if (index === 0 && !interaction.replied && !interaction.deferred) {
        result = await interaction.reply({
          content: chunk,
          ephemeral: true,
        });
        continue;
      }

      result = await interaction.followUp({
        content: chunk,
        ephemeral: true,
      });
    }

    return result;
  }

  private buildSlashCommandBody(interaction: ChatInputCommandInteraction) {
    switch (interaction.commandName) {
      case "help":
      case "whoami":
      case "status":
      case "stop":
      case "channels":
      case "presets":
      case "events":
      case "info":
        return interaction.commandName;
      case "play": {
        const url = interaction.options.getString("url", true);
        const stopAt = interaction.options.getString("stop_at");
        const quality = interaction.options.getString("quality");
        const segments = [url];
        if (stopAt) {
          segments.push(stopAt);
        }
        if (quality) {
          segments.push(quality);
        }
        return `play ${segments.join(" | ")}`;
      }
      case "start": {
        const channel = interaction.options.getString("channel", true);
        const preset = interaction.options.getString("preset", true);
        const stopAt = interaction.options.getString("stop_at");
        return stopAt
          ? `start ${channel} | ${preset} | ${stopAt}`
          : `start ${channel} | ${preset}`;
      }
      case "restart": {
        const target = interaction.options.getString("target");
        return target ? `restart ${target}` : "restart";
      }
      case "logs": {
        const count = interaction.options.getInteger("count");
        return count ? `logs ${count}` : "logs";
      }
      case "event": {
        const subcommand = interaction.options.getSubcommand();
        const id = interaction.options.getString("id", true);
        return `event ${subcommand} ${id}`;
      }
      case "queue": {
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
          case "status":
            return "queue";
          case "stop":
          case "skip":
          case "clear":
            return `queue ${subcommand}`;
          case "add": {
            const url = interaction.options.getString("url", true);
            const name = interaction.options.getString("name");
            return name ? `queue add ${url} | ${name}` : `queue add ${url}`;
          }
          case "start": {
            const channel = interaction.options.getString("channel", true);
            const preset = interaction.options.getString("preset", true);
            return `queue start ${channel} | ${preset}`;
          }
          case "loop": {
            const enabled = interaction.options.getBoolean("enabled", true);
            return enabled ? "queue loop on" : "queue loop off";
          }
          default:
            return undefined;
        }
      }
      default:
        return undefined;
    }
  }

  private async syncControlBotSlashCommands(client: ControlBotClient) {
    const selection = this.resolveSlashGuildSelection(client);
    const desiredGuildIds = new Set(selection.guildIds);
    const registeredGuildIds: string[] = [];

    this.store.setRuntime((runtime) => {
      runtime.controlBotSlashEnabled = true;
      runtime.controlBotSlashStatus = "pending";
    });

    for (const guild of client.guilds.cache.values()) {
      const commandPayload = desiredGuildIds.has(guild.id)
        ? CONTROL_BOT_SLASH_COMMANDS
        : [];
      await guild.commands.set(commandPayload);
      if (commandPayload.length) {
        registeredGuildIds.push(guild.id);
      }
    }

    const missingGuildIds = selection.guildIds.filter(
      (guildId) => !client.guilds.cache.has(guildId),
    );

    this.store.setRuntime((runtime) => {
      runtime.controlBotSlashEnabled = true;
      runtime.controlBotSlashStatus = registeredGuildIds.length
        ? "ready"
        : "skipped";
      runtime.controlBotSlashGuildIds = registeredGuildIds;
    });

    this.store.appendLog(
      registeredGuildIds.length ? "info" : "warn",
      registeredGuildIds.length
        ? "Control bot slash commands synced"
        : "Control bot slash commands skipped",
      {
        source: selection.source,
        guilds: registeredGuildIds.join(",") || "none",
        missingGuilds: missingGuildIds.join(",") || "",
      },
    );
  }

  private resolveSlashGuildSelection(
    client: ControlBotClient,
  ): SlashGuildSelection {
    if (appConfig.controlBotCommandGuildIds.length) {
      return {
        guildIds: [...new Set(appConfig.controlBotCommandGuildIds)],
        source: "explicit",
      };
    }

    const configuredGuildIds = [
      ...new Set(
        this.service
          .snapshot()
          .channels.map((channel) => channel.guildId)
          .filter(Boolean),
      ),
    ];
    if (configuredGuildIds.length) {
      return {
        guildIds: configuredGuildIds,
        source: "configured-channels",
      };
    }

    if (client.guilds.cache.size === 1) {
      const guild = client.guilds.cache.first();
      if (guild) {
        return {
          guildIds: [guild.id],
          source: "single-guild",
        };
      }
    }

    return {
      guildIds: [],
      source: "none",
    };
  }

  private extractCommandPrefix(
    content: string,
  ): CommandPrefixMatch | undefined {
    const prefixes = [
      ...this.getMentionPrefixes().map((prefix) => ({
        value: prefix,
      })),
      ...appConfig.commandPrefixes.map((prefix) => ({
        value: prefix,
      })),
    ].sort((left, right) => right.value.length - left.value.length);

    for (const prefix of prefixes) {
      if (!content.startsWith(prefix.value)) {
        continue;
      }
      return {
        matchedPrefix: prefix.value,
        body: content.slice(prefix.value.length).trim(),
      };
    }

    return undefined;
  }

  private getMentionPrefixes() {
    const userId = this.controlBotClient?.user?.id;
    if (!userId) {
      return [] as string[];
    }
    return [`<@${userId}>`, `<@!${userId}>`];
  }

  private recordRejectedCommand(
    authorId: string,
    matchedPrefix: string,
    reason: string,
  ) {
    const key = `${authorId}:${matchedPrefix}:${reason}`;
    const now = Date.now();
    const previous = this.rejectedCommandTimestamps.get(key) ?? 0;
    if (now - previous < 30000) {
      return;
    }
    this.rejectedCommandTimestamps.set(key, now);
    this.store.setRuntime((runtime) => {
      runtime.lastRejectedCommandAt = new Date(now).toISOString();
      runtime.lastRejectedCommandAuthorId = authorId;
      runtime.lastRejectedCommandPrefix = matchedPrefix;
      runtime.lastRejectedCommandReason = reason;
    });
    this.store.appendLog("warn", "Discord command rejected", {
      authorId,
      prefix: matchedPrefix,
      reason,
    });
  }

  private isAllowedAuthor(authorId: string) {
    const allowed = new Set(appConfig.commandAllowedAuthorIds);
    for (const listener of this.selfbotListeners) {
      const userId = this.runtime.getClient(listener.id).user?.id;
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

  private resolveVoiceChannelForMessage(message: CommandMessageLike) {
    const state = this.service.snapshot();

    if (message.guildId && message.voiceChannelId) {
      const configured = state.channels.find(
        (channel) =>
          channel.guildId === message.guildId &&
          channel.channelId === message.voiceChannelId,
      );
      if (configured) {
        return {
          channel: configured,
          inferred: false,
        };
      }

      const botId = this.runtime.findBotForGuild(message.guildId);
      if (!botId) {
        throw new Error(
          "Kein konfigurierter Selfbot ist in diesem Server verfuegbar.",
        );
      }
      const timestamp = new Date().toISOString();
      const transientChannel: ChannelDefinition = {
        id: `adhoc-channel:${botId}:${message.guildId}:${message.voiceChannelId}`,
        botId,
        name: message.voiceChannelName?.trim() || "Aktueller Sprachkanal",
        guildId: message.guildId,
        channelId: message.voiceChannelId,
        streamMode: "go-live",
        description: "Temporaerer Command-Kanal",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return {
        channel: transientChannel,
        inferred: true,
      };
    }

    if (state.channels.length === 1) {
      return {
        channel: state.channels[0],
        inferred: false,
      };
    }

    throw new Error(
      "Tritt einem Sprachkanal bei oder nutze: start <kanal|id> | <preset|id>",
    );
  }

  private async playFromCommand(message: CommandMessageLike, rawArgs: string) {
    const { url, stopAtRaw, quality } = parseQuickPlayArgs(rawArgs);
    if (!url || !looksLikeUrl(url)) {
      throw new Error("Use: play <url> | [stopAt] | [quality]");
    }

    const { channel, inferred } = this.resolveVoiceChannelForMessage(message);
    const stopAt = stopAtRaw ? new Date(stopAtRaw) : undefined;
    if (stopAtRaw && (!stopAt || Number.isNaN(stopAt.getTime()))) {
      throw new Error("stopAt must be a valid date/time");
    }

    await this.service.startAdHocRun({
      channel,
      sourceUrl: url,
      stopAt: stopAt?.toISOString(),
      quality,
    });

    await message.channel.send(
      [
        `Ad-hoc Stream startet: ${channel.name}`,
        `Bot: ${channel.botId}`,
        `Quelle: ${url}`,
        `Zielqualitaet: ${quality ?? "auto"}`,
        inferred
          ? "Kanal wurde aus deinem aktuellen Voice-Channel erkannt."
          : "Kanal stammt aus deiner gespeicherten Konfiguration.",
        stopAt
          ? `Stop um: ${formatDate(stopAt.toISOString())}`
          : "Stop: manuell",
      ].join("\n"),
    );
  }

  private async sendWhoAmI(
    message: CommandMessageLike,
    matchedPrefix: string,
    allowedAuthor: boolean,
  ) {
    const authMode = appConfig.commandAllowedAuthorIds.length
      ? "allowlist"
      : "selfbots-only";
    const guide = allowedAuthor
      ? "Du bist fuer Discord-Commands freigeschaltet."
      : authMode === "allowlist"
        ? "Trage diese User-ID in COMMAND_ALLOWED_AUTHOR_IDS ein, um den normalen Bot zu nutzen."
        : "Aktuell sind nur Selfbot-Accounts freigeschaltet. Fuer einen normalen Bot fuege deine User-ID in COMMAND_ALLOWED_AUTHOR_IDS ein.";

    await message.channel.send(
      [
        `Deine Discord-ID: ${message.author.id}`,
        `Erlaubt: ${allowedAuthor ? "ja" : "nein"}`,
        `Auth-Modus: ${authMode}`,
        `Erkanntes Prefix: ${matchedPrefix}`,
        `Primaeres Prefix: ${appConfig.commandPrefix}`,
        ...(message.voiceChannelId
          ? [
              `Aktueller Voice-Channel: ${
                message.voiceChannelName ?? message.voiceChannelId
              }`,
            ]
          : ["Aktueller Voice-Channel: keiner"]),
        guide,
      ].join("\n"),
    );
  }

  private async sendHelp(message: CommandMessageLike) {
    const prefix = appConfig.commandPrefix;
    const aliases = appConfig.commandPrefixes.filter(
      (candidate) => candidate !== prefix,
    );
    const mentionPrefix = this.getMentionPrefixes()[0];
    const slashEnabled =
      !!appConfig.controlBotToken &&
      (appConfig.controlBotCommandGuildIds.length > 0 ||
        this.service.snapshot().channels.length > 0);
    await message.channel.send(
      [
        `Befehle mit ${prefix}`,
        ...(aliases.length ? [`Aliase: ${aliases.join(", ")}`] : []),
        ...(mentionPrefix ? [`Control-Bot Mention: ${mentionPrefix}`] : []),
        ...(slashEnabled
          ? [
              "Guild-gebundene Slash-Commands: /help, /whoami, /play, /start, /stop, /queue, /info",
            ]
          : []),
        `${prefix} help`,
        `${prefix} whoami`,
        `${prefix} play <url> | [zeit] | [qualitaet]`,
        `${prefix} status`,
        `${prefix} start <url> | [zeit] | [qualitaet]`,
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
    const segments = splitSegments(rawArgs);
    const [channelQuery, presetQuery, stopAtRaw] = segments;
    if (channelQuery && looksLikeUrl(channelQuery)) {
      const quickPlayArgs =
        segments.length > 1
          ? `${channelQuery} | ${segments.slice(1).join(" | ")}`
          : channelQuery;
      await this.playFromCommand(message, quickPlayArgs);
      return;
    }

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
    const commandPrefixes = state.runtime.commandPrefixes?.length
      ? state.runtime.commandPrefixes.join(", ")
      : (state.runtime.commandPrefix ?? "aus");
    const commandListeners = state.runtime.commandListenerBotIds?.length
      ? state.runtime.commandListenerBotIds
          .map(
            (botId) =>
              state.runtime.bots?.find((bot) => bot.id === botId)?.name ??
              botId,
          )
          .join(", ")
      : "keine";
    const authMode =
      state.runtime.commandAuthMode === "allowlist"
        ? `allowlist (${state.runtime.commandAuthorIds?.join(", ") || "leer"})`
        : "selfbots-only";

    const activeRuns = state.runtime.activeRuns ?? [];
    const encoderSummary = activeRuns.length
      ? activeRuns
          .map(
            (run) =>
              `${run.botName}:${state.runtime.selectedVideoEncodersByBot?.[run.botId] ?? "idle"}`,
          )
          .join(", ")
      : (state.runtime.selectedVideoEncoder ?? "idle");
    const controlBotLabel = state.runtime.controlBotEnabled
      ? `${state.runtime.controlBotStatus ?? "connecting"}${
          state.runtime.controlBotUserTag
            ? ` (${state.runtime.controlBotUserTag})`
            : ""
        }`
      : "aus";
    const slashLabel = state.runtime.controlBotSlashEnabled
      ? `${state.runtime.controlBotSlashStatus ?? "pending"}${
          state.runtime.controlBotSlashGuildIds?.length
            ? ` (${state.runtime.controlBotSlashGuildIds.length} Server)`
            : ""
        }`
      : "aus";
    const ytDlpLabel = state.runtime.ytDlpAvailable
      ? `ja (${state.runtime.ytDlpVersion ?? "Version unbekannt"})`
      : "nein";

    await message.channel.send(
      [
        "System Info",
        `Discord: ${state.runtime.discordStatus}`,
        `Control Bot: ${controlBotLabel}`,
        `Slash-Commands: ${slashLabel}`,
        `Commands: ${commandPrefixes}`,
        `Command Listener: ${commandListeners}`,
        `Command Auth: ${authMode}`,
        `yt-dlp: ${ytDlpLabel}`,
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
