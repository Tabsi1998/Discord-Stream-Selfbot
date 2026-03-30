import { appConfig } from "./config/appConfig.js";
import { DiscordCommandBridge } from "./runtime/DiscordCommandBridge.js";
import { Scheduler } from "./runtime/Scheduler.js";
import { StreamRuntime } from "./runtime/StreamRuntime.js";
import { createServer } from "./server/createServer.js";
import { ControlPanelService } from "./services/ControlPanelService.js";
import { AppStateStore } from "./state/AppStateStore.js";

const store = new AppStateStore(appConfig.dataFile);
const runtime = new StreamRuntime(store);
const service = new ControlPanelService(store, runtime);
const commandBridge = new DiscordCommandBridge(runtime, service, store);
const scheduler = new Scheduler(service, appConfig.schedulerPollMs);
const app = createServer(service);
let suppressedErrorEventLogged = false;

service.initializeNotificationSettings({
  webhookUrl: appConfig.notificationWebhookUrl,
  dmEnabled: appConfig.notificationDmEnabled,
});

function isErrorEventLike(value: unknown): value is { type?: unknown } {
  return (
    !!value &&
    typeof value === "object" &&
    value.constructor?.name === "ErrorEvent"
  );
}

process.on("unhandledRejection", (reason: unknown) => {
  if (isErrorEventLike(reason)) {
    if (!suppressedErrorEventLogged) {
      suppressedErrorEventLogged = true;
      store.appendLog("warn", "Suppressed recurring ErrorEvent rejection", {
        type: typeof reason.type === "string" ? reason.type : "error",
      });
    }
    return;
  }

  const message =
    reason instanceof Error ? reason.message : String(reason ?? "unknown");
  store.appendLog("error", "Unhandled rejection", { error: message });
});

process.on("uncaughtException", (error: Error) => {
  store.appendLog("error", "Uncaught exception", {
    error: error.message,
  });
});

store.appendLog("info", "Control panel booting", {
  port: String(appConfig.port),
});

if (appConfig.panelAuthEnabled) {
  store.appendLog("info", "Panel authentication enabled", {
    username: appConfig.panelAuthUsername ?? "configured",
  });
}

if (appConfig.availableHardwareEncoders.length > 0) {
  store.appendLog("info", "Hardware video encoders detected", {
    encoders: appConfig.availableHardwareEncoders.join(","),
    preferred: appConfig.preferredHardwareEncoder,
  });
} else {
  store.appendLog(
    "warn",
    "No hardware video encoders detected; hardware-accelerated presets will fall back to software",
  );
}

store.setRuntime((runtime) => {
  runtime.ffmpegPath = appConfig.ffmpegPath;
  runtime.ffprobePath = appConfig.ffprobePath;
  runtime.ytDlpPath = appConfig.ytDlpPath;
  runtime.ytDlpVersion = appConfig.ytDlpVersion;
  runtime.ytDlpAvailable = !!appConfig.ytDlpPath;
  runtime.panelAuthEnabled = appConfig.panelAuthEnabled;
  runtime.availableVideoEncoders = [
    "software",
    ...appConfig.availableHardwareEncoders,
  ];
  runtime.preferredHardwareEncoder = appConfig.preferredHardwareEncoder;
  runtime.ffmpegLogLevel = appConfig.ffmpegLogLevel;
});

if (!appConfig.ffmpegPath) {
  store.appendLog("warn", "FFmpeg binary was not auto-detected");
}
if (!appConfig.ffprobePath) {
  store.appendLog("warn", "FFprobe binary was not auto-detected");
}
if (!appConfig.ytDlpPath) {
  store.appendLog("warn", "yt-dlp binary was not auto-detected");
} else {
  store.appendLog("info", "yt-dlp binary detected", {
    path: appConfig.ytDlpPath,
    version: appConfig.ytDlpVersion ?? "unknown",
  });
}
if (!appConfig.discordToken) {
  store.appendLog("warn", "DISCORD_TOKEN is missing");
}

store.appendLog("info", "Configured selfbots loaded", {
  count: String(appConfig.selfbotProfiles.length),
  configFile: appConfig.selfbotConfigFile,
});

for (const selfbot of appConfig.selfbotProfiles) {
  void runtime.ensureReady(selfbot.id).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Discord startup failed";
    store.appendLog("error", "Discord runtime failed to start", {
      botId: selfbot.id,
      botName: selfbot.name,
      error: message,
    });
  });
}

commandBridge.start();
scheduler.start();

app.listen(appConfig.port, () => {
  console.log(`control-panel listening on http://localhost:${appConfig.port}`);
  store.appendLog("info", "HTTP server is listening", {
    url: `http://localhost:${appConfig.port}`,
  });
});
