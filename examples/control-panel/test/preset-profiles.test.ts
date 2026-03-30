import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRuntimePerformanceGuardrails,
  detectSourceProfile,
  getRecommendedBitrates,
  resolveRuntimePresetConfig,
} from "../src/domain/presetProfiles.js";

test("detectSourceProfile classifies direct URLs by transport type", () => {
  assert.equal(
    detectSourceProfile("direct", "https://example.com/live.m3u8"),
    "hls",
  );
  assert.equal(
    detectSourceProfile(
      "direct",
      "http://127.0.0.1:9191/proxy/ts/stream/example",
    ),
    "mpeg-ts",
  );
  assert.equal(
    detectSourceProfile("direct", "https://example.com/video.mp4"),
    "file",
  );
  assert.equal(detectSourceProfile("yt-dlp", "https://youtu.be/example"), "yt-dlp");
});

test("getRecommendedBitrates is more conservative for hls-style sources", () => {
  const fileBitrate = getRecommendedBitrates(
    "1080p60",
    1920,
    1080,
    60,
    "H264",
    "direct",
    "https://example.com/video.mp4",
  );
  const hlsBitrate = getRecommendedBitrates(
    "1080p60",
    1920,
    1080,
    60,
    "H264",
    "direct",
    "https://example.com/live.m3u8",
  );

  assert.ok(hlsBitrate.bitrateVideoKbps < fileBitrate.bitrateVideoKbps);
  assert.ok(hlsBitrate.maxBitrateVideoKbps < fileBitrate.maxBitrateVideoKbps);
});

test("resolveRuntimePresetConfig forces stable buffering for hls auto mode", () => {
  const result = resolveRuntimePresetConfig({
    sourceMode: "direct",
    sourceUrl: "https://example.com/live.m3u8",
    qualityProfile: "1080p30",
    bufferProfile: "auto",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateVideoKbps: 5000,
    maxBitrateVideoKbps: 7000,
    bitrateAudioKbps: 160,
    videoCodec: "H264",
    minimizeLatency: false,
  });

  assert.equal(result.sourceProfile, "hls");
  assert.equal(result.effectiveBufferProfile, "stable");
  assert.ok(result.readrateInitialBurst >= 6);
});

test("applyRuntimePerformanceGuardrails caps aggressive software bitrates on remote live-style sources", () => {
  const result = applyRuntimePerformanceGuardrails(
    {
      sourceMode: "direct",
      sourceUrl: "https://example.com/live.m3u8",
      width: 1920,
      height: 1080,
      fps: 60,
      bitrateVideoKbps: 12000,
      maxBitrateVideoKbps: 14000,
      bitrateAudioKbps: 160,
      videoCodec: "H264",
    },
    "software",
  );

  assert.ok(result.bitrateVideoKbps <= 9000);
  assert.ok(
    result.warnings.some((warning) => /safer software bitrates/i.test(warning)),
  );
});
