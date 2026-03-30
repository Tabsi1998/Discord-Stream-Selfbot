import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { AppStateStore } from "../src/state/AppStateStore.js";

test("AppStateStore migrates legacy activeRun state to activeRuns and default bot maps", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "stream-bot-state-"));
  const filePath = join(tempDir, "state.json");

  try {
    writeFileSync(
      filePath,
      JSON.stringify({
        channels: [
          {
            id: "channel-1",
            name: "Main Stage",
            guildId: "guild-1",
            channelId: "voice-1",
            streamMode: "go-live",
            description: "",
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
        ],
        queueConfig: {
          active: true,
          loop: true,
          currentIndex: 1,
          botId: "bot-2",
        },
        runtime: {
          discordStatus: "ready",
          activeRun: {
            kind: "manual",
            botId: "bot-2",
            botName: "Backup Bot",
            channelId: "channel-1",
            presetId: "preset-1",
            channelName: "Main Stage",
            presetName: "Main Feed",
            startedAt: "2026-03-30T10:05:00.000Z",
            status: "running",
          },
        },
      }),
      "utf-8",
    );

    const store = new AppStateStore(filePath);
    const snapshot = store.snapshot();

    assert.equal(snapshot.channels[0]?.botId, "primary");
    assert.deepEqual(snapshot.runtime.activeRuns, [
      {
        kind: "manual",
        botId: "bot-2",
        botName: "Backup Bot",
        channelId: "channel-1",
        presetId: "preset-1",
        channelName: "Main Stage",
        presetName: "Main Feed",
        startedAt: "2026-03-30T10:05:00.000Z",
        status: "running",
      },
    ]);
    assert.deepEqual(snapshot.runtime.telemetryByBot, {});
    assert.deepEqual(snapshot.runtime.selectedVideoEncodersByBot, {});
    assert.equal(snapshot.queueConfig.botId, "bot-2");
    assert.equal(snapshot.queueConfig.loop, true);
    assert.deepEqual(snapshot.notificationSettings, {
      webhookUrl: "",
      dmEnabled: false,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("AppStateStore notifies subscribers after updates", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "stream-bot-state-"));
  const filePath = join(tempDir, "state.json");

  try {
    const store = new AppStateStore(filePath);
    const events: string[] = [];
    const unsubscribe = store.subscribe((state) => {
      events.push(state.runtime.discordStatus);
    });

    store.setRuntime((runtime) => {
      runtime.discordStatus = "ready";
    });

    unsubscribe();

    store.setRuntime((runtime) => {
      runtime.discordStatus = "error";
    });

    assert.deepEqual(events, ["ready"]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("AppStateStore stores logs in a dedicated file while keeping state lean", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "stream-bot-state-"));
  const filePath = join(tempDir, "state.json");
  const logsFilePath = join(tempDir, "state.logs.json");

  try {
    const store = new AppStateStore(filePath);
    store.appendLog("info", "Separated log entry");

    assert.equal(existsSync(logsFilePath), true);

    const statePayload = JSON.parse(readFileSync(filePath, "utf-8"));
    const logsPayload = JSON.parse(readFileSync(logsFilePath, "utf-8"));

    assert.deepEqual(statePayload.logs, []);
    assert.equal(logsPayload[0]?.message, "Separated log entry");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("AppStateStore falls back to backup files when the primary state file is corrupted", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "stream-bot-state-"));
  const filePath = join(tempDir, "state.json");
  const backupPath = `${filePath}.bak`;
  const logsFilePath = join(tempDir, "state.logs.json");
  const logsBackupPath = `${logsFilePath}.bak`;

  try {
    writeFileSync(filePath, "{ broken json", "utf-8");
    writeFileSync(
      backupPath,
      JSON.stringify({
        channels: [],
        presets: [],
        events: [],
        queue: [],
        queueConfig: {
          active: false,
          loop: false,
          currentIndex: 0,
        },
        notificationSettings: {
          webhookUrl: "",
          dmEnabled: true,
        },
        runtime: {
          discordStatus: "ready",
          activeRuns: [],
        },
        logs: [],
      }),
      "utf-8",
    );
    writeFileSync(logsFilePath, "[broken", "utf-8");
    writeFileSync(
      logsBackupPath,
      JSON.stringify([
        {
          id: "log-1",
          level: "warn",
          message: "Recovered from backup",
          createdAt: "2026-03-30T10:00:00.000Z",
        },
      ]),
      "utf-8",
    );

    const store = new AppStateStore(filePath);
    const snapshot = store.snapshot();

    assert.equal(snapshot.runtime.discordStatus, "ready");
    assert.equal(snapshot.notificationSettings.dmEnabled, true);
    assert.equal(snapshot.logs[0]?.message, "Recovered from backup");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("AppStateStore migrates legacy fallbackUrls to fallbackSources", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "stream-bot-state-"));
  const filePath = join(tempDir, "state.json");

  try {
    writeFileSync(
      filePath,
      JSON.stringify({
        channels: [],
        presets: [
          {
            id: "preset-1",
            name: "Fallback Preset",
            sourceUrl: "https://example.com/live.m3u8",
            sourceMode: "direct",
            fallbackUrls: [
              "https://backup.example/live.m3u8",
              "https://backup.example/live-2.m3u8",
            ],
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
        events: [],
        queue: [],
        queueConfig: {
          active: false,
          loop: false,
          currentIndex: 0,
        },
        notificationSettings: {
          webhookUrl: "",
          dmEnabled: false,
        },
        runtime: {
          discordStatus: "ready",
          activeRuns: [],
        },
        logs: [],
      }),
      "utf-8",
    );

    const store = new AppStateStore(filePath);
    const snapshot = store.snapshot();

    assert.deepEqual(snapshot.presets[0]?.fallbackSources, [
      {
        url: "https://backup.example/live.m3u8",
        sourceMode: "direct",
      },
      {
        url: "https://backup.example/live-2.m3u8",
        sourceMode: "direct",
      },
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
