import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { appConfig } from "../config/appConfig.js";
import { ControlPanelService } from "../services/ControlPanelService.js";

type AsyncRoute = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

function getRouteParam(value: string | string[] | undefined, name: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`Missing route parameter: ${name}`);
}

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeBasicAuthHeader(value: string | undefined) {
  if (!value?.startsWith("Basic ")) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(value.slice("Basic ".length), "base64")
      .toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return undefined;
    }
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return undefined;
  }
}

function rejectUnauthorized(res: Response) {
  res.setHeader(
    "WWW-Authenticate",
    `Basic realm="${appConfig.panelAuthRealm.replaceAll('"', "")}"`,
  );
  res.status(401).json({ error: "Authentication required" });
}

function panelAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!appConfig.panelAuthEnabled) {
    next();
    return;
  }

  const credentials = decodeBasicAuthHeader(req.headers.authorization);
  const username = appConfig.panelAuthUsername;
  const password = appConfig.panelAuthPassword;
  if (
    !credentials ||
    !username ||
    !password ||
    !safeEquals(credentials.username, username) ||
    !safeEquals(credentials.password, password)
  ) {
    rejectUnauthorized(res);
    return;
  }

  next();
}

export function createServer(service: ControlPanelService) {
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      authEnabled: appConfig.panelAuthEnabled,
      discordStatus: service.snapshot().runtime.discordStatus,
    });
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(panelAuthMiddleware);
  app.use(express.static(appConfig.publicDir));

  app.get(
    "/api/bootstrap",
    asyncRoute(async (req, res) => {
      const botId =
        typeof req.query.botId === "string" ? req.query.botId : undefined;
      const forceRefresh = req.query.refresh === "1";
      res.json({
        state: service.snapshot(),
        voiceChannels: await service.listVoiceChannels(forceRefresh, botId),
      });
    }),
  );

  app.get("/api/state", (_req, res) => {
    res.json(service.snapshot());
  });

  app.get("/api/logs", (req, res) => {
    const limitRaw =
      typeof req.query.limit === "string"
        ? Number.parseInt(req.query.limit, 10)
        : Number.NaN;
    const limit = Number.isInteger(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;
    res.json({ items: service.snapshot().logs.slice(0, limit) });
  });

  app.get("/api/channels", (_req, res) => {
    res.json(service.snapshot().channels);
  });

  app.get(
    "/api/voice-channels",
    asyncRoute(async (req, res) => {
      const forceRefresh = req.query.refresh === "1";
      const botId =
        typeof req.query.botId === "string" ? req.query.botId : undefined;
      res.json(await service.listVoiceChannels(forceRefresh, botId));
    }),
  );

  app.post("/api/channels", (req, res) => {
    res.status(201).json(service.createChannel(req.body));
  });

  app.put("/api/channels/:id", (req, res) => {
    res.json(service.updateChannel(req.params.id, req.body));
  });

  app.delete("/api/channels/:id", (req, res) => {
    service.deleteChannel(req.params.id);
    res.status(204).send();
  });

  app.get("/api/presets", (_req, res) => {
    res.json(service.snapshot().presets);
  });

  app.post("/api/presets", (req, res) => {
    res.status(201).json(service.createPreset(req.body));
  });

  app.put("/api/presets/:id", (req, res) => {
    res.json(service.updatePreset(req.params.id, req.body));
  });

  app.delete("/api/presets/:id", (req, res) => {
    service.deletePreset(req.params.id);
    res.status(204).send();
  });

  app.get("/api/events", (_req, res) => {
    res.json(service.snapshot().events);
  });

  app.post("/api/events", (req, res) => {
    res.status(201).json(service.createEvent(req.body));
  });

  app.put("/api/events/:id", (req, res) => {
    res.json(service.updateEvent(req.params.id, req.body));
  });

  app.delete("/api/events/:id", (req, res) => {
    service.deleteEvent(req.params.id);
    res.status(204).send();
  });

  app.post(
    "/api/events/:id/start",
    asyncRoute(async (req, res) => {
      await service.startScheduledEvent(getRouteParam(req.params.id, "id"));
      res.status(202).json({ ok: true });
    }),
  );

  app.post(
    "/api/events/:id/cancel",
    asyncRoute(async (req, res) => {
      await service.cancelEvent(getRouteParam(req.params.id, "id"));
      res.status(202).json({ ok: true });
    }),
  );

  app.post(
    "/api/manual/start",
    asyncRoute(async (req, res) => {
      res.status(202).json(await service.startManualRun(req.body));
    }),
  );

  app.post("/api/stop", (req, res) => {
    const body = req.body && typeof req.body === "object"
      ? req.body as { botId?: string; all?: boolean }
      : {};

    if (body.all) {
      const stoppedCount = service.stopAllActive();
      res.json({ stopped: stoppedCount > 0, stoppedCount });
      return;
    }

    const stopped = service.stopActiveForBot("manual-stop", body.botId);
    res.json({ stopped, stoppedCount: stopped ? 1 : 0 });
  });

  app.get("/api/stream/health", (req, res) => {
    const state = service.snapshot();
    const botId =
      typeof req.query.botId === "string" ? req.query.botId : undefined;
    const activeRuns = state.runtime.activeRuns ?? [];
    const activeRun = botId
      ? activeRuns.find((run) => run.botId === botId)
      : state.runtime.activeRun ?? activeRuns[0];
    if (!activeRun) {
      res.json({ active: false, activeCount: activeRuns.length, activeRuns });
      return;
    }
    const startedAt = Date.parse(activeRun.startedAt);
    const uptimeMs = Date.now() - startedAt;
    res.json({
      active: true,
      activeCount: activeRuns.length,
      activeRuns,
      status: activeRun.status,
      botId: activeRun.botId,
      botName: activeRun.botName,
      channelName: activeRun.channelName,
      presetName: activeRun.presetName,
      uptimeMs,
      startedAt: activeRun.startedAt,
      plannedStopAt: activeRun.plannedStopAt,
    });
  });

  app.post(
    "/api/presets/test-url",
    asyncRoute(async (req, res) => {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL is required" });
        return;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        res.json({
          reachable: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type") || "unknown",
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Connection failed";
        res.json({ reachable: false, error: message });
      }
    }),
  );

  // ── Queue Endpoints ─────────────────────────────────────────
  app.get("/api/queue", (_req, res) => {
    const state = service.snapshot();
    res.json({ items: state.queue, config: state.queueConfig });
  });

  app.post("/api/queue", (req, res) => {
    const { url, name, sourceMode } = req.body;
    res.status(201).json(service.addToQueue(url, name, sourceMode));
  });

  app.delete("/api/queue/:id", (req, res) => {
    service.removeFromQueue(getRouteParam(req.params.id, "id"));
    res.status(204).send();
  });

  app.post("/api/queue/clear", (_req, res) => {
    service.clearQueue();
    res.json({ ok: true });
  });

  app.post("/api/queue/loop", (req, res) => {
    const { enabled } = req.body;
    service.setQueueLoop(!!enabled);
    res.json({ ok: true, loop: !!enabled });
  });

  app.post(
    "/api/queue/start",
    asyncRoute(async (req, res) => {
      const { channelId, presetId } = req.body;
      await service.startQueue(channelId, presetId);
      res.status(202).json({ ok: true });
    }),
  );

  app.post(
    "/api/queue/skip",
    asyncRoute(async (_req, res) => {
      await service.skipQueueItem();
      res.json({ ok: true });
    }),
  );

  app.post("/api/queue/stop", (_req, res) => {
    service.stopQueue();
    res.json({ ok: true });
  });

  app.post(
    "/api/queue/reorder",
    asyncRoute(async (req, res) => {
      const { id, newIndex } = req.body;
      service.reorderQueue(id, newIndex);
      res.json({ ok: true });
    }),
  );

  // ── Notification Settings ───────────────────────────────────
  app.get("/api/settings/notifications", (_req, res) => {
    res.json(service.getNotificationSettings());
  });

  app.put("/api/settings/notifications", (req, res) => {
    res.json(service.updateNotificationSettings(req.body ?? {}));
  });

  app.post(
    "/api/settings/notifications/test",
    asyncRoute(async (req, res) => {
      const body =
        req.body && typeof req.body === "object"
          ? req.body as { webhookUrl?: string; dmEnabled?: boolean; botId?: string }
          : {};
      await service.testNotificationSettings(body, body.botId);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/notifications/test",
    asyncRoute(async (_req, res) => {
      await service.testNotificationSettings();
      res.json({ ok: true });
    }),
  );

  // ── Import / Export ─────────────────────────────────────────
  app.get("/api/config/export", (_req, res) => {
    const payload = service.exportConfiguration();
    const fileName = `stream-control-panel-export-${payload.exportedAt.replaceAll(":", "-")}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.json(payload);
  });

  app.post("/api/config/import", (req, res) => {
    res.json(service.importConfiguration(req.body));
  });

  // ── Cookie Management ─────────────────────────────────────────
  const cookiesDir = resolve(appConfig.appDir, "cookies");

  app.get("/api/cookies/status", (_req, res) => {
    const cookieFile = resolve(cookiesDir, "yt-dlp-cookies.txt");
    const exists = existsSync(cookieFile);
    let lines = 0;
    let lastModified: string | undefined;
    if (exists) {
      try {
        const content = readFileSync(cookieFile, "utf-8");
        lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length;
        const stat = statSync(cookieFile);
        lastModified = stat.mtime.toISOString();
      } catch {}
    }
    res.json({
      configured: exists && lines > 0,
      cookieFile: exists ? cookieFile : null,
      cookieEntries: lines,
      lastModified,
      envCookieFile: appConfig.ytDlpCookiesFile ?? null,
      envCookiesBrowser: appConfig.ytDlpCookiesFromBrowser ?? null,
    });
  });

  app.post(
    "/api/cookies/upload",
    asyncRoute(async (req, res) => {
      const { content } = req.body;
      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "Cookie content is required" });
        return;
      }

      // Validate it looks like a Netscape cookies file
      const lines = content.split("\n").filter((l: string) => l.trim());
      const dataLines = lines.filter(
        (l: string) => !l.startsWith("#") && l.includes("\t"),
      );
      if (dataLines.length === 0) {
        res.status(400).json({
          error:
            "Invalid cookie format. Expected Netscape/Mozilla cookies.txt format with tab-separated fields.",
        });
        return;
      }

      mkdirSync(cookiesDir, { recursive: true });
      const cookieFile = resolve(cookiesDir, "yt-dlp-cookies.txt");
      writeFileSync(cookieFile, content, "utf-8");

      service.appendLog("info", "YouTube cookies uploaded", {
        entries: String(dataLines.length),
      });

      res.json({
        ok: true,
        cookieFile,
        entries: dataLines.length,
        message: `${dataLines.length} Cookie-Eintraege gespeichert. Neustart empfohlen fuer sofortige Wirkung.`,
      });
    }),
  );

  app.post("/api/cookies/delete", (_req, res) => {
    const cookieFile = resolve(cookiesDir, "yt-dlp-cookies.txt");
    if (existsSync(cookieFile)) {
      unlinkSync(cookieFile);
      service.appendLog("info", "YouTube cookies deleted");
    }
    res.json({ ok: true });
  });

  // ── How-To Info ───────────────────────────────────────────────
  app.get("/api/cookies/howto", (_req, res) => {
    res.json({
      steps: [
        "1. Oeffne Chrome/Firefox/Edge und logge dich bei YouTube ein",
        "2. Installiere die Browser-Extension 'Get cookies.txt LOCALLY' (Chrome) oder 'cookies.txt' (Firefox)",
        "3. Gehe auf youtube.com und klicke auf die Extension",
        "4. Exportiere die Cookies im Netscape-Format",
        "5. Kopiere den kompletten Inhalt der cookies.txt Datei",
        "6. Fuege ihn hier im Upload-Feld ein und klicke 'Hochladen'",
      ],
      tips: [
        "Verwende KEINEN Inkognito-Modus - Cookies werden dort nicht gespeichert",
        "Die Cookies muessen von der GLEICHEN IP kommen wie der Server",
        "Erneuere die Cookies wenn du wieder 'not a bot' Fehler bekommst",
        "Frische Cookies (< 30 Minuten alt) funktionieren am besten",
      ],
    });
  });

  // ── OAuth2 YouTube Authentication ──────────────────────────────
  // One-time setup: user visits google.com/device, enters code, done forever.
  // yt-dlp auto-refreshes the token (~6 months valid if active).
  let oauth2Process: ReturnType<typeof import("node:child_process").spawn> | null = null;
  let oauth2DeviceCode: string | null = null;
  let oauth2VerifyUrl: string | null = null;
  let oauth2Status: "idle" | "waiting" | "success" | "error" = "idle";
  let oauth2Error: string | null = null;

  const OAUTH2_TOKEN_DIR = resolve(
    process.env.HOME || "/root",
    ".cache",
    "yt-dlp",
    "youtube-oauth2",
  );

  app.get("/api/oauth2/status", (_req, res) => {
    // Check if a valid token exists
    let tokenExists = false;
    try {
      const tokenFile = resolve(OAUTH2_TOKEN_DIR, "token_data.json");
      tokenExists = existsSync(tokenFile);
    } catch {}

    res.json({
      status: oauth2Status,
      tokenConfigured: tokenExists,
      deviceCode: oauth2DeviceCode,
      verifyUrl: oauth2VerifyUrl,
      error: oauth2Error,
    });
  });

  app.post(
    "/api/oauth2/start",
    asyncRoute(async (_req, res) => {
      // Kill any existing process
      if (oauth2Process) {
        try { oauth2Process.kill(); } catch {}
        oauth2Process = null;
      }

      oauth2Status = "waiting";
      oauth2DeviceCode = null;
      oauth2VerifyUrl = null;
      oauth2Error = null;

      const ytDlpPath = appConfig.ytDlpPath;
      if (!ytDlpPath) {
        oauth2Status = "error";
        oauth2Error = "yt-dlp not found";
        res.status(400).json({ error: "yt-dlp is not available" });
        return;
      }

      const { spawn: spawnProcess } = await import("node:child_process");

      // Start yt-dlp OAuth2 flow - it will prompt for device code
      const child = spawnProcess(ytDlpPath, [
        "--username", "oauth2",
        "--password", "",
        "-v",
        "--dump-json",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ], {
        stdio: "pipe",
        env: { ...process.env, HOME: process.env.HOME || "/root" },
      });

      oauth2Process = child;

      const deviceCodePattern = /enter code\s+([A-Z0-9-]+)/i;
      const verifyUrlPattern = /go to\s+(https?:\/\/\S+)/i;
      let outputBuffer = "";

      const handleOutput = (chunk: Buffer | string) => {
        const text = chunk.toString();
        outputBuffer += text;

        // Parse device code
        const codeMatch = outputBuffer.match(deviceCodePattern);
        if (codeMatch && !oauth2DeviceCode) {
          oauth2DeviceCode = codeMatch[1];
        }

        // Parse verification URL
        const urlMatch = outputBuffer.match(verifyUrlPattern);
        if (urlMatch && !oauth2VerifyUrl) {
          oauth2VerifyUrl = urlMatch[1];
        }
      };

      child.stdout.on("data", handleOutput);
      child.stderr.on("data", handleOutput);

      child.once("close", (code: number | null) => {
        if (code === 0) {
          oauth2Status = "success";
          service.appendLog("info", "YouTube OAuth2 authentication successful");
        } else if (oauth2Status === "waiting") {
          // Check if the token was actually saved despite the error
          try {
            const tokenFile = resolve(OAUTH2_TOKEN_DIR, "token_data.json");
            if (existsSync(tokenFile)) {
              oauth2Status = "success";
              service.appendLog("info", "YouTube OAuth2 token saved successfully");
            } else {
              oauth2Status = "error";
              const errorLines = outputBuffer.split("\n").filter(
                (l) => l.includes("ERROR") || l.includes("error"),
              );
              oauth2Error = errorLines.pop() || `Process exited with code ${code}`;
            }
          } catch {
            oauth2Status = "error";
            oauth2Error = `Process exited with code ${code}`;
          }
        }
        oauth2Process = null;
      });

      // Wait briefly for the device code to appear
      await new Promise((r) => setTimeout(r, 5000));

      if (oauth2DeviceCode && oauth2VerifyUrl) {
        service.appendLog("info", "OAuth2 device code generated", {
          code: oauth2DeviceCode,
          url: oauth2VerifyUrl,
        });
        res.json({
          status: "waiting",
          deviceCode: oauth2DeviceCode,
          verifyUrl: oauth2VerifyUrl,
          message: `Gehe zu ${oauth2VerifyUrl} und gib den Code ${oauth2DeviceCode} ein. Danach funktioniert YouTube automatisch!`,
        });
      } else {
        oauth2Status = "error";
        oauth2Error = "Could not get device code. Check yt-dlp logs.";
        res.status(500).json({
          error: oauth2Error,
          output: outputBuffer.slice(-500),
        });
      }
    }),
  );

  app.post("/api/oauth2/revoke", (_req, res) => {
    try {
      const tokenFile = resolve(OAUTH2_TOKEN_DIR, "token_data.json");
      if (existsSync(tokenFile)) {
        unlinkSync(tokenFile);
        service.appendLog("info", "YouTube OAuth2 token revoked");
      }
    } catch {}
    oauth2Status = "idle";
    oauth2DeviceCode = null;
    oauth2VerifyUrl = null;
    oauth2Error = null;
    res.json({ ok: true });
  });

  app.get("*", (_req, res) => {
    res.sendFile(resolve(appConfig.publicDir, "index.html"));
  });

  app.use((
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    res.status(400).json({ error: message });
  });

  return app;
}
