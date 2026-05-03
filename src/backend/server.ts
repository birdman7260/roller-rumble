import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import cors from "cors";
import multer from "multer";
import { WebSocketServer } from "ws";
import { API_PREFIX, DEFAULT_SERVER_PORT, WS_PATH } from "../shared/constants";
import type { AppSnapshot } from "../shared/types";
import {
  createEventSchema,
  createRacerSchema,
  queueSignupSchema,
  removeRacerSchema,
  settingUpdateSchema,
  startTournamentSchema,
  tournamentBracketMatchSchema,
  tournamentGroupMatchSchema,
  tournamentIdSchema
} from "../shared/validation";
import { GoldsprintsApp } from "./services/app";

interface BackendServerOptions {
  dataDir: string;
  port?: number;
  rendererDistDir?: string;
  rendererDevUrl?: string;
}

export interface BackendServer {
  service: GoldsprintsApp;
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
}

async function proxyDevRequest(
  rendererDevUrl: string,
  requestUrl: string,
  res: express.Response
): Promise<void> {
  const target = new URL(requestUrl, rendererDevUrl).toString();
  const upstream = await fetch(target);
  const body = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding") {
      return;
    }
    res.setHeader(key, value);
  });
  res.send(body);
}

export function createBackendServer(options: BackendServerOptions): BackendServer {
  fs.mkdirSync(options.dataDir, { recursive: true });
  const service = new GoldsprintsApp({
    dataDir: options.dataDir,
    serverPort: options.port ?? DEFAULT_SERVER_PORT
  });
  const app = express();
  const httpServer = http.createServer(app);
  const uploadsDir = path.join(options.dataDir, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, uploadsDir);
    },
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname) || ".jpg";
      const racerId = Array.isArray(req.params.racerId)
        ? req.params.racerId[0]
        : req.params.racerId;
      callback(null, `${racerId}-${String(Date.now())}${extension}`);
    }
  });
  const upload = multer({ storage });

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: WS_PATH
  });
  const debugEnabled = process.env.GOLDSPRINTS_DEBUG === "1";

  service.onSnapshot((snapshot: AppSnapshot) => {
    // Every surface hydrates from the same snapshot stream so admin, projector, and phones stay in sync.
    const payload = JSON.stringify({
      type: "snapshot",
      payload: snapshot
    });
    for (const client of wsServer.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  });

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(uploadsDir));

  if (debugEnabled) {
    app.use((req, res, next) => {
      const startedAt = Date.now();
      res.on("finish", () => {
        console.log(
          `[api] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`
        );
      });
      next();
    });
  }

  app.get(`${API_PREFIX}/health`, (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString()
    });
  });

  app.get(`${API_PREFIX}/snapshot`, (_req, res) => {
    res.json(service.getSnapshot());
  });

  app.get(`${API_PREFIX}/meta`, async (_req, res) => {
    res.json({
      localBaseUrl: service.getLocalBaseUrl(),
      qrCodeDataUrl: await service.getQrCodeDataUrl()
    });
  });

  app.get(`${API_PREFIX}/racers`, (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(service.db.listRacers(search));
  });

  app.post(`${API_PREFIX}/racers`, (req, res) => {
    const input = createRacerSchema.parse(req.body);
    const racer = service.registerRacerRecord(input);
    res.json({
      racer,
      snapshot: service.getSnapshot()
    });
  });

  app.post(`${API_PREFIX}/racers/:racerId/avatar`, upload.single("avatar"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Missing avatar file" });
      return;
    }

    res.json(service.setRacerAvatar(String(req.params.racerId), `/uploads/${req.file.filename}`));
  });

  app.post(`${API_PREFIX}/events`, (req, res) => {
    const input = createEventSchema.parse(req.body);
    res.json(service.createEvent(input.name));
  });

  app.post(`${API_PREFIX}/queue`, (req, res) => {
    const input = queueSignupSchema.parse(req.body);
    res.json(service.signUpQueue(input));
  });

  app.delete(`${API_PREFIX}/queue/racer/:racerId`, (req, res) => {
    const input = removeRacerSchema.parse({ racerId: req.params.racerId });
    res.json(service.removeRacerFromAllUpcomingRaces(input.racerId));
  });

  app.delete(`${API_PREFIX}/queue/:entryId/racer/:racerId`, (req, res) => {
    const input = removeRacerSchema.parse({ racerId: req.params.racerId });
    res.json(service.removeRacerFromQueueEntry(req.params.entryId, input.racerId));
  });

  app.post(`${API_PREFIX}/races/next/stage`, (_req, res) => {
    res.json(service.stageNextRace());
  });

  app.post(`${API_PREFIX}/races/current/start`, (_req, res) => {
    res.json(service.startManualCountdown());
  });

  app.post(`${API_PREFIX}/races/current/finalize`, (_req, res) => {
    res.json(service.finalizeCurrentRace());
  });

  app.post(`${API_PREFIX}/races/current/resume`, (_req, res) => {
    res.json(service.resumeInterruptedRace());
  });

  app.post(`${API_PREFIX}/races/current/restart`, (_req, res) => {
    res.json(service.restartInterruptedRace());
  });

  app.post(`${API_PREFIX}/races/current/finalize-interrupted`, (_req, res) => {
    res.json(service.finalizeInterruptedRace());
  });

  app.post(`${API_PREFIX}/settings`, (req, res) => {
    const input = settingUpdateSchema.parse(req.body);
    res.json(service.updateSettings(input));
  });

  app.post(`${API_PREFIX}/tournaments`, (req, res) => {
    const input = startTournamentSchema.parse(req.body);
    res.json(service.createTournament(input));
  });

  app.post(`${API_PREFIX}/tournaments/:tournamentId/end`, (req, res) => {
    const input = tournamentIdSchema.parse({ tournamentId: req.params.tournamentId });
    res.json(service.endTournamentEarly(input.tournamentId));
  });

  app.post(`${API_PREFIX}/tournaments/:tournamentId/bracket/:nodeId/stage`, (req, res) => {
    const input = tournamentBracketMatchSchema.parse({
      tournamentId: req.params.tournamentId,
      nodeId: req.params.nodeId
    });
    res.json(service.stageTournamentBracketMatch(input.tournamentId, input.nodeId));
  });

  app.post(`${API_PREFIX}/tournaments/:tournamentId/group-matches/:matchId/stage`, (req, res) => {
    const input = tournamentGroupMatchSchema.parse({
      tournamentId: req.params.tournamentId,
      matchId: req.params.matchId
    });
    res.json(service.stageTournamentGroupMatch(input.tournamentId, input.matchId));
  });

  app.post(`${API_PREFIX}/tunnel/start`, (_req, res) => {
    res.json(service.startTunnel());
  });

  app.post(`${API_PREFIX}/tunnel/stop`, (_req, res) => {
    res.json(service.stopTunnel());
  });

  if (options.rendererDistDir) {
    app.use(express.static(options.rendererDistDir));
  }

  app.get("*", async (req, res, next) => {
    if (req.path.startsWith(API_PREFIX) || req.path === WS_PATH) {
      next();
      return;
    }

    try {
      if (options.rendererDevUrl) {
        // In dev the backend still owns routing, but it proxies UI requests to the Vite dev server.
        await proxyDevRequest(options.rendererDevUrl, req.originalUrl, res);
        return;
      }

      if (!options.rendererDistDir) {
        res.status(404).send("Renderer build not found.");
        return;
      }

      res.sendFile(path.join(options.rendererDistDir, "index.html"));
    } catch (error) {
      next(error);
    }
  });

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      if (debugEnabled) {
        console.error("[api] request failed", error);
      }
      res.status(500).json({ message });
    }
  );

  return {
    service,
    async start() {
      await service.init();
      return new Promise<{ port: number }>((resolve) => {
        httpServer.listen(options.port ?? DEFAULT_SERVER_PORT, "0.0.0.0", () => {
          const address = httpServer.address();
          const port =
            typeof address === "object" && address
              ? address.port
              : (options.port ?? DEFAULT_SERVER_PORT);
          service.setServerPort(port);
          resolve({ port });
        });
      });
    },
    async stop() {
      await service.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      wsServer.close();
    }
  };
}
