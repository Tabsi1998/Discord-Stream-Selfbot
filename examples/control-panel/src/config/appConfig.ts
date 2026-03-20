import { existsSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataFileEnv = process.env.DATA_FILE ?? "./data/control-panel-state.json";
const dataFile = isAbsolute(dataFileEnv)
  ? dataFileEnv
  : resolve(appDir, dataFileEnv);

const ffmpegPath = resolveBinaryPath("FFMPEG_PATH", "ffmpeg", /ffmpeg/i);
const ffprobePath = resolveBinaryPath("FFPROBE_PATH", "ffprobe", /ffmpeg/i);
const ytDlpPath = resolveBinaryPath("YT_DLP_PATH", "yt-dlp", /yt-dlp/i);

if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
if (ffprobePath) process.env.FFPROBE_PATH = ffprobePath;
if (ytDlpPath) process.env.YT_DLP_PATH = ytDlpPath;

export const appConfig = {
  appDir,
  publicDir: resolve(appDir, "public"),
  dataFile,
  port: Number.parseInt(process.env.PORT ?? "3099", 10) || 3099,
  discordToken: process.env.DISCORD_TOKEN ?? "",
  ffmpegPath,
  ffprobePath,
  ytDlpPath,
  ytDlpFormat:
    process.env.YT_DLP_FORMAT ??
    "bestvideo[vcodec!=none]+bestaudio[acodec!=none]/best[vcodec!=none][acodec!=none]/best*[vcodec!=none][acodec!=none]/best",
  commandEnabled: process.env.DISCORD_COMMANDS_ENABLED !== "0",
  commandPrefix: process.env.COMMAND_PREFIX?.trim() || "$panel",
  commandAllowedAuthorIds: parseCsvList(process.env.COMMAND_ALLOWED_AUTHOR_IDS),
  schedulerPollMs: parsePositiveIntegerEnv(process.env.SCHEDULER_POLL_MS, 1000),
  startupTimeoutMs: parsePositiveIntegerEnv(process.env.STARTUP_TIMEOUT_MS, 15000),
  notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL?.trim() ?? "",
  notificationDmEnabled: process.env.NOTIFICATION_DM_ENABLED === "1",
} as const;
