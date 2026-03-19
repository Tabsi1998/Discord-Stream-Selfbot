import { spawn } from "node:child_process";
import { appConfig } from "./config.js";
import { buildYtDlpFormatForPreset } from "./presetProfiles.js";
import { AppStateStore } from "./storage.js";
import type { SourceMode, StreamPreset } from "./types.js";

export type ResolvedSource = {
  input:
    | string
    | {
        video: string;
        audio?: string;
      };
  inputUrl: string;
  sourceMode: SourceMode;
  resolvedTitle?: string;
  isLive?: boolean;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export function isYouTubeUrl(input: string) {
  try {
    const url = new URL(input);
    return YOUTUBE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export class SourceResolver {
  constructor(private readonly store: AppStateStore) {}

  public async resolve(
    preset: StreamPreset,
    cancelSignal?: AbortSignal,
  ): Promise<ResolvedSource> {
    cancelSignal?.throwIfAborted();

    if (preset.sourceMode === "direct") {
      return {
        input: preset.sourceUrl,
        inputUrl: preset.sourceUrl,
        sourceMode: preset.sourceMode,
      };
    }

    if (!appConfig.ytDlpPath) {
      throw new Error("yt-dlp is required for this preset but was not detected");
    }

    const args = [
      "--no-warnings",
      "--no-playlist",
      "--format",
      buildYtDlpFormatForPreset(preset.qualityProfile, appConfig.ytDlpFormat),
      "--print",
      "%(title)s",
      "--print",
      "%(is_live)s",
      "-g",
      preset.sourceUrl,
    ];

    this.store.appendLog("info", "Resolving source via yt-dlp", {
      preset: preset.name,
      url: preset.sourceUrl,
    });

    const child = spawn(appConfig.ytDlpPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(chunk.toString());
    });

    const abortChild = () => {
      try {
        child.kill();
      } catch {}
    };

    cancelSignal?.addEventListener("abort", abortChild, { once: true });

    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => {
          if (code !== 0) {
            const stderr = stderrChunks.join("").trim();
            reject(
              new Error(
                stderr || `yt-dlp exited with status ${code ?? "unknown"}`,
              ),
            );
            return;
          }
          resolve(stdoutChunks.join(""));
        });
      });

      cancelSignal?.throwIfAborted();

      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 3) {
        throw new Error("yt-dlp did not return a playable media URL");
      }

      const [resolvedTitle, isLiveFlag, ...urls] = lines;
      if (urls.length > 2) {
        throw new Error(
          "yt-dlp returned more media streams than expected",
        );
      }

      if (urls.length === 0) {
        throw new Error("yt-dlp did not return a playable media URL");
      }

      const input =
        urls.length === 1
          ? urls[0]
          : {
              video: urls[0],
              audio: urls[1],
            };

      return {
        input,
        inputUrl: preset.sourceUrl,
        sourceMode: preset.sourceMode,
        resolvedTitle,
        isLive: isLiveFlag.toLowerCase() === "true",
      };
    } finally {
      cancelSignal?.removeEventListener("abort", abortChild);
    }
  }
}
