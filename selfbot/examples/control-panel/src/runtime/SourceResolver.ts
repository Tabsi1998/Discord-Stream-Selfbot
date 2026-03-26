import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { appConfig } from "../config/appConfig.js";
import { buildYtDlpFormatForPreset } from "../domain/presetProfiles.js";
import type { SourceMode, StreamPreset } from "../domain/types.js";
import { AppStateStore } from "../state/AppStateStore.js";

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
  resolverKind: "yt-dlp";
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);
const YOUTUBE_BOT_CHECK_PATTERN = /not a bot/i;
const BROWSER_COOKIE_COPY_PATTERN = /could not copy .*cookie database/i;

export function isYouTubeUrl(input: string) {
  try {
    const url = new URL(input);
    return YOUTUBE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function getCookieSourceLabel() {
  if (appConfig.ytDlpCookiesFile) {
    return `file:${appConfig.ytDlpCookiesFile}`;
  }
  if (appConfig.ytDlpCookiesFromBrowser) {
    return `browser:${appConfig.ytDlpCookiesFromBrowser}`;
  }
  return "none";
}

function buildCookieArgs() {
  if (appConfig.ytDlpCookiesFile) {
    if (!existsSync(appConfig.ytDlpCookiesFile)) {
      throw new Error(
        `YT_DLP_COOKIES_FILE does not exist: ${appConfig.ytDlpCookiesFile}`,
      );
    }
    return ["--cookies", appConfig.ytDlpCookiesFile];
  }

  if (appConfig.ytDlpCookiesFromBrowser) {
    return ["--cookies-from-browser", appConfig.ytDlpCookiesFromBrowser];
  }

  return [];
}

function enhanceYtDlpError(message: string) {
  if (BROWSER_COOKIE_COPY_PATTERN.test(message)) {
    return `${message}\nConfigured cookie source: ${getCookieSourceLabel()}. Close the browser completely and try again, or switch to YT_DLP_COOKIES_FILE with an exported Netscape cookies file.`;
  }

  if (YOUTUBE_BOT_CHECK_PATTERN.test(message)) {
    if (appConfig.ytDlpCookiesFile || appConfig.ytDlpCookiesFromBrowser) {
      return `${message}\nConfigured cookie source: ${getCookieSourceLabel()}. Refresh the cookies or verify that the selected browser profile is logged into YouTube.`;
    }

    return `${message}\nConfigure YT_DLP_COOKIES_FROM_BROWSER=edge (or chrome/firefox) or YT_DLP_COOKIES_FILE=/path/to/cookies.txt and restart the control panel.`;
  }

  // Detect rate-limiting or HTTP 429 errors
  if (/429|too many requests|rate.?limit/i.test(message)) {
    return `${message}\nYouTube rate-limiting detected. Wait a few minutes before retrying, or use cookies for authenticated access.`;
  }

  // Detect geo-restriction errors
  if (/geo.?restrict|not available in your country|blocked.*country/i.test(message)) {
    return `${message}\nThis content appears to be geo-restricted. A VPN or proxy may be needed.`;
  }

  return message;
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
        resolverKind: "yt-dlp",
      };
    }

    const ytDlpPath = appConfig.ytDlpPath;

    if (!ytDlpPath) {
      throw new Error("yt-dlp is required for this preset but was not detected");
    }

    // Build a list of YouTube client attempts for resilient resolution.
    // YouTube frequently blocks individual clients with bot-checks; cycling
    // through multiple clients dramatically improves success rates.
    const attempts: { label: string; extractorArgs: string | undefined }[] = [
      { label: "default", extractorArgs: undefined },
    ];

    if (isYouTubeUrl(preset.sourceUrl)) {
      // Primary retry: configured extractor args (default: android)
      if (appConfig.ytDlpYouTubeExtractorArgs) {
        attempts.push({
          label: "youtube-client-android",
          extractorArgs: appConfig.ytDlpYouTubeExtractorArgs,
        });
      }

      // Additional YouTube client fallbacks for bot-check resilience
      const additionalClients = [
        "youtube:player_client=ios",
        "youtube:player_client=web_creator",
        "youtube:player_client=mweb",
        "youtube:player_client=tv",
      ];
      for (const client of additionalClients) {
        if (client !== appConfig.ytDlpYouTubeExtractorArgs) {
          attempts.push({
            label: `youtube-client-${client.split("=")[1]}`,
            extractorArgs: client,
          });
        }
      }
    }

    const errors: string[] = [];
    let lastBotCheck = false;

    for (const attempt of attempts) {
      try {
        cancelSignal?.throwIfAborted();
        return await this.resolveViaYtDlp(
          preset,
          cancelSignal,
          attempt.extractorArgs,
        );
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "yt-dlp resolution failed";
        errors.push(message);
        lastBotCheck = YOUTUBE_BOT_CHECK_PATTERN.test(message);

        if (attempt.extractorArgs) {
          this.store.appendLog("warn", "yt-dlp retry failed", {
            preset: preset.name,
            url: preset.sourceUrl,
            extractorArgs: attempt.extractorArgs,
            error: message.slice(0, 200),
          });
        }

        // If it's not a bot-check error, don't bother trying more clients
        if (!lastBotCheck && attempts.indexOf(attempt) > 0) {
          break;
        }
      }
    }

    // Provide a clear, actionable error message
    const baseError = errors[0] ?? "yt-dlp resolution failed";
    if (errors.length > 1 && lastBotCheck) {
      throw new Error(
        `All ${errors.length} YouTube client attempts failed with bot-check.\n${baseError}`,
      );
    }
    if (errors.length > 1) {
      throw new Error(
        `${baseError}\nRetry with ${errors.length - 1} alternate YouTube client(s) also failed.`,
      );
    }
    throw new Error(baseError);
  }

  private async resolveViaYtDlp(
    preset: StreamPreset,
    cancelSignal?: AbortSignal,
    extractorArgs?: string,
  ): Promise<ResolvedSource> {
    const ytDlpPath = appConfig.ytDlpPath;
    if (!ytDlpPath) {
      throw new Error("yt-dlp is required for this preset but was not detected");
    }

    const cookieArgs = buildCookieArgs();
    const args = [
      "--no-warnings",
      "--no-playlist",
      ...cookieArgs,
      ...(extractorArgs ? ["--extractor-args", extractorArgs] : []),
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
      cookieSource: getCookieSourceLabel(),
      extractorArgs: extractorArgs ?? "",
    });

    const child = spawn(ytDlpPath, args, {
      stdio: "pipe",
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
        child.once("close", (code: number | null) => {
          if (code !== 0) {
            const stderr = stderrChunks.join("").trim();
            reject(
              new Error(
                enhanceYtDlpError(
                  stderr || `yt-dlp exited with status ${code ?? "unknown"}`,
                ),
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
        resolverKind: "yt-dlp",
      };
    } finally {
      cancelSignal?.removeEventListener("abort", abortChild);
    }
  }
}
