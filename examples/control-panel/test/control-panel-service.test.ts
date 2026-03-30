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
    });

    assert.equal(
      settings.webhookUrl,
      "https://discord.com/api/webhooks/123/example",
    );
    assert.equal(settings.dmEnabled, true);

    const exported = context.service.exportConfiguration();
    assert.equal(
      exported.data.notificationSettings.webhookUrl,
      "https://discord.com/api/webhooks/123/example",
    );
    assert.equal(exported.data.notificationSettings.dmEnabled, true);
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
