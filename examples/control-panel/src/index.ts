import { appConfig } from "./config.js";
import { createServer } from "./server.js";
import { DiscordCommandBridge } from "./discordCommands.js";
import { ControlPanelService } from "./service.js";
import { Scheduler } from "./scheduler.js";
import { AppStateStore } from "./storage.js";
import { StreamRuntime } from "./runtime.js";

const store = new AppStateStore(appConfig.dataFile);
const runtime = new StreamRuntime(store);
const service = new ControlPanelService(store, runtime);
const commandBridge = new DiscordCommandBridge(runtime, service, store);
const scheduler = new Scheduler(service, appConfig.schedulerPollMs);
const app = createServer(service);
let suppressedErrorEventLogged = false;

function isErrorEventLike(value: unknown): value is { type?: unknown } {
  return !!value
    && typeof value === "object"
    && value.constructor?.name === "ErrorEvent";
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

if (!appConfig.ffmpegPath) {
  store.appendLog("warn", "FFmpeg binary was not auto-detected");
}
if (!appConfig.ffprobePath) {
  store.appendLog("warn", "FFprobe binary was not auto-detected");
}
if (!appConfig.ytDlpPath) {
  store.appendLog("warn", "yt-dlp binary was not auto-detected");
}
if (!appConfig.discordToken) {
  store.appendLog("warn", "DISCORD_TOKEN is missing");
}

void runtime.ensureReady().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Discord startup failed";
  store.appendLog("error", "Discord runtime failed to start", {
    error: message,
  });
});

commandBridge.start();
scheduler.start();

app.listen(appConfig.port, () => {
  console.log(`control-panel listening on http://localhost:${appConfig.port}`);
  store.appendLog("info", "HTTP server is listening", {
    url: `http://localhost:${appConfig.port}`,
  });
});
