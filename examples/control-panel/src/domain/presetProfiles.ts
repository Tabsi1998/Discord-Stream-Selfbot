import type {
  BufferProfile,
  PresetInput,
  QualityProfile,
  SourceMode,
  StreamPreset,
  VideoEncoderMode,
  VideoCodec,
} from "./types.js";

export type SourceProfile = "generic" | "yt-dlp" | "hls" | "mpeg-ts" | "file";

type QualityProfileConfig = {
  id: QualityProfile;
  label: string;
  description: string;
  width: number;
  height: number;
  fps: number;
  preserveSource: boolean;
};

type BufferStrategyId = Exclude<BufferProfile, "auto">;

type BufferStrategy = {
  id: BufferStrategyId;
  label: string;
  description: string;
  minimizeLatency: boolean;
  readrateInitialBurst: number;
  inputQueueSize: number;
  probeSize: string;
  analyzeDuration: string;
  bitrateBufferFactor: number;
};

type PresetLike = Pick<
  StreamPreset | PresetInput,
  | "sourceMode"
  | "sourceUrl"
  | "qualityProfile"
  | "bufferProfile"
  | "width"
  | "height"
  | "fps"
  | "bitrateVideoKbps"
  | "maxBitrateVideoKbps"
  | "bitrateAudioKbps"
  | "videoCodec"
  | "minimizeLatency"
>;

type AdaptiveProfileStepId = QualityProfile | "480p30";

type AdaptiveProfileStep = {
  id: AdaptiveProfileStepId;
  width: number;
  height: number;
  fps: number;
};

const QUALITY_PROFILES: Record<QualityProfile, QualityProfileConfig> = {
  "720p30": {
    id: "720p30",
    label: "720p / 30 FPS",
    description: "Solide Standardwahl fuer lange Streams",
    width: 1280,
    height: 720,
    fps: 30,
    preserveSource: false,
  },
  "720p60": {
    id: "720p60",
    label: "720p / 60 FPS",
    description: "Mehr Bewegungsglaette bei mittlerer Last",
    width: 1280,
    height: 720,
    fps: 60,
    preserveSource: false,
  },
  "1080p30": {
    id: "1080p30",
    label: "1080p / 30 FPS",
    description: "Schaerferes Bild bei moderater Last",
    width: 1920,
    height: 1080,
    fps: 30,
    preserveSource: false,
  },
  "1080p60": {
    id: "1080p60",
    label: "1080p / 60 FPS",
    description: "Hohe Qualitaet, braucht spuerbar mehr Leistung",
    width: 1920,
    height: 1080,
    fps: 60,
    preserveSource: false,
  },
  "1440p30": {
    id: "1440p30",
    label: "1440p / 30 FPS",
    description:
      "Sehr schaerf, aber deutlich schwerer fuer Encoder und Discord",
    width: 2560,
    height: 1440,
    fps: 30,
    preserveSource: false,
  },
  "1440p60": {
    id: "1440p60",
    label: "1440p / 60 FPS",
    description: "Maximale Last vor 4K, nur fuer starke Systeme",
    width: 2560,
    height: 1440,
    fps: 60,
    preserveSource: false,
  },
  "2160p30": {
    id: "2160p30",
    label: "4K / 30 FPS",
    description: "Ultra HD, braucht sehr viel Bandbreite und CPU-Power",
    width: 3840,
    height: 2160,
    fps: 30,
    preserveSource: false,
  },
  "2160p60": {
    id: "2160p60",
    label: "4K / 60 FPS",
    description: "Maximale Qualitaet, nur fuer sehr starke Systeme",
    width: 3840,
    height: 2160,
    fps: 60,
    preserveSource: false,
  },
  custom: {
    id: "custom",
    label: "Custom",
    description: "Freie Aufloesung, FPS und Bitraten",
    width: 1280,
    height: 720,
    fps: 30,
    preserveSource: false,
  },
};

const BUFFER_STRATEGIES: Record<BufferStrategyId, BufferStrategy> = {
  stable: {
    id: "stable",
    label: "Maximale Stabilitaet",
    description:
      "Mehr Burst und groessere Queues fuer saubere, ruhige Wiedergabe",
    minimizeLatency: false,
    readrateInitialBurst: 8,
    inputQueueSize: 4096,
    probeSize: "64M",
    analyzeDuration: "16M",
    bitrateBufferFactor: 3,
  },
  balanced: {
    id: "balanced",
    label: "Ausgewogen",
    description: "Guter Standard fuer die meisten Streams",
    minimizeLatency: false,
    readrateInitialBurst: 4,
    inputQueueSize: 2048,
    probeSize: "32M",
    analyzeDuration: "8M",
    bitrateBufferFactor: 2.5,
  },
  "low-latency": {
    id: "low-latency",
    label: "Minimale Latenz",
    description: "Schnelleres Anlaufen, aber empfindlicher bei kurzen Spikes",
    minimizeLatency: true,
    readrateInitialBurst: 1.5,
    inputQueueSize: 1024,
    probeSize: "8M",
    analyzeDuration: "4M",
    bitrateBufferFactor: 1.5,
  },
};

const ADAPTIVE_PROFILE_STEPS: readonly AdaptiveProfileStep[] = [
  {
    id: "480p30",
    width: 854,
    height: 480,
    fps: 30,
  },
  {
    id: "720p30",
    width: 1280,
    height: 720,
    fps: 30,
  },
  {
    id: "720p60",
    width: 1280,
    height: 720,
    fps: 60,
  },
  {
    id: "1080p30",
    width: 1920,
    height: 1080,
    fps: 30,
  },
  {
    id: "1080p60",
    width: 1920,
    height: 1080,
    fps: 60,
  },
  {
    id: "1440p30",
    width: 2560,
    height: 1440,
    fps: 30,
  },
  {
    id: "1440p60",
    width: 2560,
    height: 1440,
    fps: 60,
  },
  {
    id: "2160p30",
    width: 3840,
    height: 2160,
    fps: 30,
  },
  {
    id: "2160p60",
    width: 3840,
    height: 2160,
    fps: 60,
  },
] as const;

export function coerceQualityProfile(value: unknown): QualityProfile {
  return typeof value === "string" && value in QUALITY_PROFILES
    ? (value as QualityProfile)
    : "custom";
}

export function coerceBufferProfile(
  value: unknown,
  legacyMinimizeLatency = false,
): BufferProfile {
  if (
    typeof value === "string" &&
    (value === "auto" || value in BUFFER_STRATEGIES)
  ) {
    return value as BufferProfile;
  }
  return legacyMinimizeLatency ? "low-latency" : "auto";
}

export function getQualityProfileConfig(profile: QualityProfile) {
  return QUALITY_PROFILES[profile];
}

export function getBufferStrategy(profile: BufferStrategyId) {
  return BUFFER_STRATEGIES[profile];
}

export function detectSourceProfile(
  sourceMode: SourceMode,
  sourceUrl: string,
): SourceProfile {
  if (sourceMode === "yt-dlp") {
    return "yt-dlp";
  }

  const normalized = sourceUrl.trim().toLowerCase();
  if (
    normalized.includes("/proxy/ts/stream/") ||
    normalized.includes("/ts/stream/") ||
    /\.ts(?:[?#].*)?$/.test(normalized)
  ) {
    return "mpeg-ts";
  }
  if (
    /\.m3u8(?:[?#].*)?$/.test(normalized) ||
    normalized.includes("format=m3u8")
  ) {
    return "hls";
  }
  if (/\.(mp4|mkv|webm|mov)(?:[?#].*)?$/.test(normalized)) {
    return "file";
  }
  return "generic";
}

export function getAdaptiveRecoverySpeedThreshold(
  sourceMode: SourceMode,
  sourceUrl: string,
) {
  const sourceProfile = detectSourceProfile(sourceMode, sourceUrl);
  return sourceProfile === "yt-dlp" ||
    sourceProfile === "hls" ||
    sourceProfile === "mpeg-ts"
    ? 0.99
    : 1.04;
}

export function describePresetQuality(
  preset: Pick<
    StreamPreset | PresetInput,
    "qualityProfile" | "width" | "height" | "fps"
  >,
) {
  return preset.qualityProfile === "custom"
    ? `${preset.width}x${preset.height} @ ${preset.fps} FPS`
    : preset.qualityProfile;
}

export function getRecommendedBitrates(
  _qualityProfile: QualityProfile,
  width: number,
  height: number,
  fps: number,
  codec: VideoCodec,
  sourceMode: SourceMode = "direct",
  sourceUrl = "",
) {
  const sourceProfile = detectSourceProfile(sourceMode, sourceUrl);
  const pixels = width * height;
  const highFrameRate = fps >= 50;
  let bitrateVideoKbps = 2500;
  let maxBitrateVideoKbps = 3500;

  if (pixels >= 3840 * 2160) {
    bitrateVideoKbps = highFrameRate ? 14000 : 10000;
    maxBitrateVideoKbps = highFrameRate ? 18000 : 14000;
  } else if (pixels >= 2560 * 1440) {
    bitrateVideoKbps = highFrameRate ? 9000 : 8000;
    maxBitrateVideoKbps = 10000;
  } else if (pixels >= 1920 * 1080) {
    bitrateVideoKbps = highFrameRate ? 8500 : 7000;
    maxBitrateVideoKbps = highFrameRate ? 10000 : 9500;
  } else if (pixels >= 1280 * 720) {
    bitrateVideoKbps = highFrameRate ? 6500 : 4500;
    maxBitrateVideoKbps = highFrameRate ? 9000 : 6500;
  } else if (pixels >= 854 * 480) {
    bitrateVideoKbps = highFrameRate ? 3500 : 2500;
    maxBitrateVideoKbps = highFrameRate ? 5000 : 3600;
  } else {
    bitrateVideoKbps = highFrameRate ? 2200 : 1600;
    maxBitrateVideoKbps = highFrameRate ? 3200 : 2400;
  }

  if (codec === "H265") {
    bitrateVideoKbps = Math.round(bitrateVideoKbps * 0.82);
    maxBitrateVideoKbps = Math.round(maxBitrateVideoKbps * 0.85);
  }

  if (sourceProfile === "yt-dlp" || sourceProfile === "hls") {
    bitrateVideoKbps = Math.round(bitrateVideoKbps * 0.92);
    maxBitrateVideoKbps = Math.round(maxBitrateVideoKbps * 0.94);
  } else if (sourceProfile === "mpeg-ts") {
    bitrateVideoKbps = Math.round(bitrateVideoKbps * 0.88);
    maxBitrateVideoKbps = Math.round(maxBitrateVideoKbps * 0.9);
  }

  return {
    bitrateVideoKbps: Math.max(500, Math.round(bitrateVideoKbps / 50) * 50),
    maxBitrateVideoKbps: Math.max(
      1000,
      Math.round(maxBitrateVideoKbps / 50) * 50,
    ),
    bitrateAudioKbps: 160,
  };
}

function pickAutoBufferProfile(
  sourceMode: SourceMode,
  sourceUrl: string,
  _qualityProfile: QualityProfile,
  width: number,
  height: number,
  fps: number,
): BufferStrategyId {
  const sourceProfile = detectSourceProfile(sourceMode, sourceUrl);
  if (sourceProfile === "mpeg-ts" || sourceProfile === "hls") return "stable";
  if (sourceMode === "yt-dlp" && fps >= 60) return "stable";
  if (sourceMode === "yt-dlp" && (height >= 1080 || width >= 1920)) {
    return "stable";
  }
  if (fps >= 60) return "stable";
  if (height >= 1080 || width >= 1920) return "stable";
  return "balanced";
}

export function normalizePresetInput(input: PresetInput) {
  const qualityProfile = coerceQualityProfile(input.qualityProfile);
  const bufferProfile = coerceBufferProfile(
    input.bufferProfile,
    input.minimizeLatency,
  );
  const qualityConfig = getQualityProfileConfig(qualityProfile);

  let width = input.width;
  let height = input.height;
  let fps = input.fps;
  let bitrateVideoKbps = input.bitrateVideoKbps;
  let maxBitrateVideoKbps = input.maxBitrateVideoKbps;
  let bitrateAudioKbps = input.bitrateAudioKbps;

  if (qualityProfile !== "custom") {
    width = qualityConfig.width;
    height = qualityConfig.height;
    fps = qualityConfig.fps;
    const recommended = getRecommendedBitrates(
      qualityProfile,
      width,
      height,
      fps,
      input.videoCodec,
      input.sourceMode,
      input.sourceUrl,
    );
    bitrateVideoKbps = recommended.bitrateVideoKbps;
    maxBitrateVideoKbps = recommended.maxBitrateVideoKbps;
    bitrateAudioKbps = recommended.bitrateAudioKbps;
  }

  const effectiveBufferProfile =
    bufferProfile === "auto"
      ? pickAutoBufferProfile(
          input.sourceMode,
          input.sourceUrl,
          qualityProfile,
          width,
          height,
          fps,
        )
      : bufferProfile;
  const bufferStrategy = getBufferStrategy(effectiveBufferProfile);

  return {
    ...input,
    qualityProfile,
    bufferProfile,
    width,
    height,
    fps,
    bitrateVideoKbps,
    maxBitrateVideoKbps,
    bitrateAudioKbps,
    minimizeLatency: bufferStrategy.minimizeLatency,
  };
}

export function resolveRuntimePresetConfig(preset: PresetLike) {
  const qualityProfile = coerceQualityProfile(preset.qualityProfile);
  const bufferProfile = coerceBufferProfile(
    preset.bufferProfile,
    preset.minimizeLatency,
  );
  const qualityConfig = getQualityProfileConfig(qualityProfile);
  const sourceProfile = detectSourceProfile(
    preset.sourceMode,
    preset.sourceUrl,
  );
  const effectiveBufferProfile =
    bufferProfile === "auto"
      ? pickAutoBufferProfile(
          preset.sourceMode,
          preset.sourceUrl,
          qualityProfile,
          preset.width,
          preset.height,
          preset.fps,
        )
      : bufferProfile;
  const bufferStrategy = getBufferStrategy(effectiveBufferProfile);
  let bitrateBufferFactor = bufferStrategy.bitrateBufferFactor;
  let readrateInitialBurst = bufferStrategy.readrateInitialBurst;

  if (sourceProfile === "yt-dlp" || sourceProfile === "hls") {
    bitrateBufferFactor += 0.5;
    readrateInitialBurst = Math.max(readrateInitialBurst, 6);
  } else if (sourceProfile === "mpeg-ts") {
    bitrateBufferFactor += 0.75;
    readrateInitialBurst = Math.max(readrateInitialBurst, 8);
  }

  return {
    qualityProfile,
    sourceProfile,
    qualityConfig,
    bufferProfile,
    effectiveBufferProfile,
    bufferStrategy,
    preserveSource: qualityConfig.preserveSource,
    customInputOptions: [
      `-thread_queue_size ${bufferStrategy.inputQueueSize}`,
      `-probesize ${bufferStrategy.probeSize}`,
      `-analyzeduration ${bufferStrategy.analyzeDuration}`,
    ],
    bitrateBufferFactor,
    readrateInitialBurst,
    minimizeLatency: bufferStrategy.minimizeLatency,
  };
}

export function buildYtDlpFormatForPreset(
  qualityProfile: QualityProfile,
  fallbackFormat: string,
) {
  if (qualityProfile === "custom") {
    return fallbackFormat;
  }

  const quality = getQualityProfileConfig(qualityProfile);
  return [
    `bestvideo[vcodec!=none][height<=${quality.height}][fps<=${quality.fps}]+bestaudio[acodec!=none]`,
    `bestvideo[vcodec!=none][height<=${quality.height}]+bestaudio[acodec!=none]`,
    `best[vcodec!=none][acodec!=none][height<=${quality.height}][fps<=${quality.fps}]`,
    fallbackFormat,
  ].join("/");
}

export function buildYtDlpMuxedFormatForPreset(qualityProfile: QualityProfile) {
  if (qualityProfile === "custom") {
    return "best[vcodec!=none][acodec!=none]/best";
  }

  const quality = getQualityProfileConfig(qualityProfile);
  return [
    `best[vcodec!=none][acodec!=none][height<=${quality.height}][fps<=${quality.fps}]`,
    `best[vcodec!=none][acodec!=none][height<=${quality.height}]`,
    "best[vcodec!=none][acodec!=none]",
    "best",
  ].join("/");
}

export function applyRuntimePerformanceGuardrails(
  preset: Pick<
    StreamPreset,
    | "sourceMode"
    | "sourceUrl"
    | "width"
    | "height"
    | "fps"
    | "bitrateVideoKbps"
    | "maxBitrateVideoKbps"
    | "bitrateAudioKbps"
    | "videoCodec"
  >,
  selectedEncoderMode: VideoEncoderMode,
) {
  const sourceProfile = detectSourceProfile(
    preset.sourceMode,
    preset.sourceUrl,
  );
  const requestedBitrateVideoKbps = preset.bitrateVideoKbps;
  const requestedMaxBitrateVideoKbps = preset.maxBitrateVideoKbps;
  let width = preset.width;
  let height = preset.height;
  let fps = preset.fps;
  let bitrateVideoKbps = preset.bitrateVideoKbps;
  let maxBitrateVideoKbps = preset.maxBitrateVideoKbps;
  let bitrateAudioKbps = preset.bitrateAudioKbps;
  const warnings: string[] = [];

  if (selectedEncoderMode === "software") {
    const exceeds1080p = width > 1920 || height > 1080;
    if (exceeds1080p) {
      const scale = Math.min(1920 / width, 1080 / height);
      width = Math.max(2, Math.round((width * scale) / 2) * 2);
      height = Math.max(2, Math.round((height * scale) / 2) * 2);
      warnings.push("High-resolution software encoding was capped to 1080p");
    }

    if (fps > 30 && (width >= 1920 || height >= 1080)) {
      fps = 30;
      warnings.push("Software encoding at 1080p+ was capped to 30 FPS");
    } else if (fps > 60) {
      fps = 60;
      warnings.push("Frame rate was capped to 60 FPS");
    }

    if (warnings.length > 0) {
      const recommended = getRecommendedBitrates(
        "custom",
        width,
        height,
        fps,
        preset.videoCodec,
        preset.sourceMode,
        preset.sourceUrl,
      );
      bitrateVideoKbps = Math.min(
        bitrateVideoKbps,
        recommended.maxBitrateVideoKbps,
      );
      maxBitrateVideoKbps = Math.min(
        Math.max(maxBitrateVideoKbps, bitrateVideoKbps),
        Math.max(recommended.maxBitrateVideoKbps, recommended.bitrateVideoKbps),
      );
      bitrateAudioKbps = Math.min(
        bitrateAudioKbps,
        recommended.bitrateAudioKbps,
      );
    }

    if (
      (sourceProfile === "yt-dlp" ||
        sourceProfile === "hls" ||
        sourceProfile === "mpeg-ts") &&
      (requestedBitrateVideoKbps > 9000 ||
        requestedMaxBitrateVideoKbps > 10000 ||
        bitrateVideoKbps > 9000)
    ) {
      bitrateVideoKbps = 9000;
      maxBitrateVideoKbps = Math.min(maxBitrateVideoKbps, 10000);
      warnings.push(
        "Remote live-style sources were capped to safer software bitrates",
      );
    }
  }

  if (
    preset.sourceMode === "yt-dlp" &&
    fps >= 60 &&
    selectedEncoderMode === "software"
  ) {
    warnings.push(
      "yt-dlp live sources at 60 FPS can require a hardware encoder",
    );
  }

  return {
    width,
    height,
    fps,
    bitrateVideoKbps,
    maxBitrateVideoKbps: Math.max(maxBitrateVideoKbps, bitrateVideoKbps),
    bitrateAudioKbps,
    warnings,
  };
}

function resolveExactQualityProfile(
  width: number,
  height: number,
  fps: number,
): QualityProfile | undefined {
  const exactMatch = Object.values(QUALITY_PROFILES).find(
    (profile) =>
      profile.id !== "custom" &&
      profile.width === width &&
      profile.height === height &&
      profile.fps === fps,
  );
  return exactMatch?.id;
}

export function buildEffectiveAdaptivePreset(
  preset: StreamPreset,
  selectedEncoderMode: VideoEncoderMode,
) {
  const guarded = applyRuntimePerformanceGuardrails(
    preset,
    selectedEncoderMode,
  );
  const effectiveQualityProfile =
    resolveExactQualityProfile(guarded.width, guarded.height, guarded.fps) ??
    "custom";
  const normalized = normalizePresetInput({
    name: preset.name,
    sourceUrl: preset.sourceUrl,
    sourceMode: preset.sourceMode,
    fallbackSources: preset.fallbackSources,
    qualityProfile: effectiveQualityProfile,
    bufferProfile: preset.bufferProfile,
    description: preset.description,
    includeAudio: preset.includeAudio,
    width: guarded.width,
    height: guarded.height,
    fps: guarded.fps,
    bitrateVideoKbps: guarded.bitrateVideoKbps,
    maxBitrateVideoKbps: guarded.maxBitrateVideoKbps,
    bitrateAudioKbps: guarded.bitrateAudioKbps,
    videoCodec: preset.videoCodec,
    hardwareAcceleration: preset.hardwareAcceleration,
    minimizeLatency: preset.minimizeLatency,
  });

  return {
    ...preset,
    ...normalized,
    fallbackSources: normalized.fallbackSources,
    description: normalized.description?.trim() ?? "",
  } satisfies StreamPreset;
}

function resolveAdaptiveStepId(
  preset: Pick<
    StreamPreset | PresetInput,
    "qualityProfile" | "width" | "height" | "fps"
  >,
): AdaptiveProfileStepId {
  if (preset.qualityProfile !== "custom") {
    return preset.qualityProfile;
  }

  if (preset.height <= 480 && preset.fps <= 30) {
    return "480p30";
  }
  if (preset.height <= 720 && preset.fps <= 30) {
    return "720p30";
  }
  if (preset.height <= 720) {
    return "720p60";
  }
  if (preset.height <= 1080 && preset.fps <= 30) {
    return "1080p30";
  }
  if (preset.height <= 1080) {
    return "1080p60";
  }
  if (preset.height <= 1440 && preset.fps <= 30) {
    return "1440p30";
  }
  if (preset.height <= 1440) {
    return "1440p60";
  }
  if (preset.fps <= 30) {
    return "2160p30";
  }
  return "2160p60";
}

function resolveAdaptiveStepIndex(
  preset: Pick<
    StreamPreset | PresetInput,
    "qualityProfile" | "width" | "height" | "fps"
  >,
) {
  const stepId = resolveAdaptiveStepId(preset);
  return ADAPTIVE_PROFILE_STEPS.findIndex((step) => step.id === stepId);
}

function getAdaptiveDowngradeStepId(
  stepId: AdaptiveProfileStepId,
): AdaptiveProfileStepId | undefined {
  switch (stepId) {
    case "720p30":
      return "480p30";
    case "720p60":
      return "720p30";
    case "1080p30":
      return "720p30";
    case "1080p60":
      return "1080p30";
    case "1440p30":
      return "1080p30";
    case "1440p60":
      return "1440p30";
    case "2160p30":
      return "1440p30";
    case "2160p60":
      return "2160p30";
    default:
      return undefined;
  }
}

function normalizeAdaptivePreset(
  basePreset: StreamPreset,
  override:
    | { kind: "exact-target"; preset: StreamPreset }
    | { kind: "step"; step: AdaptiveProfileStep },
) {
  if (override.kind === "exact-target") {
    const normalized = normalizePresetInput({
      name: override.preset.name,
      sourceUrl: override.preset.sourceUrl,
      sourceMode: override.preset.sourceMode,
      fallbackSources: override.preset.fallbackSources,
      qualityProfile: override.preset.qualityProfile,
      bufferProfile: override.preset.bufferProfile,
      description: override.preset.description,
      includeAudio: override.preset.includeAudio,
      width: override.preset.width,
      height: override.preset.height,
      fps: override.preset.fps,
      bitrateVideoKbps: override.preset.bitrateVideoKbps,
      maxBitrateVideoKbps: override.preset.maxBitrateVideoKbps,
      bitrateAudioKbps: override.preset.bitrateAudioKbps,
      videoCodec: override.preset.videoCodec,
      hardwareAcceleration: override.preset.hardwareAcceleration,
      minimizeLatency: override.preset.minimizeLatency,
    });

    return {
      ...basePreset,
      ...normalized,
      fallbackSources: normalized.fallbackSources,
      description: normalized.description?.trim() ?? "",
    } satisfies StreamPreset;
  }

  if (override.step.id === "480p30") {
    const recommended = getRecommendedBitrates(
      "custom",
      override.step.width,
      override.step.height,
      override.step.fps,
      basePreset.videoCodec,
      basePreset.sourceMode,
      basePreset.sourceUrl,
    );
    const normalized = normalizePresetInput({
      name: basePreset.name,
      sourceUrl: basePreset.sourceUrl,
      sourceMode: basePreset.sourceMode,
      fallbackSources: basePreset.fallbackSources,
      qualityProfile: "custom",
      bufferProfile: basePreset.bufferProfile,
      description: basePreset.description,
      includeAudio: basePreset.includeAudio,
      width: override.step.width,
      height: override.step.height,
      fps: override.step.fps,
      bitrateVideoKbps: recommended.bitrateVideoKbps,
      maxBitrateVideoKbps: recommended.maxBitrateVideoKbps,
      bitrateAudioKbps: recommended.bitrateAudioKbps,
      videoCodec: basePreset.videoCodec,
      hardwareAcceleration: basePreset.hardwareAcceleration,
      minimizeLatency: basePreset.minimizeLatency,
    });

    return {
      ...basePreset,
      ...normalized,
      fallbackSources: normalized.fallbackSources,
      description: normalized.description?.trim() ?? "",
    } satisfies StreamPreset;
  }

  const normalized = normalizePresetInput({
    name: basePreset.name,
    sourceUrl: basePreset.sourceUrl,
    sourceMode: basePreset.sourceMode,
    fallbackSources: basePreset.fallbackSources,
    qualityProfile: override.step.id,
    bufferProfile: basePreset.bufferProfile,
    description: basePreset.description,
    includeAudio: basePreset.includeAudio,
    width: override.step.width,
    height: override.step.height,
    fps: override.step.fps,
    bitrateVideoKbps: basePreset.bitrateVideoKbps,
    maxBitrateVideoKbps: basePreset.maxBitrateVideoKbps,
    bitrateAudioKbps: basePreset.bitrateAudioKbps,
    videoCodec: basePreset.videoCodec,
    hardwareAcceleration: basePreset.hardwareAcceleration,
    minimizeLatency: basePreset.minimizeLatency,
  });

  return {
    ...basePreset,
    ...normalized,
    fallbackSources: normalized.fallbackSources,
    description: normalized.description?.trim() ?? "",
  } satisfies StreamPreset;
}

export function buildAdaptiveDowngradePreset(currentPreset: StreamPreset) {
  const currentStepId = resolveAdaptiveStepId(currentPreset);
  const nextStepId = getAdaptiveDowngradeStepId(currentStepId);
  if (!nextStepId) {
    return undefined;
  }

  const nextStep = ADAPTIVE_PROFILE_STEPS.find(
    (step) => step.id === nextStepId,
  );
  if (!nextStep) {
    return undefined;
  }
  const nextPreset = normalizeAdaptivePreset(currentPreset, {
    kind: "step",
    step: nextStep,
  });

  return {
    preset: nextPreset,
    from: describePresetQuality(currentPreset),
    to: describePresetQuality(nextPreset),
  };
}

export function buildAdaptiveUpgradePreset(
  currentPreset: StreamPreset,
  targetPreset: StreamPreset,
) {
  const currentIndex = resolveAdaptiveStepIndex(currentPreset);
  const targetIndex = resolveAdaptiveStepIndex(targetPreset);

  if (
    currentIndex >= targetIndex &&
    currentPreset.qualityProfile === targetPreset.qualityProfile &&
    currentPreset.width === targetPreset.width &&
    currentPreset.height === targetPreset.height &&
    currentPreset.fps === targetPreset.fps &&
    currentPreset.bitrateVideoKbps === targetPreset.bitrateVideoKbps &&
    currentPreset.maxBitrateVideoKbps === targetPreset.maxBitrateVideoKbps &&
    currentPreset.bitrateAudioKbps === targetPreset.bitrateAudioKbps
  ) {
    return undefined;
  }

  let nextPreset: StreamPreset;
  if (currentPreset.height < targetPreset.height) {
    if (currentPreset.height < 720 && targetPreset.height >= 720) {
      nextPreset =
        targetPreset.height <= 720
          ? normalizeAdaptivePreset(currentPreset, {
              kind: "exact-target",
              preset: targetPreset,
            })
          : normalizeAdaptivePreset(currentPreset, {
              kind: "step",
              step: ADAPTIVE_PROFILE_STEPS[1],
            });
    } else if (currentPreset.height < 1080 && targetPreset.height >= 1080) {
      nextPreset =
        targetPreset.height <= 1080 && targetPreset.fps <= 30
          ? normalizeAdaptivePreset(currentPreset, {
              kind: "exact-target",
              preset: targetPreset,
            })
          : normalizeAdaptivePreset(currentPreset, {
              kind: "step",
              step: ADAPTIVE_PROFILE_STEPS[3],
            });
    } else if (currentPreset.height < 1440 && targetPreset.height >= 1440) {
      nextPreset =
        targetPreset.height <= 1440 && targetPreset.fps <= 30
          ? normalizeAdaptivePreset(currentPreset, {
              kind: "exact-target",
              preset: targetPreset,
            })
          : normalizeAdaptivePreset(currentPreset, {
              kind: "step",
              step: ADAPTIVE_PROFILE_STEPS[5],
            });
    } else {
      nextPreset =
        currentIndex + 1 >= targetIndex
          ? normalizeAdaptivePreset(currentPreset, {
              kind: "exact-target",
              preset: targetPreset,
            })
          : normalizeAdaptivePreset(currentPreset, {
              kind: "step",
              step: ADAPTIVE_PROFILE_STEPS[currentIndex + 1],
            });
    }
  } else if (
    currentPreset.height === targetPreset.height &&
    currentPreset.fps < targetPreset.fps
  ) {
    nextPreset = normalizeAdaptivePreset(currentPreset, {
      kind: "exact-target",
      preset: targetPreset,
    });
  } else {
    nextPreset = normalizeAdaptivePreset(currentPreset, {
      kind: "exact-target",
      preset: targetPreset,
    });
  }

  return {
    preset: nextPreset,
    from: describePresetQuality(currentPreset),
    to: describePresetQuality(nextPreset),
  };
}
