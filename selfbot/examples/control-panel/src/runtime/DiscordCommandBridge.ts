import type { Message } from "discord.js-selfbot-v13";
import { appConfig } from "../config/appConfig.js";
import type {
  ChannelDefinition,
  ScheduledEvent,
  StreamPreset,
} from "../domain/types.js";
import { ControlPanelService } from "../services/ControlPanelService.js";
import { AppStateStore } from "../state/AppStateStore.js";
import { StreamRuntime } from "./StreamRuntime.js";

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
  return normalizedValue === normalizedQuery || normalizedValue.includes(normalizedQuery);
}

export class DiscordCommandBridge {
  private started = false;

  constructor(
    private readonly runtime: StreamRuntime,
    private readonly service: ControlPanelService,
    private readonly store: AppStateStore,
  ) {}

  public start() {
    if (!appConfig.commandEnabled || this.started) return;
    this.started = true;
    this.runtime.getClient().on("messageCreate", this.handleMessage);
    this.store.appendLog("info", "Discord command bridge enabled", {
      prefix: appConfig.commandPrefix,
    });
  }

  private readonly handleMessage = async (message: Message) => {
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
        const stopped = this.service.stopActive();
        await message.channel.send(
          stopped ? "Aktiver Stream wird gestoppt." : "Kein aktiver Stream.",
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
          await message.channel.send("Bitte URL angeben: queue add <url> | [name]");
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

      if (body === "restart") {
        const run = this.runtime.getActiveRun();
        if (!run) {
          await message.channel.send("Kein aktiver Stream zum Neustarten.");
          return;
        }
        const channelName = run.channelName;
        const presetName = run.presetName;
        this.service.stopActive();
        await message.channel.send(
          `Stream wird neugestartet: ${channelName} → ${presetName}`,
        );
        // startRun picks up from the saved channel + preset
        const state = this.store.snapshot();
        const ch = state.channels.find((c) => c.name === channelName);
        const pr = state.presets.find((p) => p.name === presetName);
        if (ch && pr) {
          setTimeout(async () => {
            try {
              await this.service.startManualRun({
                channelId: ch.id,
                presetId: pr.id,
              });
            } catch {
              await message.channel.send("Neustart fehlgeschlagen.");
            }
          }, 2000);
        }
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
    const clientUserId = this.runtime.getClient().user?.id;
    const allowed = new Set(appConfig.commandAllowedAuthorIds);
    if (clientUserId) {
      allowed.add(clientUserId);
    }
    return allowed.has(authorId);
  }

  private resolveChannel(query: string) {
    const channels = this.service.snapshot().channels;
    return this.resolveByQuery(
      channels,
      query,
      (item) => item.name,
      "channel",
    );
  }

  private resolvePreset(query: string) {
    const presets = this.service.snapshot().presets;
    return this.resolveByQuery(
      presets,
      query,
      (item) => item.name,
      "preset",
    );
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

  private async sendHelp(message: Message) {
    const prefix = appConfig.commandPrefix;
    await message.channel.send(
      [
        `Befehle mit ${prefix}`,
        `${prefix} help`,
        `${prefix} status`,
        `${prefix} start <kanal|id> | <preset|id> | [zeit]`,
        `${prefix} stop`,
        `${prefix} restart`,
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

  private async sendStatus(message: Message) {
    const state = this.service.snapshot();
    const activeRun = state.runtime.activeRun;
    if (!activeRun) {
      await message.channel.send("Kein aktiver Stream.");
      return;
    }

    await message.channel.send(
      [
        `Aktiv: ${activeRun.channelName} -> ${activeRun.presetName}`,
        `Status: ${activeRun.status}`,
        `Seit: ${formatDate(activeRun.startedAt)}`,
        activeRun.plannedStopAt
          ? `Geplantes Ende: ${formatDate(activeRun.plannedStopAt)}`
          : "Geplantes Ende: offen",
      ].join("\n"),
    );
  }

  private async sendChannelList(message: Message) {
    const lines = this.service.snapshot().channels
      .slice(0, 12)
      .map((channel) => `${channel.name} | ${channel.id}`);
    await message.channel.send(
      lines.length ? lines.join("\n") : "Keine Kanaele konfiguriert.",
    );
  }

  private async sendPresetList(message: Message) {
    const lines = this.service.snapshot().presets
      .slice(0, 12)
      .map((preset) => `${preset.name} | ${preset.id} | ${preset.sourceMode}`);
    await message.channel.send(
      lines.length ? lines.join("\n") : "Keine Presets konfiguriert.",
    );
  }

  private async sendEventList(message: Message) {
    const now = Date.now();
    const events = this.service.snapshot().events
      .filter((event) => event.status === "running" || Date.parse(event.endAt) > now)
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

  private async startManualFromCommand(message: Message, rawArgs: string) {
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
        `Preset: ${preset.name}`,
        stopAt ? `Stop um: ${formatDate(stopAt.toISOString())}` : "Stop: manuell",
      ].join("\n"),
    );
  }

  private async sendQueue(message: Message) {
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
      ? `Queue (aktiv, ${queueConfig.loop ? "Loop AN" : "Loop AUS"})`
      : `Queue (${queue.length} Items)`;
    await message.channel.send([header, ...lines].join("\n"));
  }

  private async sendSystemInfo(message: Message) {
    const state = this.store.snapshot();
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const mem = process.memoryUsage();
    const rss = Math.round(mem.rss / 1024 / 1024);
    const heap = Math.round(mem.heapUsed / 1024 / 1024);

    await message.channel.send(
      [
        "System Info",
        `Discord: ${state.runtime.discordStatus}`,
        `yt-dlp: ${state.runtime.ytDlpAvailable ? `ja (${state.runtime.ytDlpVersion ?? "Version unbekannt"})` : "nein"}`,
        `Kanaele: ${state.channels.length}`,
        `Presets: ${state.presets.length}`,
        `Events: ${state.events.length}`,
        `Queue: ${state.queue.length}`,
        `Uptime: ${hours}h ${minutes}m`,
        `RAM: ${rss} MB (Heap: ${heap} MB)`,
      ].join("\n"),
    );
  }

  private async sendLogs(message: Message, count: number) {
    const logs = this.store.snapshot().logs.slice(-count);
    if (!logs.length) {
      await message.channel.send("Keine Logs vorhanden.");
      return;
    }
    const lines = logs.map(
      (log) => `[${log.level.toUpperCase()}] ${formatDate(log.createdAt)} ${log.message}`,
    );
    const text = lines.join("\n");
    await message.channel.send(
      text.length > 1900 ? text.slice(0, 1900) + "..." : text,
    );
  }
}
