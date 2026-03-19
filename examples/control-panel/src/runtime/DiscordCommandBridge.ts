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
        `${prefix} channels`,
        `${prefix} presets`,
        `${prefix} events`,
        `${prefix} event start <event-id>`,
        `${prefix} event cancel <event-id>`,
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
}
