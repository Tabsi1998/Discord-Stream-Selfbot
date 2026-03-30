import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HttpError,
  getStatusCodeForError,
  parseChannelInput,
  parseEventInput,
  parsePresetInput,
} from "../src/server/requestValidation.js";

test("parseChannelInput validates and trims channel payloads", () => {
  const result = parseChannelInput({
    botId: " primary ",
    name: " Main Stage ",
    guildId: " guild-1 ",
    channelId: " voice-1 ",
    streamMode: "go-live",
    description: " Main desk ",
  });

  assert.deepEqual(result, {
    botId: "primary",
    name: "Main Stage",
    guildId: "guild-1",
    channelId: "voice-1",
    streamMode: "go-live",
    description: "Main desk",
  });
});

test("parsePresetInput rejects malformed numeric fields", () => {
  assert.throws(
    () =>
      parsePresetInput({
        name: "Preset",
        sourceUrl: "https://example.com/live.m3u8",
        sourceMode: "direct",
        qualityProfile: "720p30",
        bufferProfile: "balanced",
        includeAudio: true,
        width: 1280,
        height: "720",
        fps: 30,
        bitrateVideoKbps: 3500,
        maxBitrateVideoKbps: 4500,
        bitrateAudioKbps: 160,
        videoCodec: "H264",
        hardwareAcceleration: false,
        minimizeLatency: false,
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.status === 400 &&
      /height must be an integer/i.test(error.message),
  );
});

test("parseEventInput validates recurrence blocks", () => {
  const result = parseEventInput({
    name: "Weekly Event",
    channelId: "channel-1",
    presetId: "preset-1",
    startAt: "2026-04-10T18:00:00.000Z",
    endAt: "2026-04-10T20:00:00.000Z",
    recurrence: {
      kind: "weekly",
      interval: 2,
      daysOfWeek: [1, 3, 5, 5],
      until: "2026-06-10T18:00:00.000Z",
    },
  });

  assert.deepEqual(result.recurrence, {
    kind: "weekly",
    interval: 2,
    daysOfWeek: [1, 3, 5],
    until: "2026-06-10T18:00:00.000Z",
  });
});

test("getStatusCodeForError maps validation and conflict style errors", () => {
  assert.equal(getStatusCodeForError(new HttpError(400, "bad payload")), 400);
  assert.equal(getStatusCodeForError(new Error("Channel not found")), 404);
  assert.equal(
    getStatusCodeForError(
      new Error("Cannot delete a channel while it is active"),
    ),
    409,
  );
  assert.equal(getStatusCodeForError(new Error("Unhandled boom")), 500);
});
