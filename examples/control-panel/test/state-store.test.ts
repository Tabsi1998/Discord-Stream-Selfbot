import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
