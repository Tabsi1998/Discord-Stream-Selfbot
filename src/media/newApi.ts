import pDebounce from "p-debounce";
import sharp from "sharp";
import Log from "debug-level";
import { FFmpegCommand } from "fluent-ffmpeg-simplified";
import { type Packet, AV_PKT_FLAG_KEY } from "node-av";
import { PassThrough, type Readable } from "node:stream";
import { demux } from "./LibavDemuxer.js";
import { VideoStream } from "./VideoStream.js";
import { AudioStream } from "./AudioStream.js";
import { isBun, isDeno, isFiniteNonZero } from "../utils.js";
import { AVCodecID } from "./LibavCodecId.js";
import { createDecoder } from "./LibavDecoder.js";
import { Encoders } from "./encoders/index.js";

import type { Request } from "zeromq";
import type { SupportedVideoCodec } from "../utils.js";
import type { Streamer } from "../client/index.js";
import type { EncoderSettingsGetter } from "./encoders/index.js";
import type { VideoStreamInfo } from "./LibavDemuxer.js";
import type { WebRtcConnWrapper } from "../client/voice/WebRtcWrapper.js";

export type PrepareStreamSource = string | Readable;
export type PrepareStreamInput =
  | PrepareStreamSource
  | {
      video: PrepareStreamSource;
      audio?: PrepareStreamSource;
    };

export type PrepareStreamOptions = {
  /**
   * Disable video transcoding
   * If enabled, all video related settings have no effects, and the input
   * video stream is used as-is.
   *
   * You need to ensure that the video stream has the right properties
   * (keyframe every 1s, B-frames disabled). Failure to do so will result in
   * a glitchy stream, or degraded performance
   */
  noTranscoding: boolean;

  /**
   * Video width
   */
  width: number;

  /**
   * Video height
   */
  height: number;

  /**
   * Video frame rate
   */
  frameRate?: number;

  /**
   * Video codec
   */
  videoCodec: SupportedVideoCodec;

  /**
   * Video average bitrate in kbps
   */
  bitrateVideo: number;

  /**
   * Video max bitrate in kbps
   */
  bitrateVideoMax: number;

  /**
   * Audio bitrate in kbps
   */
  bitrateAudio: number;

  /**
   * Enable audio output
   */
  includeAudio: boolean;

  /**
   * Functions to get encoder settings
   * This function will receive the average and max bitrate as the input, and
   * returns an object containing encoder settings for the supported codecs
   */
  encoder: EncoderSettingsGetter;

  /**
   * Enable hardware accelerated decoding
   */
  hardwareAcceleratedDecoding: boolean;

  /**
   * Add some options to minimize latency
   */
  minimizeLatency: boolean;

  /**
   * Custom headers for HTTP requests
   */
  customHeaders: Record<string, string>;

  /**
   * Custom input options to pass directly to ffmpeg
   * These will be added to the command before other options
   */
  customInputOptions: string[];

  /**
   * Custom ffmpeg flags/options to pass directly to ffmpeg
   * These will be added to the command after other options
   */
  customFfmpegFlags: string[];

  /**
   * Multiplier used to derive ffmpeg's VBV buffer size from max bitrate
   */
  bitrateBufferFactor: number;

  /**
   * FFmpeg log level
   */
  logLevel:
    | "quiet"
    | "panic"
    | "fatal"
    | "error"
    | "warning"
    | "info"
    | "verbose"
    | "debug"
    | "trace";
};

export type Controller = {
  volume: number;
  setVolume(newVolume: number): Promise<boolean>;
};

export function prepareStream(
  input: PrepareStreamInput,
  options: Partial<PrepareStreamOptions> = {},
  cancelSignal?: AbortSignal,
) {
  cancelSignal?.throwIfAborted();

  const logger = new Log("prepareStream");
  const loggerFFmpeg = new Log("prepareStream:ffmpeg");
  const defaultOptions = {
    noTranscoding: false,
    // negative values = resize by aspect ratio, see https://trac.ffmpeg.org/wiki/Scaling
    width: -2,
    height: -2,
    frameRate: undefined,
    videoCodec: "H264",
    bitrateVideo: 5000,
    bitrateVideoMax: 7000,
    bitrateAudio: 128,
    includeAudio: true,
    encoder: Encoders.software(),
    hardwareAcceleratedDecoding: false,
    minimizeLatency: false,
    customHeaders: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.3",
      Connection: "keep-alive",
    },
    customInputOptions: [],
    customFfmpegFlags: [],
    bitrateBufferFactor: 2,
    logLevel: "verbose",
  } satisfies PrepareStreamOptions;

  function mergeOptions(opts: Partial<PrepareStreamOptions>) {
    return {
      noTranscoding: opts.noTranscoding ?? defaultOptions.noTranscoding,

      width: isFiniteNonZero(opts.width)
        ? Math.round(opts.width)
        : defaultOptions.width,

      height: isFiniteNonZero(opts.height)
        ? Math.round(opts.height)
        : defaultOptions.height,

      frameRate:
        isFiniteNonZero(opts.frameRate) && opts.frameRate > 0
          ? opts.frameRate
          : defaultOptions.frameRate,

      videoCodec: opts.videoCodec ?? defaultOptions.videoCodec,

      bitrateVideo:
        isFiniteNonZero(opts.bitrateVideo) && opts.bitrateVideo > 0
          ? Math.round(opts.bitrateVideo)
          : defaultOptions.bitrateVideo,

      bitrateVideoMax:
        isFiniteNonZero(opts.bitrateVideoMax) && opts.bitrateVideoMax > 0
          ? Math.round(opts.bitrateVideoMax)
          : defaultOptions.bitrateVideoMax,

      bitrateAudio:
        isFiniteNonZero(opts.bitrateAudio) && opts.bitrateAudio > 0
          ? Math.round(opts.bitrateAudio)
          : defaultOptions.bitrateAudio,

      encoder: opts.encoder ?? defaultOptions.encoder,

      includeAudio: opts.includeAudio ?? defaultOptions.includeAudio,

      hardwareAcceleratedDecoding:
        opts.hardwareAcceleratedDecoding ??
        defaultOptions.hardwareAcceleratedDecoding,

      minimizeLatency: opts.minimizeLatency ?? defaultOptions.minimizeLatency,

      customHeaders: {
        ...defaultOptions.customHeaders,
        ...opts.customHeaders,
      },

      customInputOptions:
        opts.customInputOptions ?? defaultOptions.customInputOptions,

      customFfmpegFlags:
        opts.customFfmpegFlags ?? defaultOptions.customFfmpegFlags,

      bitrateBufferFactor:
        isFiniteNonZero(opts.bitrateBufferFactor) &&
        opts.bitrateBufferFactor > 0
          ? opts.bitrateBufferFactor
          : defaultOptions.bitrateBufferFactor,

      logLevel: opts.logLevel ?? defaultOptions.logLevel,
    } satisfies PrepareStreamOptions;
  }

  const mergedOptions = mergeOptions(options);

  const output = new PassThrough();

  // command creation
  const command = new FFmpegCommand();
  command.on("stderr", (line) => {
    loggerFFmpeg.debug(line);
  });
  const resolvedInput =
    typeof input === "object" && !("pipe" in input) ? input : { video: input };

  const inputSources = [
    { src: resolvedInput.video, role: "video" as const },
    ...(resolvedInput.audio
      ? [{ src: resolvedInput.audio, role: "audio" as const }]
      : []),
  ];

  const { hardwareAcceleratedDecoding, minimizeLatency, customHeaders } =
    mergedOptions;

  for (const [index, source] of inputSources.entries()) {
    let isHttpUrl = false;
    let isHls = false;
    let isSrt = false;

    if (typeof source.src === "string") {
      isHttpUrl =
        source.src.startsWith("http") || source.src.startsWith("https");
      isHls = source.src.includes("m3u");
      isSrt = source.src.startsWith("srt://");
    }

    command.input(source.src);

    if (index === 0) {
      command.inputOptions(
        "-y",
        "-loglevel",
        mergedOptions.logLevel,
        "-nostats",
      );
    }

    if (
      mergedOptions.customInputOptions &&
      mergedOptions.customInputOptions.length > 0
    ) {
      command.inputOptions(mergedOptions.customInputOptions);
    }

    if (hardwareAcceleratedDecoding && source.role === "video") {
      command.inputOptions("-hwaccel", "auto");
    }

    if (minimizeLatency) {
      command.inputOptions(
        "-fflags nobuffer",
        "-flags lowdelay",
        "-flush_packets 1",
        "-max_delay 100000",
      );
    }

    if (isHttpUrl) {
      const serializedHeaders = Object.entries(customHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n");

      // The ffmpeg wrapper tokenizes string input like a shell command. Wrap the
      // header blob so spaces inside header values remain a single argument.
      command.inputOptions("-headers", `"${serializedHeaders}"`);
      if (!isHls) {
        command.inputOptions([
          "-reconnect 1",
          "-reconnect_at_eof 1",
          "-reconnect_streamed 1",
          "-reconnect_delay_max 4294",
        ]);
      }
    }

    if (isSrt) {
      command.inputOptions("-scan_all_pmts 0");
    }
  }

  // general output options
  command.output(output).format("nut");

  // video setup
  const {
    noTranscoding,
    width,
    height,
    frameRate,
    bitrateVideo,
    bitrateVideoMax,
    bitrateBufferFactor,
    videoCodec,
    encoder,
  } = mergedOptions;
  const keyframeInterval = Math.max(Math.round(frameRate ?? 30), 1);
  const targetBitrate = Math.min(bitrateVideo, bitrateVideoMax);
  const maxBitrate = Math.max(targetBitrate, bitrateVideoMax);
  const bufferSize = Math.max(
    Math.round(maxBitrate * bitrateBufferFactor),
    Math.round(targetBitrate * bitrateBufferFactor),
  );

  command.outputOptions("-map 0:v:0");

  if (noTranscoding) {
    command.videoCodec("copy");
  } else {
    if (width > 0 && height > 0) {
      command.videoFilters([
        {
          filter: "scale",
          options: {
            w: width,
            h: height,
            force_original_aspect_ratio: "decrease",
          },
        },
        {
          filter: "pad",
          options: {
            w: width,
            h: height,
            x: "(ow-iw)/2",
            y: "(oh-ih)/2",
          },
        },
        "setsar=1",
      ]);
    } else {
      command.videoFilters([`scale=${width}:${height}`, "setsar=1"]);
    }

    if (frameRate) command.fps(frameRate);

    command.outputOptions([
      "-b:v",
      `${targetBitrate}k`,
      "-maxrate:v",
      `${maxBitrate}k`,
      "-bufsize:v",
      `${bufferSize}k`,
      "-bf",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-g",
      `${keyframeInterval}`,
      "-keyint_min",
      `${keyframeInterval}`,
      "-sc_threshold",
      "0",
      "-fps_mode",
      "cfr",
      "-force_key_frames",
      "expr:gte(t,n_forced*1)",
    ]);

    const encoderSettings = encoder(targetBitrate, maxBitrate)[videoCodec];
    if (!encoderSettings)
      throw new Error(`Encoder settings not specified for ${videoCodec}`);
    command
      .videoCodec(encoderSettings.name)
      .videoFilters(encoderSettings.outFilters ?? [])
      .outputOptions(encoderSettings.options)
      .outputOptions(encoderSettings.globalOptions ?? []);
  }

  // audio setup
  const { includeAudio, bitrateAudio } = mergedOptions;
  if (includeAudio)
    command
      .outputOptions(resolvedInput.audio ? "-map 1:a:0?" : "-map 0:a:0?")
      .audioChannels(2)
      /*
       * I don't have much surround sound material to test this with,
       * if you do and you have better settings for this, feel free to
       * contribute!
       */
      .outputOptions("-lfe_mix_level 1")
      .audioFrequency(48000)
      .audioCodec("libopus")
      .audioBitrate(`${bitrateAudio}k`)
      .audioFilters("volume@internal_lib=1.0");

  // Add custom ffmpeg flags
  if (
    mergedOptions.customFfmpegFlags &&
    mergedOptions.customFfmpegFlags.length > 0
  ) {
    command.outputOptions(mergedOptions.customFfmpegFlags);
  }

  // realtime control mechanism
  let currentVolume = 1;
  let zmqClientPromise: Promise<Request> | undefined;
  if (includeAudio && !isBun() && !isDeno()) {
    function randomInclusive(start: number, end: number) {
      return Math.floor(Math.random() * (end - start + 1)) + start;
    }
    // Last octet is from 2 to 254 to avoid WSL2 shenanigans
    const loopbackIp = [
      127,
      randomInclusive(0, 255),
      randomInclusive(0, 255),
      randomInclusive(2, 254),
    ].join(".");
    const zmqEndpoint = `tcp://${loopbackIp}:42069`;
    command.audioFilters(`azmq=b=${zmqEndpoint.replaceAll(":", "\\\\:")}`);
    zmqClientPromise = import("zeromq").then((zmq) => {
      const client = new zmq.Request({
        sendTimeout: 5000,
        receiveTimeout: 5000,
      });
      client.connect(zmqEndpoint);
      promise.catch(() => {}).finally(() => client.disconnect(zmqEndpoint));
      return client;
    });
  }

  command.once("start", (cmdline) => {
    logger.debug(`Starting ffmpeg: ${cmdline}`);
  });
  const promise = command.run(cancelSignal);

  return {
    command,
    output,
    promise: promise as Promise<unknown>,
    controller: {
      get volume() {
        return currentVolume;
      },
      async setVolume(newVolume: number) {
        if (newVolume < 0) return false;
        try {
          if (!zmqClientPromise) return false;
          const client = await zmqClientPromise;
          await client.send(`volume@internal_lib volume ${newVolume}`);
          const [res] = await client.receive();
          if (res.toString("utf-8").split(" ")[0] !== "0") return false;
          currentVolume = newVolume;
          return true;
        } catch {
          return false;
        }
      },
    } satisfies Controller,
  };
}

export type PlayStreamOptions = {
  /**
   * Set stream type as "Go Live" or camera stream
   */
  type: "go-live" | "camera";

  /**
   * Set format of the stream
   */
  format: "matroska" | "nut";

  /**
   * Override video width sent to Discord.
   *
   * DO NOT SPECIFY UNLESS YOU KNOW WHAT YOU'RE DOING!
   */
  width: number | ((v: VideoStreamInfo) => number);

  /**
   * Override video height sent to Discord.
   *
   * DO NOT SPECIFY UNLESS YOU KNOW WHAT YOU'RE DOING!
   */
  height: number | ((v: VideoStreamInfo) => number);

  /**
   * Override video frame rate sent to Discord.
   *
   * DO NOT SPECIFY UNLESS YOU KNOW WHAT YOU'RE DOING!
   */
  frameRate: number | ((v: VideoStreamInfo) => number);

  /**
   * Same as ffmpeg's `readrate_initial_burst` command line flag
   *
   * See https://ffmpeg.org/ffmpeg.html#:~:text=%2Dreadrate_initial_burst
   */
  readrateInitialBurst: number | undefined;

  /**
   * Enable stream preview from input stream (experimental)
   */
  streamPreview: boolean;
};

export async function playStream(
  input: Readable,
  streamer: Streamer,
  options: Partial<PlayStreamOptions> = {},
  cancelSignal?: AbortSignal,
) {
  const logger = new Log("playStream");
  cancelSignal?.throwIfAborted();
  if (!streamer.voiceConnection)
    throw new Error("Bot is not connected to a voice channel");

  const defaultOptions = {
    type: "go-live",
    format: "nut",
    width: (video) => video.width,
    height: (video) => video.height,
    frameRate: (video) => video.framerate_num / video.framerate_den,
    readrateInitialBurst: undefined,
    streamPreview: false,
  } satisfies PlayStreamOptions;

  function mergeOptions(opts: Partial<PlayStreamOptions>) {
    return {
      type: opts.type ?? defaultOptions.type,

      format: opts.format ?? defaultOptions.format,

      width:
        typeof opts.width === "function" ||
        (isFiniteNonZero(opts.width) && opts.width > 0)
          ? opts.width
          : defaultOptions.width,

      height:
        typeof opts.height === "function" ||
        (isFiniteNonZero(opts.height) && opts.height > 0)
          ? opts.height
          : defaultOptions.height,

      frameRate:
        typeof opts.frameRate === "function" ||
        (isFiniteNonZero(opts.frameRate) && opts.frameRate > 0)
          ? opts.frameRate
          : defaultOptions.frameRate,

      readrateInitialBurst:
        isFiniteNonZero(opts.readrateInitialBurst) &&
        opts.readrateInitialBurst > 0
          ? opts.readrateInitialBurst
          : defaultOptions.readrateInitialBurst,

      streamPreview: opts.streamPreview ?? defaultOptions.streamPreview,
    } satisfies PlayStreamOptions;
  }

  const mergedOptions = mergeOptions(options);
  logger.debug({ options: mergedOptions }, "Merged options");

  logger.debug("Initializing demuxer");
  const { video, audio } = await demux(input, {
    format: mergedOptions.format,
  });
  cancelSignal?.throwIfAborted();

  if (!video) throw new Error("No video stream in media");

  const cleanupFuncs: (() => unknown)[] = [];
  const videoCodecMap: Record<number, SupportedVideoCodec> = {
    [AVCodecID.AV_CODEC_ID_H264]: "H264",
    [AVCodecID.AV_CODEC_ID_H265]: "H265",
    [AVCodecID.AV_CODEC_ID_VP8]: "VP8",
    [AVCodecID.AV_CODEC_ID_VP9]: "VP9",
    [AVCodecID.AV_CODEC_ID_AV1]: "AV1",
  };

  let conn: WebRtcConnWrapper;
  let stopStream: () => unknown;
  if (mergedOptions.type === "go-live") {
    conn = await streamer.createStream();
    stopStream = () => streamer.stopStream();
  } else {
    conn = streamer.voiceConnection.webRtcConn;
    streamer.signalVideo(true);
    stopStream = () => streamer.signalVideo(false);
  }
  conn.setPacketizer(videoCodecMap[video.codec]);
  conn.mediaConnection.setSpeaking(true);
  const { width, height, frameRate } = mergedOptions;
  conn.mediaConnection.setVideoAttributes(true, {
    width: Math.round(typeof width === "function" ? width(video) : width),
    height: Math.round(typeof height === "function" ? height(video) : height),
    fps: Math.round(
      typeof frameRate === "function" ? frameRate(video) : frameRate,
    ),
  });

  const vStream = new VideoStream(conn);
  video.stream.pipe(vStream);
  if (audio) {
    const aStream = new AudioStream(conn);
    audio.stream.pipe(aStream);
    vStream.syncStream = aStream;

    const burstTime = mergedOptions.readrateInitialBurst;
    if (typeof burstTime === "number") {
      vStream.sync = false;
      vStream.noSleep = aStream.noSleep = true;
      const stopBurst = (pts: number) => {
        if (pts < burstTime * 1000) return;
        vStream.sync = true;
        vStream.noSleep = aStream.noSleep = false;
        vStream.off("pts", stopBurst);
      };
      vStream.on("pts", stopBurst);
    }
  }
  if (mergedOptions.streamPreview && mergedOptions.type === "go-live") {
    (async () => {
      const logger = new Log("playStream:preview");
      logger.debug("Initializing decoder for stream preview");
      const decoder = await createDecoder(video.avStream);
      if (!decoder) {
        logger.warn(
          "Failed to initialize decoder. Stream preview will be disabled",
        );
        return;
      }
      cleanupFuncs.push(() => {
        logger.debug("Freeing decoder");
        decoder.free();
      });
      const updatePreview = pDebounce.promise(async (packet: Packet) => {
        if (!(packet.flags !== undefined && packet.flags & AV_PKT_FLAG_KEY))
          return;
        const decodeStart = performance.now();
        const frames = await decoder.decode(packet).catch((e) => {
          logger.error(e, "Failed to decode the frame");
          return [];
        });
        if (!frames.length) return;

        const decodeEnd = performance.now();
        logger.debug(`Decoding a frame took ${decodeEnd - decodeStart}ms`);
        const frame = frames[0];

        return sharp(frame.toBuffer(), {
          raw: {
            width: frame.width ?? 0,
            height: frame.height ?? 0,
            channels: 4,
          },
        })
          .resize(1024, 576, { fit: "inside" })
          .jpeg()
          .toBuffer()
          .then((image) => streamer.setStreamPreview(image))
          .catch(() => {})
          .finally(() => {
            frames.forEach((frame) => {
              frame.free();
            });
          });
      });
      video.stream.on("data", updatePreview);
      cleanupFuncs.push(() => video.stream.off("data", updatePreview));
    })();
  }
  const promise = new Promise<void>((resolve, reject) => {
    cleanupFuncs.push(() => {
      stopStream();
      conn.mediaConnection.setSpeaking(false);
      conn.mediaConnection.setVideoAttributes(false);
    });
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      for (const f of cleanupFuncs) f();
    };
    cancelSignal?.addEventListener(
      "abort",
      () => {
        cleanup();
        reject(cancelSignal.reason);
      },
      { once: true },
    );
    vStream.once("finish", () => {
      if (cancelSignal?.aborted) return;
      cleanup();
      resolve();
    });
  });
  promise.catch(() => {});
  return promise;
}
