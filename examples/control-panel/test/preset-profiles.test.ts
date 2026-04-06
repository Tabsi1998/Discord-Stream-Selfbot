import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRuntimePerformanceGuardrails,
  buildAdaptiveDowngradePreset,
  buildEffectiveAdaptivePreset,
  buildAdaptiveUpgradePreset,
  detectSourceProfile,
  getAdaptiveRecoverySpeedThreshold,
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
  assert.equal(
    detectSourceProfile("yt-dlp", "https://youtu.be/example"),
    "yt-dlp",
  );
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

test("getAdaptiveRecoverySpeedThreshold is realtime-safe for live remote sources", () => {
  assert.equal(
    getAdaptiveRecoverySpeedThreshold(
      "yt-dlp",
      "https://www.twitch.tv/example",
    ),
    0.99,
  );
  assert.equal(
    getAdaptiveRecoverySpeedThreshold(
      "direct",
      "https://example.com/live.m3u8",
    ),
    0.99,
  );
  assert.equal(
    getAdaptiveRecoverySpeedThreshold(
      "direct",
      "https://example.com/video.mp4",
    ),
    1.04,
  );
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

test("buildAdaptiveDowngradePreset steps down to a lighter profile", () => {
  const result = buildAdaptiveDowngradePreset({
    id: "preset-1",
    name: "Main Feed",
    sourceUrl: "https://example.com/live.m3u8",
    sourceMode: "direct",
    fallbackSources: [],
    qualityProfile: "1080p30",
    bufferProfile: "stable",
    description: "",
    includeAudio: true,
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateVideoKbps: 7000,
    maxBitrateVideoKbps: 9500,
    bitrateAudioKbps: 160,
    videoCodec: "H264",
    hardwareAcceleration: false,
    minimizeLatency: false,
    createdAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T10:00:00.000Z",
  });

  assert.ok(result);
  assert.equal(result?.preset.qualityProfile, "720p30");
  assert.equal(result?.preset.width, 1280);
  assert.equal(result?.preset.height, 720);
});

test("buildAdaptiveUpgradePreset returns to the original target profile", () => {
  const currentPreset = {
    id: "preset-1",
    name: "Main Feed",
    sourceUrl: "https://example.com/live.m3u8",
    sourceMode: "direct" as const,
    fallbackSources: [],
    qualityProfile: "720p30" as const,
    bufferProfile: "stable" as const,
    description: "",
    includeAudio: true,
    width: 1280,
    height: 720,
    fps: 30,
    bitrateVideoKbps: 4500,
    maxBitrateVideoKbps: 6500,
    bitrateAudioKbps: 160,
    videoCodec: "H264" as const,
    hardwareAcceleration: false,
    minimizeLatency: false,
    createdAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T10:00:00.000Z",
  };
  const targetPreset = {
    ...currentPreset,
    qualityProfile: "1080p30" as const,
    width: 1920,
    height: 1080,
    bitrateVideoKbps: 7000,
    maxBitrateVideoKbps: 9500,
  };

  const result = buildAdaptiveUpgradePreset(currentPreset, targetPreset);

  assert.ok(result);
  assert.equal(result?.preset.qualityProfile, "1080p30");
  assert.equal(result?.preset.width, 1920);
  assert.equal(result?.preset.height, 1080);
});

test("buildEffectiveAdaptivePreset clamps software-only 1080p60 targets to 1080p30", () => {
  const preset = {
    id: "preset-guarded",
    name: "Main Feed",
    sourceUrl: "https://www.twitch.tv/example",
    sourceMode: "yt-dlp" as const,
    fallbackSources: [],
    qualityProfile: "1080p60" as const,
    bufferProfile: "stable" as const,
    description: "",
    includeAudio: true,
    width: 1920,
    height: 1080,
    fps: 60,
    bitrateVideoKbps: 8500,
    maxBitrateVideoKbps: 10000,
    bitrateAudioKbps: 160,
    videoCodec: "H264" as const,
    hardwareAcceleration: false,
    minimizeLatency: false,
    createdAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T10:00:00.000Z",
  };

  const result = buildEffectiveAdaptivePreset(preset, "software");

  assert.equal(result.qualityProfile, "1080p30");
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.fps, 30);
});

test("buildAdaptiveUpgradePreset skips recovery when software guardrails already cap the target", () => {
  const currentPreset = {
    id: "preset-current",
    name: "Main Feed",
    sourceUrl: "https://www.twitch.tv/example",
    sourceMode: "yt-dlp" as const,
    fallbackSources: [],
    qualityProfile: "1080p30" as const,
    bufferProfile: "stable" as const,
    description: "",
    includeAudio: true,
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateVideoKbps: 7000,
    maxBitrateVideoKbps: 9500,
    bitrateAudioKbps: 160,
    videoCodec: "H264" as const,
    hardwareAcceleration: false,
    minimizeLatency: false,
    createdAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T10:00:00.000Z",
  };
  const requestedTargetPreset = {
    ...currentPreset,
    id: "preset-target",
    qualityProfile: "1080p60" as const,
    fps: 60,
    bitrateVideoKbps: 8500,
    maxBitrateVideoKbps: 10000,
  };

  const effectiveCurrentPreset = buildEffectiveAdaptivePreset(
    currentPreset,
    "software",
  );
  const effectiveTargetPreset = buildEffectiveAdaptivePreset(
    requestedTargetPreset,
    "software",
  );
  const result = buildAdaptiveUpgradePreset(
    effectiveCurrentPreset,
    effectiveTargetPreset,
  );

  assert.equal(result, undefined);
});
