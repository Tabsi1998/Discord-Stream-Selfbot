import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../config/appConfig.js";
import {
  buildYtDlpFormatForPreset,
  buildYtDlpMuxedFormatForPreset,
} from "../domain/presetProfiles.js";
import type {
  FallbackSource,
  SourceMode,
  StreamPreset,
} from "../domain/types.js";
import type { AppStateStore } from "../state/AppStateStore.js";

// Auto-discover cookie file in the cookies directory
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTO_COOKIE_PATH = resolve(appDir, "cookies", "yt-dlp-cookies.txt");
const OAUTH2_TOKEN_PATH = resolve(
  process.env.HOME || "/root",
  ".cache",
  "yt-dlp",
  "youtube-oauth2",
  "token_data.json",
);

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
  resolverKind: "direct" | "yt-dlp";
  usedFallback?: boolean;
  fallbackIndex?: number;
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
  // Check auto-discovered cookie file
  if (existsSync(AUTO_COOKIE_PATH)) {
    return `file:${AUTO_COOKIE_PATH} (auto)`;
  }
  return "none";
}

function buildCookieArgs() {
  // Priority 1: Explicitly configured cookie file
  if (appConfig.ytDlpCookiesFile) {
    if (!existsSync(appConfig.ytDlpCookiesFile)) {
      throw new Error(
        `YT_DLP_COOKIES_FILE does not exist: ${appConfig.ytDlpCookiesFile}`,
      );
    }
    return ["--cookies", appConfig.ytDlpCookiesFile];
  }

  // Priority 2: Browser cookies
  if (appConfig.ytDlpCookiesFromBrowser) {
    return ["--cookies-from-browser", appConfig.ytDlpCookiesFromBrowser];
  }

  // Priority 3: Auto-discovered cookie file in cookies/ directory
  if (existsSync(AUTO_COOKIE_PATH)) {
    return ["--cookies", AUTO_COOKIE_PATH];
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
  if (
    /geo.?restrict|not available in your country|blocked.*country/i.test(
      message,
    )
  ) {
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
    const sources: Array<
      FallbackSource & {
        label: string;
        usedFallback: boolean;
      }
    > = [
      {
        url: preset.sourceUrl,
        sourceMode: preset.sourceMode,
        label: "primary",
        usedFallback: false,
      },
      ...preset.fallbackSources.map((source, index) => ({
        ...source,
        label: `fallback-${index + 1}`,
        usedFallback: true,
      })),
    ];
    const errors: string[] = [];

    for (const [index, source] of sources.entries()) {
      cancelSignal?.throwIfAborted();

      try {
        const resolved = await this.resolveSingleSource(
          preset,
          source,
          cancelSignal,
        );

        if (source.usedFallback) {
          this.store.appendLog("warn", "Fallback source selected", {
            preset: preset.name,
            fallbackIndex: String(index),
            sourceMode: source.sourceMode,
            url: source.url,
          });
        }

        return {
          ...resolved,
          usedFallback: source.usedFallback,
          fallbackIndex: source.usedFallback ? index - 1 : undefined,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Source resolution failed";
        errors.push(message);

        if (index < sources.length - 1) {
          this.store.appendLog(
            "warn",
            "Source resolution failed, trying fallback",
            {
              preset: preset.name,
              sourceMode: source.sourceMode,
              url: source.url,
              next: sources[index + 1]?.label ?? "none",
              error: message.slice(0, 160),
            },
          );
        }
      }
    }

    const baseError = errors[0] ?? "Source resolution failed";
    throw new Error(
      errors.length > 1
        ? `${baseError}\n${errors.length - 1} fallback attempt(s) also failed.`
        : baseError,
    );
  }

  private async resolveSingleSource(
    preset: StreamPreset,
    source: FallbackSource,
    cancelSignal?: AbortSignal,
  ): Promise<ResolvedSource> {
    cancelSignal?.throwIfAborted();

    if (source.sourceMode === "direct") {
      return {
        input: source.url,
        inputUrl: source.url,
        sourceMode: source.sourceMode,
        resolverKind: "direct",
      };
    }

    const ytDlpPath = appConfig.ytDlpPath;

    if (!ytDlpPath) {
      throw new Error(
        "yt-dlp is required for this preset but was not detected",
      );
    }

    const hasOAuth2 = existsSync(OAUTH2_TOKEN_PATH);
    const _hasCookies = buildCookieArgs().length > 0;
    let lastBotCheck = false;

    try {
      cancelSignal?.throwIfAborted();
      return await this.resolveViaYtDlp(
        preset,
        source,
        cancelSignal,
        undefined,
        false,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "yt-dlp failed";
      lastBotCheck = YOUTUBE_BOT_CHECK_PATTERN.test(message);

      if (!lastBotCheck && !isYouTubeUrl(source.url)) {
        throw error;
      }
    }

    if (lastBotCheck && hasOAuth2) {
      this.store.appendLog("info", "Bot-check detected, retrying with OAuth2", {
        preset: preset.name,
        url: source.url,
      });
      try {
        cancelSignal?.throwIfAborted();
        return await this.resolveViaYtDlp(
          preset,
          source,
          cancelSignal,
          undefined,
          true,
        );
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "OAuth2 attempt failed";
        this.store.appendLog(
          "warn",
          "OAuth2 attempt failed, trying client fallbacks",
          {
            error: message.slice(0, 150),
          },
        );
      }
    }

    if (isYouTubeUrl(source.url)) {
      const clients = [
        appConfig.ytDlpYouTubeExtractorArgs,
        "youtube:player_client=ios",
        "youtube:player_client=web_creator",
        "youtube:player_client=mweb",
        "youtube:player_client=tv",
      ].filter(Boolean) as string[];

      for (const client of clients) {
        try {
          cancelSignal?.throwIfAborted();
          return await this.resolveViaYtDlp(
            preset,
            source,
            cancelSignal,
            client,
            false,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "client retry failed";
          this.store.appendLog("warn", "yt-dlp retry failed", {
            preset: preset.name,
            extractorArgs: client,
            error: message.slice(0, 150),
          });
          if (!YOUTUBE_BOT_CHECK_PATTERN.test(message)) break;
        }
      }
    }

    throw new Error("yt-dlp resolution failed");
  }

  private async resolveViaYtDlp(
    preset: StreamPreset,
    source: FallbackSource,
    cancelSignal?: AbortSignal,
    extractorArgs?: string,
    forceOAuth2 = false,
    formatOverride?: string,
  ): Promise<ResolvedSource> {
    const ytDlpPath = appConfig.ytDlpPath;
    if (!ytDlpPath) {
      throw new Error(
        "yt-dlp is required for this preset but was not detected",
      );
    }

    const cookieArgs = forceOAuth2 ? [] : buildCookieArgs();
    const oauth2Args =
      forceOAuth2 && existsSync(OAUTH2_TOKEN_PATH)
        ? ["--username", "oauth2", "--password", ""]
        : [];
    const args = [
      "--no-warnings",
      "--no-playlist",
      ...oauth2Args,
      ...cookieArgs,
      ...(extractorArgs ? ["--extractor-args", extractorArgs] : []),
      "--format",
      formatOverride ??
        buildYtDlpFormatForPreset(preset.qualityProfile, appConfig.ytDlpFormat),
      "--print",
      "%(title)s",
      "--print",
      "%(is_live)s",
      "-g",
      source.url,
    ];

    const authSource = oauth2Args.length ? "oauth2" : getCookieSourceLabel();

    this.store.appendLog("info", "Resolving source via yt-dlp", {
      preset: preset.name,
      url: source.url,
      sourceMode: source.sourceMode,
      cookieSource: authSource,
      extractorArgs: extractorArgs ?? "",
      formatOverride: formatOverride ?? "",
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
        throw new Error("yt-dlp returned more media streams than expected");
      }

      if (urls.length === 0) {
        throw new Error("yt-dlp did not return a playable media URL");
      }

      const isLive = isLiveFlag.toLowerCase() === "true";

      if (
        urls.length > 1 &&
        !isLive &&
        !formatOverride &&
        isYouTubeUrl(source.url)
      ) {
        try {
          const muxedResolved = await this.resolveViaYtDlp(
            preset,
            source,
            cancelSignal,
            extractorArgs,
            forceOAuth2,
            buildYtDlpMuxedFormatForPreset(preset.qualityProfile),
          );

          if (typeof muxedResolved.input === "string") {
            this.store.appendLog(
              "info",
              "Using muxed yt-dlp source for VOD compatibility",
              {
                preset: preset.name,
                url: source.url,
                title: resolvedTitle,
              },
            );
            return muxedResolved;
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : "Muxed yt-dlp compatibility fallback failed";
          this.store.appendLog(
            "warn",
            "Muxed yt-dlp compatibility fallback failed",
            {
              preset: preset.name,
              url: source.url,
              error: message.slice(0, 160),
            },
          );
        }
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
        inputUrl: source.url,
        sourceMode: source.sourceMode,
        resolvedTitle,
        isLive,
        resolverKind: "yt-dlp",
      };
    } finally {
      cancelSignal?.removeEventListener("abort", abortChild);
    }
  }
}
