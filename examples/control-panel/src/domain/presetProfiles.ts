import type {
  BufferProfile,
  PresetInput,
  QualityProfile,
  SourceMode,
  StreamPreset,
  VideoEncoderMode,
  VideoCodec,
} from "./types.js";

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

export function getRecommendedBitrates(
  _qualityProfile: QualityProfile,
  width: number,
  height: number,
  fps: number,
  codec: VideoCodec,
) {
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
  _qualityProfile: QualityProfile,
  width: number,
  height: number,
  fps: number,
): BufferStrategyId {
  if (sourceMode === "yt-dlp" && fps >= 60) return "stable";
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
    );
    bitrateVideoKbps = recommended.bitrateVideoKbps;
    maxBitrateVideoKbps = recommended.maxBitrateVideoKbps;
    bitrateAudioKbps = recommended.bitrateAudioKbps;
  }

  const effectiveBufferProfile =
    bufferProfile === "auto"
      ? pickAutoBufferProfile(
          input.sourceMode,
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
  const effectiveBufferProfile =
    bufferProfile === "auto"
      ? pickAutoBufferProfile(
          preset.sourceMode,
          qualityProfile,
          preset.width,
          preset.height,
          preset.fps,
        )
      : bufferProfile;
  const bufferStrategy = getBufferStrategy(effectiveBufferProfile);

  return {
    qualityProfile,
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
    bitrateBufferFactor: bufferStrategy.bitrateBufferFactor,
    readrateInitialBurst: bufferStrategy.readrateInitialBurst,
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

export function applyRuntimePerformanceGuardrails(
  preset: Pick<
    StreamPreset,
    | "sourceMode"
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
