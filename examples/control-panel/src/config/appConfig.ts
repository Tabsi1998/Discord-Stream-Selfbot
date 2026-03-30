import { existsSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadSelfbotProfiles } from "./selfbotConfig.js";

function hasWorkingBinary(command: string): boolean {
  const flag = command === "yt-dlp" ? "--version" : "-version";
  const result = spawnSync(command, [flag], {
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
}

function resolveWingetBinary(
  name: "ffmpeg" | "ffprobe" | "yt-dlp",
  packagePattern: RegExp,
): string | undefined {
  const packagesDir = resolve(
    process.env.LOCALAPPDATA ?? "",
    "Microsoft",
    "WinGet",
    "Packages",
  );

  if (!existsSync(packagesDir)) return undefined;

  for (const entry of readdirSync(packagesDir)) {
    if (!packagePattern.test(entry)) continue;
    const packageDir = resolve(packagesDir, entry);
    const rootCandidate = resolve(packageDir, `${name}.exe`);
    if (existsSync(rootCandidate)) return rootCandidate;

    for (const child of readdirSync(packageDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const candidate = resolve(packageDir, child.name, "bin", `${name}.exe`);
      if (existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}

function resolveBinaryPath(
  envName: "FFMPEG_PATH" | "FFPROBE_PATH" | "YT_DLP_PATH",
  command: "ffmpeg" | "ffprobe" | "yt-dlp",
  packagePattern: RegExp,
): string | undefined {
  const explicit = process.env[envName];
  if (explicit && existsSync(explicit)) return explicit;
  if (hasWorkingBinary(command)) return command;
  return resolveWingetBinary(command, packagePattern);
}

function resolveBinaryVersion(commandPath: string | undefined, flag: string) {
  if (!commandPath) return undefined;

  const result = spawnSync(commandPath, [flag], {
    encoding: "utf-8",
    shell: false,
  });

  if (result.status !== 0) {
    return undefined;
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const firstLine = output.split(/\r?\n/).find((line) => line.trim());
  return firstLine?.trim() || undefined;
}

function parseCsvList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveIntegerEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBooleanEnv(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeOptionalEnv(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolveOptionalPath(value: string | undefined, baseDir: string) {
  if (!value) return undefined;
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

type HardwareEncoder = "nvenc" | "vaapi";
type PreferredHardwareEncoder = "auto" | HardwareEncoder;
type FfmpegLogLevel =
  | "quiet"
  | "panic"
  | "fatal"
  | "error"
  | "warning"
  | "info"
  | "verbose"
  | "debug"
  | "trace";

function parsePreferredHardwareEncoder(
  value: string | undefined,
): PreferredHardwareEncoder {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "nvenc" || normalized === "vaapi") {
    return normalized;
  }
  return "auto";
}

function parseFfmpegLogLevel(value: string | undefined): FfmpegLogLevel {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "quiet":
    case "panic":
    case "fatal":
    case "error":
    case "warning":
    case "info":
    case "verbose":
    case "debug":
    case "trace":
      return normalized;
    default:
      return "warning";
  }
}

function detectHardwareEncoders(
  commandPath: string | undefined,
  vaapiDevice: string,
): HardwareEncoder[] {
  if (!commandPath) return [];

  const result = spawnSync(commandPath, ["-hide_banner", "-encoders"], {
    encoding: "utf-8",
    shell: false,
  });

  if (result.status !== 0) {
    return [];
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const detected: HardwareEncoder[] = [];

  if (
    /\bh264_nvenc\b/i.test(output) ||
    /\bhevc_nvenc\b/i.test(output) ||
    /\bav1_nvenc\b/i.test(output)
  ) {
    detected.push("nvenc");
  }

  if (
    existsSync(vaapiDevice) &&
    (/\bh264_vaapi\b/i.test(output) ||
      /\bhevc_vaapi\b/i.test(output) ||
      /\bav1_vaapi\b/i.test(output))
  ) {
    detected.push("vaapi");
  }

  return detected;
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataFileEnv = process.env.DATA_FILE ?? "./data/control-panel-state.json";
const dataFile = isAbsolute(dataFileEnv)
  ? dataFileEnv
  : resolve(appDir, dataFileEnv);
const selfbotConfig = loadSelfbotProfiles(appDir);

const ffmpegPath = resolveBinaryPath("FFMPEG_PATH", "ffmpeg", /ffmpeg/i);
const ffprobePath = resolveBinaryPath("FFPROBE_PATH", "ffprobe", /ffmpeg/i);
const ytDlpPath = resolveBinaryPath("YT_DLP_PATH", "yt-dlp", /yt-dlp/i);
const ytDlpVersion = resolveBinaryVersion(ytDlpPath, "--version");
const ytDlpCookiesFile = resolveOptionalPath(
  normalizeOptionalEnv(process.env.YT_DLP_COOKIES_FILE),
  appDir,
);
const ytDlpCookiesFromBrowser = normalizeOptionalEnv(
  process.env.YT_DLP_COOKIES_FROM_BROWSER,
);
const panelAuthUsername = normalizeOptionalEnv(process.env.PANEL_AUTH_USERNAME);
const panelAuthPassword = normalizeOptionalEnv(process.env.PANEL_AUTH_PASSWORD);
const panelAuthEnabled = parseBooleanEnv(
  process.env.PANEL_AUTH_ENABLED,
  !!panelAuthUsername || !!panelAuthPassword,
);
if (panelAuthEnabled && (!panelAuthUsername || !panelAuthPassword)) {
  throw new Error(
    "PANEL_AUTH_ENABLED requires both PANEL_AUTH_USERNAME and PANEL_AUTH_PASSWORD",
  );
}
const panelAuthRealm =
  normalizeOptionalEnv(process.env.PANEL_AUTH_REALM) ?? "Stream Bot";
const preferredHardwareEncoder = parsePreferredHardwareEncoder(
  process.env.PREFERRED_HW_ENCODER,
);
const vaapiDevice =
  normalizeOptionalEnv(process.env.FFMPEG_VAAPI_DEVICE) ??
  "/dev/dri/renderD128";
const availableHardwareEncoders = detectHardwareEncoders(
  ffmpegPath,
  vaapiDevice,
);
const ffmpegLogLevel = parseFfmpegLogLevel(process.env.FFMPEG_LOG_LEVEL);

if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
if (ffprobePath) process.env.FFPROBE_PATH = ffprobePath;
if (ytDlpPath) process.env.YT_DLP_PATH = ytDlpPath;

export const appConfig = {
  appDir,
  publicDir: resolve(appDir, "public"),
  dataFile,
  port: Number.parseInt(process.env.PORT ?? "3099", 10) || 3099,
  discordToken: process.env.DISCORD_TOKEN ?? "",
  primarySelfbotId: selfbotConfig.primaryBotId,
  selfbotConfigFile: selfbotConfig.configFile,
  selfbotProfiles: selfbotConfig.profiles,
  hasMultipleBots: selfbotConfig.hasMultipleBots,
  ffmpegPath,
  ffprobePath,
  ytDlpPath,
  ytDlpVersion,
  ytDlpCookiesFile,
  ytDlpCookiesFromBrowser,
  ytDlpYouTubeExtractorArgs:
    process.env.YT_DLP_YOUTUBE_EXTRACTOR_ARGS?.trim() ||
    "youtube:player_client=android",
  ytDlpFormat:
    process.env.YT_DLP_FORMAT ??
    "bestvideo[vcodec!=none]+bestaudio[acodec!=none]/best[vcodec!=none][acodec!=none]/best*[vcodec!=none][acodec!=none]/best",
  commandEnabled: process.env.DISCORD_COMMANDS_ENABLED !== "0",
  commandPrefix: process.env.COMMAND_PREFIX?.trim() || "$panel",
  commandAllowedAuthorIds: parseCsvList(process.env.COMMAND_ALLOWED_AUTHOR_IDS),
  schedulerPollMs: parsePositiveIntegerEnv(process.env.SCHEDULER_POLL_MS, 1000),
  startupTimeoutMs: parsePositiveIntegerEnv(
    process.env.STARTUP_TIMEOUT_MS,
    15000,
  ),
  notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL?.trim() ?? "",
  notificationDmEnabled: process.env.NOTIFICATION_DM_ENABLED === "1",
  panelAuthEnabled,
  panelAuthUsername,
  panelAuthPassword,
  panelAuthRealm,
  preferredHardwareEncoder,
  availableHardwareEncoders,
  vaapiDevice,
  ffmpegLogLevel,
} as const;
