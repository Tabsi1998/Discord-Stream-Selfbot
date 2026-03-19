import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { resolve } from "node:path";
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

export function createServer(service: ControlPanelService) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(appConfig.publicDir));

  app.get(
    "/api/bootstrap",
    asyncRoute(async (_req, res) => {
      res.json({
        state: service.snapshot(),
        voiceChannels: await service.listVoiceChannels(),
      });
    }),
  );

  app.get("/api/state", (_req, res) => {
    res.json(service.snapshot());
  });

  app.get(
    "/api/voice-channels",
    asyncRoute(async (req, res) => {
      const forceRefresh = req.query.refresh === "1";
      res.json(await service.listVoiceChannels(forceRefresh));
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

  app.post("/api/stop", (_req, res) => {
    const stopped = service.stopActive();
    res.json({ stopped });
  });

  app.get("/api/stream/health", (_req, res) => {
    const state = service.snapshot();
    const activeRun = state.runtime.activeRun;
    if (!activeRun) {
      res.json({ active: false });
      return;
    }
    const startedAt = Date.parse(activeRun.startedAt);
    const uptimeMs = Date.now() - startedAt;
    res.json({
      active: true,
      status: activeRun.status,
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
