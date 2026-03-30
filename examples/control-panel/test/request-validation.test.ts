import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HttpError,
  getStatusCodeForError,
  parseChannelInput,
  parseEventDeleteInput,
  parseEventInput,
  parseEventUpdateInput,
  parsePresetInput,
  parseQueueConfigInput,
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

test("parsePresetInput accepts fallback sources and defaults their mode", () => {
  const result = parsePresetInput({
    name: "Preset",
    sourceUrl: "https://example.com/live.m3u8",
    sourceMode: "direct",
    fallbackSources: [
      { url: " https://backup.example/live.m3u8 " },
      { url: " https://youtu.be/example ", sourceMode: "yt-dlp" },
    ],
    qualityProfile: "720p30",
    bufferProfile: "balanced",
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
  });

  assert.deepEqual(result.fallbackSources, [
    {
      url: "https://backup.example/live.m3u8",
      sourceMode: "direct",
    },
    {
      url: "https://youtu.be/example",
      sourceMode: "yt-dlp",
    },
  ]);
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

test("event mutation parsers accept explicit series scopes", () => {
  const update = parseEventUpdateInput({
    name: "Weekly Event",
    channelId: "channel-1",
    presetId: "preset-1",
    startAt: "2026-04-10T18:00:00.000Z",
    endAt: "2026-04-10T20:00:00.000Z",
    scope: "all",
  });
  const deletion = parseEventDeleteInput({ scope: "single" });

  assert.equal(update.scope, "all");
  assert.equal(update.input.name, "Weekly Event");
  assert.equal(deletion.scope, "single");
});

test("parseQueueConfigInput requires a supported setting", () => {
  assert.deepEqual(parseQueueConfigInput({ conflictPolicy: "event-first" }), {
    loop: undefined,
    conflictPolicy: "event-first",
  });

  assert.throws(
    () => parseQueueConfigInput({}),
    (error: unknown) =>
      error instanceof HttpError &&
      error.status === 400 &&
      /must include loop or conflictPolicy/i.test(error.message),
  );
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
