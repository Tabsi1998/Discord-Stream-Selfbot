import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import type {
  ActiveRun,
  ChannelInput,
  PresetInput,
  VoiceChannelOption,
} from "../src/domain/types.js";
import type { StreamRuntime } from "../src/runtime/StreamRuntime.js";
import { ControlPanelService } from "../src/services/ControlPanelService.js";
import { AppStateStore } from "../src/state/AppStateStore.js";

class RuntimeStub extends EventEmitter {
  private readonly activeRuns = new Map<string, ActiveRun>();

  public readonly stopCalls: Array<{ reason: string; botId?: string }> = [];
  public readonly startCalls: Array<{
    botId: string;
    channelId: string;
    presetId: string;
  }> = [];

  public getPrimaryBotId() {
    return "primary";
  }

  public hasBot(botId: string) {
    return botId === "primary" || botId === "bot-2";
  }

  public async listVoiceChannels(): Promise<VoiceChannelOption[]> {
    return [];
  }

  public getActiveRun(botId?: string) {
    if (botId) {
      return this.activeRuns.get(botId);
    }
    return this.getActiveRuns()[0];
  }

  public getActiveRuns() {
    return [...this.activeRuns.values()];
  }

  public async startRun(input: {
    kind: "manual" | "event";
    eventId?: string;
    channel: { botId: string; id: string };
    preset: { id: string };
    plannedStopAt?: string;
  }) {
    this.startCalls.push({
      botId: input.channel.botId,
      channelId: input.channel.id,
      presetId: input.preset.id,
    });

    const run: ActiveRun = {
      kind: input.kind,
      eventId: input.eventId,
      botId: input.channel.botId,
      botName: input.channel.botId === "bot-2" ? "Backup Bot" : "Primary Bot",
      channelId: input.channel.id,
      presetId: input.preset.id,
      channelName: input.channel.id,
      presetName: input.preset.id,
      startedAt: "2026-03-30T10:00:00.000Z",
      plannedStopAt: input.plannedStopAt,
      status: "running",
    };
    this.activeRuns.set(run.botId, run);
    return run;
  }

  public stopActive(reason = "manual-stop", botId?: string) {
    this.stopCalls.push({ reason, botId });
    const run = botId ? this.activeRuns.get(botId) : this.getActiveRun();
    if (!run) return false;
    this.activeRuns.delete(run.botId);
    return true;
  }

  public stopAllActive(reason = "manual-stop") {
    const botIds = [...this.activeRuns.keys()];
    for (const botId of botIds) {
      this.stopCalls.push({ reason, botId });
      this.activeRuns.delete(botId);
    }
    return botIds.length;
  }

  public clearStopCalls() {
    this.stopCalls.length = 0;
  }
}

function createPresetInput(name: string, sourceUrl: string): PresetInput {
  return {
    name,
    sourceUrl,
    sourceMode: "direct",
    fallbackSources: [],
    qualityProfile: "720p30",
    bufferProfile: "balanced",
    description: "",
    includeAudio: true,
    width: 1280,
    height: 720,
    fps: 30,
    bitrateVideoKbps: 3500,
    maxBitrateVideoKbps: 4500,
    bitrateAudioKbps: 160,
    videoCodec: "H264",
    hardwareAcceleration: false,
    minimizeLatency: false,
  };
}

function createChannelInput(
  botId: string,
  name: string,
  suffix: string,
): ChannelInput {
  return {
    botId,
    name,
    guildId: `guild-${suffix}`,
    channelId: `voice-${suffix}`,
    streamMode: "go-live",
    description: "",
  };
}

function createServiceContext() {
  const tempDir = mkdtempSync(join(tmpdir(), "stream-bot-service-"));
  const filePath = join(tempDir, "state.json");
  const store = new AppStateStore(filePath);
  const runtime = new RuntimeStub();
  const service = new ControlPanelService(
    store,
    runtime as unknown as StreamRuntime,
  );

  (
    service as unknown as {
      sendNotification: (...args: unknown[]) => Promise<void>;
    }
  ).sendNotification = async () => {};
  (
    service as unknown as {
      syncEventsToDiscord: (
        events: unknown[],
        channelId: string,
      ) => Promise<void>;
    }
  ).syncEventsToDiscord = async () => {};

  return {
    runtime,
    service,
    dispose() {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

test("ControlPanelService allows overlapping events on different bots but blocks overlaps on the same bot", () => {
  const context = createServiceContext();

  try {
    const primaryChannel = context.service.createChannel(
      createChannelInput("primary", "Primary Stage", "1"),
    );
    const backupChannel = context.service.createChannel(
      createChannelInput("bot-2", "Backup Stage", "2"),
    );
    const preset = context.service.createPreset(
      createPresetInput("Main Feed", "https://example.com/live.m3u8"),
    );

    const baseEvent = {
      name: "Matchday",
      presetId: preset.id,
      startAt: "2026-04-10T18:00:00.000Z",
      endAt: "2026-04-10T20:00:00.000Z",
      description: "",
    };

    context.service.createEvent({
      ...baseEvent,
      channelId: primaryChannel.id,
    });

    assert.doesNotThrow(() =>
      context.service.createEvent({
        ...baseEvent,
        name: "Backup Matchday",
        channelId: backupChannel.id,
      }),
    );

    assert.throws(
      () =>
        context.service.createEvent({
          ...baseEvent,
          name: "Conflict",
          channelId: primaryChannel.id,
        }),
      /Event overlaps with "Matchday"/,
    );
  } finally {
    context.dispose();
  }
});

test("ControlPanelService binds the queue to the configured bot and skips only that bot's active run", async () => {
  const context = createServiceContext();

  try {
    const queueChannel = context.service.createChannel(
      createChannelInput("bot-2", "Queue Stage", "queue"),
    );
    const preset = context.service.createPreset(
      createPresetInput("Queue Preset", "https://example.com/base.m3u8"),
    );

    context.service.addToQueue(
      "https://example.com/queue-one.m3u8",
      "Queue One",
    );
    await context.service.startQueue(queueChannel.id, preset.id);

    let snapshot = context.service.snapshot();
    assert.equal(snapshot.queueConfig.botId, "bot-2");
    assert.equal(context.runtime.startCalls[0]?.botId, "bot-2");

    context.runtime.clearStopCalls();
    await context.service.skipQueueItem();

    assert.deepEqual(context.runtime.stopCalls, [
      { reason: "manual-stop", botId: "bot-2" },
    ]);

    snapshot = context.service.snapshot();
    assert.equal(snapshot.queue[0]?.status, "skipped");
  } finally {
    context.dispose();
  }
});

test("ControlPanelService persists notification settings and includes them in exports", () => {
  const context = createServiceContext();

  try {
    const settings = context.service.updateNotificationSettings({
      webhookUrl: "https://discord.com/api/webhooks/123/example",
      dmEnabled: true,
      rules: {
        queueItems: true,
        performanceWarnings: false,
      },
    });

    assert.equal(
      settings.webhookUrl,
      "https://discord.com/api/webhooks/123/example",
    );
    assert.equal(settings.dmEnabled, true);
    assert.equal(settings.rules.queueItems, true);
    assert.equal(settings.rules.performanceWarnings, false);

    const exported = context.service.exportConfiguration();
    assert.equal(
      exported.data.notificationSettings.webhookUrl,
      "https://discord.com/api/webhooks/123/example",
    );
    assert.equal(exported.data.notificationSettings.dmEnabled, true);
    assert.equal(exported.data.notificationSettings.rules.queueItems, true);
    assert.equal(
      exported.data.notificationSettings.rules.performanceWarnings,
      false,
    );
  } finally {
    context.dispose();
  }
});

test("ControlPanelService suppresses notifications when a rule is disabled", async () => {
  const context = createServiceContext();
  const delivered: string[] = [];

  try {
    context.service.updateNotificationSettings({
      webhookUrl: "https://discord.com/api/webhooks/123/example",
      dmEnabled: true,
      rules: {
        manualRuns: false,
      },
    });

    (
      context.service as unknown as {
        sendWebhookNotification: (message: string) => Promise<void>;
        sendDmNotification: (message: string) => Promise<void>;
      }
    ).sendWebhookNotification = async (message: string) => {
      delivered.push(`webhook:${message}`);
    };
    (
      context.service as unknown as {
        sendDmNotification: (message: string) => Promise<void>;
      }
    ).sendDmNotification = async (message: string) => {
      delivered.push(`dm:${message}`);
    };

    await ControlPanelService.prototype.sendNotification.call(
      context.service,
      "Manual stream",
      "manualRuns",
      "primary",
    );
    await ControlPanelService.prototype.sendNotification.call(
      context.service,
      "Failure",
      "failures",
      "primary",
    );

    assert.deepEqual(delivered, ["webhook:Failure", "dm:Failure"]);
  } finally {
    context.dispose();
  }
});

test("ControlPanelService validates fallback sources with source-mode rules", () => {
  const context = createServiceContext();

  try {
    assert.throws(
      () =>
        context.service.createPreset({
          ...createPresetInput("Fallback Test", "https://example.com/live.m3u8"),
          fallbackSources: [
            {
              url: "https://youtu.be/example",
              sourceMode: "direct",
            },
          ],
        }),
      /YouTube URLs require source mode 'yt-dlp'/,
    );
  } finally {
    context.dispose();
  }
});

test("ControlPanelService can edit a single series occurrence without rewriting the full series", () => {
  const context = createServiceContext();

  try {
    const channel = context.service.createChannel(
      createChannelInput("primary", "Series Stage", "series"),
    );
    const preset = context.service.createPreset(
      createPresetInput("Series Preset", "https://example.com/series.m3u8"),
    );

    const created = context.service.createEvent({
      name: "Weekly Show",
      channelId: channel.id,
      presetId: preset.id,
      startAt: "2026-04-10T18:00:00.000Z",
      endAt: "2026-04-10T20:00:00.000Z",
      description: "",
      recurrence: {
        kind: "weekly",
        interval: 1,
        daysOfWeek: [5],
        until: "2026-04-24T18:00:00.000Z",
      },
    });

    assert.equal(created.events.length, 3);
    const target = created.events[1];
    assert.ok(target);

    const result = context.service.updateEvent(
      target.id,
      {
        name: "Special Show",
        channelId: channel.id,
        presetId: preset.id,
        startAt: "2026-04-17T19:00:00.000Z",
        endAt: "2026-04-17T21:00:00.000Z",
        description: "Special",
        recurrence: {
          kind: "weekly",
          interval: 1,
          daysOfWeek: [5],
          until: "2026-04-24T18:00:00.000Z",
        },
      },
      "single",
    );

    assert.equal(result.scope, "single");
    assert.equal(result.updatedCount, 1);

    const snapshot = context.service.snapshot();
    assert.equal(snapshot.events.length, 3);
    const detached = snapshot.events.find(
      (event) => event.name === "Special Show",
    );
    assert.ok(detached);
    assert.equal(detached?.seriesId, undefined);
    assert.equal(detached?.recurrence.kind, "once");

    const remainingSeries = snapshot.events.filter(
      (event) => event.seriesId === created.seriesId,
    );
    assert.equal(remainingSeries.length, 2);
  } finally {
    context.dispose();
  }
});

test("ControlPanelService pauses and resumes the queue around an event when event-first is enabled", async () => {
  const context = createServiceContext();

  try {
    const channel = context.service.createChannel(
      createChannelInput("bot-2", "Queue Stage", "queue-event"),
    );
    const preset = context.service.createPreset(
      createPresetInput("Queue Preset", "https://example.com/base.m3u8"),
    );

    context.service.updateQueueConfig({ conflictPolicy: "event-first" });
    context.service.addToQueue(
      "https://example.com/queue-one.m3u8",
      "Queue One",
    );
    await context.service.startQueue(channel.id, preset.id);

    const created = context.service.createEvent({
      name: "Priority Event",
      channelId: channel.id,
      presetId: preset.id,
      startAt: "2026-04-10T18:00:00.000Z",
      endAt: "2026-04-10T18:30:00.000Z",
      description: "",
      recurrence: { kind: "once" },
    });
    const createdEvent = created.events[0];
    assert.ok(createdEvent);

    await context.service.startScheduledEvent(createdEvent.id);

    let snapshot = context.service.snapshot();
    assert.equal(snapshot.queueConfig.pausedByEvent, true);
    assert.equal(snapshot.queue[0]?.status, "pending");
    assert.equal(
      context.runtime.stopCalls.at(-1)?.reason,
      "queue-preempted-for-event",
    );
    assert.equal(context.runtime.startCalls.at(-1)?.presetId, preset.id);

    const activeRun = context.runtime.getActiveRun("bot-2");
    assert.ok(activeRun);
    context.runtime.stopActive("scheduled-end", "bot-2");
    context.runtime.emit("runEnded", {
      run: activeRun,
      reason: "completed",
    });

    await new Promise((resolve) => setTimeout(resolve, 1700));

    snapshot = context.service.snapshot();
    assert.equal(snapshot.queueConfig.pausedByEvent, false);
    assert.equal(context.runtime.startCalls.length, 3);
    assert.equal(
      context.runtime.startCalls.at(-1)?.presetId,
      `queue-${snapshot.queue[0]?.id}`,
    );
  } finally {
    context.dispose();
  }
});

test("ControlPanelService import normalizes stale running state and replaces persisted data", () => {
  const context = createServiceContext();

  try {
    const imported = context.service.importConfiguration({
      version: 1,
      exportedAt: "2026-03-30T10:00:00.000Z",
      data: {
        notificationSettings: {
          webhookUrl: "https://discord.com/api/webhooks/999/imported",
          dmEnabled: false,
          rules: {
            manualRuns: true,
            scheduledEvents: false,
            queueLifecycle: true,
            queueItems: false,
            failures: true,
            performanceWarnings: true,
          },
        },
        channels: [
          {
            id: "channel-imported",
            botId: "primary",
            name: "Imported Stage",
            guildId: "guild-imported",
            channelId: "voice-imported",
            streamMode: "go-live",
            description: "",
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
        ],
        presets: [
          {
            id: "preset-imported",
            name: "Imported Preset",
            sourceUrl: "https://example.com/imported.m3u8",
            sourceMode: "direct",
            qualityProfile: "720p30",
            bufferProfile: "balanced",
            description: "",
            includeAudio: true,
            width: 1280,
            height: 720,
            fps: 30,
            bitrateVideoKbps: 3500,
            maxBitrateVideoKbps: 4500,
            bitrateAudioKbps: 160,
            videoCodec: "H264",
            hardwareAcceleration: false,
            minimizeLatency: false,
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
        ],
        events: [
          {
            id: "event-imported",
            name: "Imported Event",
            channelId: "channel-imported",
            presetId: "preset-imported",
            startAt: "2026-04-10T18:00:00.000Z",
            endAt: "2026-04-10T20:00:00.000Z",
            status: "running",
            description: "",
            recurrence: {
              kind: "once",
              interval: 1,
              daysOfWeek: [],
            },
            occurrenceIndex: 1,
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
        ],
        queue: [
          {
            id: "queue-imported",
            url: "https://example.com/queue-imported.m3u8",
            name: "Imported Queue",
            sourceMode: "direct",
            addedAt: "2026-03-30T10:00:00.000Z",
            status: "playing",
          },
        ],
        queueConfig: {
          active: true,
          loop: true,
          botId: "primary",
          channelId: "channel-imported",
          presetId: "preset-imported",
          currentIndex: 0,
        },
      },
    });

    assert.equal(imported.counts.channels, 1);
    assert.equal(imported.counts.presets, 1);
    assert.equal(imported.counts.events, 1);
    assert.equal(imported.counts.queue, 1);

    const snapshot = context.service.snapshot();
    assert.equal(
      snapshot.notificationSettings.webhookUrl,
      "https://discord.com/api/webhooks/999/imported",
    );
    assert.equal(snapshot.queueConfig.active, false);
    assert.equal(snapshot.queue[0]?.status, "pending");
    assert.equal(snapshot.events[0]?.status, "scheduled");
    assert.match(
      snapshot.events[0]?.lastError ?? "",
      /Imported without active runtime session/,
    );
  } finally {
    context.dispose();
  }
});
