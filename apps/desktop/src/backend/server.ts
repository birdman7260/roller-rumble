import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import type { Duplex } from "node:stream";
import express from "express";
import cors from "cors";
import multer from "multer";
import { WebSocketServer } from "ws";
import { API_PREFIX, DEFAULT_SERVER_PORT, WS_PATH } from "@goldsprints/shared/constants";
import type { AppSnapshot } from "@goldsprints/shared/types";
import {
  accountlessRacerSessionSchema,
  adminTournamentByeFillSchema,
  adminNotificationSchema,
  createEventSchema,
  createPhotoBoothTokenSchema,
  createRacerSchema,
  notificationIdSchema,
  passkeyChallengeSchema,
  passkeyEmailSchema,
  passkeyRegistrationStartSchema,
  queueSignupSchema,
  racerQueueSignupSchema,
  removeRacerSchema,
  resolvePhotoBoothSessionSchema,
  settingUpdateSchema,
  startTournamentSchema,
  adminTournamentRacerRemovalSchema,
  tournamentBracketMatchSchema,
  tournamentGroupMatchSchema,
  tournamentIdSchema,
  tournamentRacerSchema,
  updateEventPaymentConfigSchema,
  updateRacerPaymentSchema,
  updatePhotoBoothStatusSchema,
  webPushSubscriptionSchema
} from "@goldsprints/shared/validation";
import { AppHttpError, GoldsprintsApp } from "./services/app";

interface BackendServerOptions {
  dataDir: string;
  port?: number;
  rendererDistDir?: string;
  rendererDevUrl?: string;
}

const RACER_SESSION_COOKIE = "goldsprints_racer_session";

export interface BackendServer {
  service: GoldsprintsApp;
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(";").flatMap((chunk) => {
      const [name, ...valueParts] = chunk.trim().split("=");
      if (!name || valueParts.length === 0) {
        return [];
      }
      return [[name, decodeURIComponent(valueParts.join("="))]];
    })
  );
}

function getSessionToken(req: express.Request): string | null {
  const cookieToken = parseCookies(req.get("cookie"))[RACER_SESSION_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }

  const authorization = req.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return null;
}

function getRequestOrigin(req: express.Request): string {
  const origin = req.get("origin");
  if (origin) {
    return new URL(origin).origin;
  }

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = forwardedProto ?? req.protocol;
  const host = forwardedHost ?? req.get("host") ?? `127.0.0.1:${DEFAULT_SERVER_PORT}`;
  return `${proto}://${host}`;
}

function setRacerSessionCookie(req: express.Request, res: express.Response, token: string): void {
  const origin = getRequestOrigin(req);
  res.cookie(RACER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

function clearRacerSessionCookie(req: express.Request, res: express.Response): void {
  const origin = getRequestOrigin(req);
  res.clearCookie(RACER_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/"
  });
}

function requireRacerSession(req: express.Request, service: GoldsprintsApp) {
  const racer = service.getRacerAuthSession(getSessionToken(req));
  if (!racer) {
    throw new AppHttpError("Please sign in before continuing.", 401, "auth_required");
  }
  return racer;
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

function formatProxyHeaders(headers: http.IncomingHttpHeaders, targetHost: string): string {
  return Object.entries({
    ...headers,
    host: targetHost
  })
    .flatMap(([name, value]) => {
      if (Array.isArray(value)) {
        return value.map((entry) => `${name}: ${entry}`);
      }
      return [`${name}: ${value}`];
    })
    .join("\r\n");
}

function proxyDevWebSocketUpgrade(
  rendererDevUrl: string,
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  const target = new URL(req.url ?? "/", rendererDevUrl);
  const targetPort = Number(target.port || (target.protocol === "https:" ? "443" : "80"));
  const connectOptions = {
    host: target.hostname,
    port: targetPort
  };
  const upstream =
    target.protocol === "https:" ? tls.connect(connectOptions) : net.connect(connectOptions);

  upstream.on("connect", () => {
    // Vite's HMR websocket is only needed in dev; proxying it keeps public tunnel testing quiet.
    upstream.write(
      `${req.method ?? "GET"} ${target.pathname}${target.search} HTTP/${req.httpVersion}\r\n${formatProxyHeaders(
        req.headers,
        target.host
      )}\r\n\r\n`
    );
    if (head.length > 0) {
      upstream.write(head);
    }
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on("error", () => {
    socket.destroy();
  });
  socket.on("error", () => {
    upstream.destroy();
  });
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
      const rawRacerId = (req.params as Record<string, string | string[] | undefined>).racerId;
      const racerId = Array.isArray(rawRacerId) ? rawRacerId[0] : (rawRacerId ?? "booth-upload");
      callback(null, `${racerId}-${String(Date.now())}${extension}`);
    }
  });
  const upload = multer({ storage });

  const wsServer = new WebSocketServer({ noServer: true });
  const debugEnabled = process.env.GOLDSPRINTS_DEBUG === "1";

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === WS_PATH) {
      wsServer.handleUpgrade(req, socket, head, (ws) => {
        wsServer.emit("connection", ws, req);
      });
      return;
    }

    if (options.rendererDevUrl) {
      proxyDevWebSocketUpgrade(options.rendererDevUrl, req, socket, head);
      return;
    }

    socket.destroy();
  });

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

  app.use(cors({ origin: true, credentials: true }));
  app.post(
    `${API_PREFIX}/webhooks/stripe`,
    express.raw({ type: "application/json", limit: "2mb" }),
    (req, res, next) => {
      try {
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""));
        res.json(service.handleStripeWebhook(rawBody, req.get("stripe-signature")));
      } catch (error) {
        next(error);
      }
    }
  );
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

  app.get(`${API_PREFIX}/notifications/config`, (_req, res) => {
    res.json(service.getNotificationConfig());
  });

  app.get(`${API_PREFIX}/meta`, async (_req, res) => {
    res.json({
      localBaseUrl: service.getLocalBaseUrl(),
      qrCodeDataUrl: await service.getQrCodeDataUrl()
    });
  });

  app.get(`${API_PREFIX}/auth/session`, (req, res) => {
    const sessionToken = getSessionToken(req);
    res.json({
      racer: service.getRacerAuthSession(sessionToken),
      snapshot: service.getSnapshot(),
      sessionToken
    });
  });

  app.post(`${API_PREFIX}/auth/sign-out`, (req, res) => {
    clearRacerSessionCookie(req, res);
    res.json({
      racer: null,
      snapshot: service.getSnapshot()
    });
  });

  app.post(`${API_PREFIX}/auth/passkeys/sign-in/options`, async (req, res, next) => {
    try {
      const input = passkeyEmailSchema.parse(req.body);
      const context = service.getPasskeyRequestContext(getRequestOrigin(req));
      res.json(await service.startPasskeySignIn(input.email, context));
    } catch (error) {
      next(error);
    }
  });

  app.post(`${API_PREFIX}/auth/passkeys/sign-in/verify`, async (req, res, next) => {
    try {
      const input = passkeyChallengeSchema.parse(req.body);
      const result = await service.finishPasskeySignIn(input.challengeId, input.response);
      const sessionToken = service.createRacerSessionToken(result.racer.id);
      setRacerSessionCookie(req, res, sessionToken);
      res.json({ ...result, sessionToken });
    } catch (error) {
      next(error);
    }
  });

  app.post(`${API_PREFIX}/auth/passkeys/register/options`, async (req, res, next) => {
    try {
      const input = passkeyRegistrationStartSchema.parse(req.body);
      const context = service.getPasskeyRequestContext(getRequestOrigin(req));
      const sessionRacer = service.getRacerAuthSession(getSessionToken(req));
      res.json(await service.startPasskeyRegistration(input, context, sessionRacer?.id));
    } catch (error) {
      next(error);
    }
  });

  app.post(`${API_PREFIX}/auth/passkeys/register/verify`, async (req, res, next) => {
    try {
      const input = passkeyChallengeSchema.parse(req.body);
      const result = await service.finishPasskeyRegistration(input.challengeId, input.response);
      const sessionToken = service.createRacerSessionToken(result.racer.id);
      setRacerSessionCookie(req, res, sessionToken);
      res.json({ ...result, sessionToken });
    } catch (error) {
      next(error);
    }
  });

  app.post(`${API_PREFIX}/auth/accountless`, (req, res) => {
    const input = accountlessRacerSessionSchema.parse(req.body);
    const result = service.createAccountlessRacerSession(input);
    const sessionToken = service.createRacerSessionToken(result.racer.id);
    setRacerSessionCookie(req, res, sessionToken);
    res.json({ ...result, sessionToken });
  });

  app.get(`${API_PREFIX}/booth/status`, async (_req, res) => {
    res.json(await service.getPhotoBoothAdminStatus());
  });

  app.post(`${API_PREFIX}/booth/pairing/rotate`, async (_req, res) => {
    res.json(await service.rotatePhotoBoothPairing());
  });

  app.post(`${API_PREFIX}/booth/status`, (req, res) => {
    const input = updatePhotoBoothStatusSchema.parse(req.body);
    service.assertPhotoBoothSecret(input.boothId, req.get("x-goldsprints-booth-secret"));
    res.json(service.updatePhotoBoothStatus(input));
  });

  app.post(`${API_PREFIX}/booth/tokens`, async (req, res) => {
    const input = createPhotoBoothTokenSchema.parse(req.body);
    res.json(await service.createPhotoBoothToken(input.racerId));
  });

  app.post(`${API_PREFIX}/racer/booth/tokens`, async (req, res) => {
    const racer = requireRacerSession(req, service);
    res.json(await service.createPhotoBoothToken(racer.id));
  });

  app.post(`${API_PREFIX}/booth/sessions/resolve`, (req, res) => {
    const input = resolvePhotoBoothSessionSchema.parse(req.body);
    if (input.boothId) {
      service.assertPhotoBoothSecret(input.boothId, req.get("x-goldsprints-booth-secret"));
    }
    res.json(service.resolvePhotoBoothSession(input));
  });

  app.post(`${API_PREFIX}/booth/avatar-originals`, upload.single("photo"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Missing booth photo file" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const boothId = typeof body.boothId === "string" ? body.boothId : "";
    const token = typeof body.token === "string" ? body.token : "";
    const capturedAt =
      typeof body.capturedAt === "string" ? body.capturedAt : new Date().toISOString();
    service.assertPhotoBoothSecret(boothId, req.get("x-goldsprints-booth-secret"));
    res.json(
      service.acceptPhotoBoothAvatarOriginal({
        boothId,
        token,
        capturedAt,
        originalTempPath: req.file.path,
        originalFileName: req.file.originalname
      })
    );
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

  app.post(`${API_PREFIX}/events/current/payment`, (req, res) => {
    const input = updateEventPaymentConfigSchema.parse(req.body);
    res.json(service.updateActiveEventPaymentConfig(input));
  });

  app.post(`${API_PREFIX}/queue`, async (req, res, next) => {
    try {
      const racer = requireRacerSession(req, service);
      const input = racerQueueSignupSchema.parse(req.body);
      res.json(await service.signUpQueueForRacer(racer.id, input));
    } catch (error) {
      next(error);
    }
  });

  app.post(`${API_PREFIX}/racer/notifications/subscriptions`, (req, res) => {
    const racer = requireRacerSession(req, service);
    const input = webPushSubscriptionSchema.parse(req.body);
    res.json(service.saveRacerPushSubscription(racer.id, input, req.get("user-agent")));
  });

  app.delete(`${API_PREFIX}/racer/notifications/subscriptions`, (req, res) => {
    const racer = requireRacerSession(req, service);
    const input = webPushSubscriptionSchema.parse(req.body);
    res.json(service.revokeRacerPushSubscription(racer.id, input));
  });

  app.get(`${API_PREFIX}/racer/notifications`, (req, res) => {
    const racer = requireRacerSession(req, service);
    res.json(service.listRacerNotifications(racer.id));
  });

  app.post(`${API_PREFIX}/racer/notifications/:notificationId/read`, (req, res) => {
    const racer = requireRacerSession(req, service);
    const input = notificationIdSchema.parse({ notificationId: req.params.notificationId });
    res.json(service.markRacerNotificationRead(racer.id, input.notificationId));
  });

  app.post(`${API_PREFIX}/racer/tournaments/current/opt-out`, (req, res) => {
    const racer = requireRacerSession(req, service);
    res.json(service.optOutOfActiveTournament(racer.id));
  });

  app.post(`${API_PREFIX}/racer/payments/:paymentId/cancel`, (req, res) => {
    const racer = requireRacerSession(req, service);
    res.json(service.cancelRacerCheckoutPayment(racer.id, req.params.paymentId));
  });

  app.post(`${API_PREFIX}/admin/queue`, (req, res) => {
    const input = queueSignupSchema.parse(req.body);
    res.json(service.signUpQueue(input));
  });

  app.post(`${API_PREFIX}/admin/racers/:racerId/payment`, (req, res) => {
    const payment = updateRacerPaymentSchema.parse(req.body);
    res.json(service.updateRacerPaymentStatus(req.params.racerId, payment));
  });

  app.post(`${API_PREFIX}/admin/notifications`, (req, res) => {
    const input = adminNotificationSchema.parse(req.body);
    res.json(service.sendAdminNotification(input));
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

  app.post(`${API_PREFIX}/races/current/unstage`, (_req, res) => {
    res.json(service.unstageCurrentRace());
  });

  app.post(`${API_PREFIX}/races/current/reset-to-staged`, (_req, res) => {
    res.json(service.resetCurrentRaceToStaged());
  });

  app.post(`${API_PREFIX}/races/current/unstage-tournament`, (_req, res) => {
    res.json(service.unstageCurrentTournamentRace());
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

  app.post(`${API_PREFIX}/races/result-presentation/dismiss`, (_req, res) => {
    res.json(service.dismissRaceResultPresentation());
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

  app.get(`${API_PREFIX}/tournaments/:tournamentId/racers/:racerId/removal-options`, (req, res) => {
    const input = tournamentRacerSchema.parse({
      tournamentId: req.params.tournamentId,
      racerId: req.params.racerId
    });
    res.json(service.getTournamentRacerRemovalOptions(input.tournamentId, input.racerId));
  });

  app.post(`${API_PREFIX}/tournaments/:tournamentId/racers/:racerId/remove`, (req, res) => {
    const params = tournamentRacerSchema.parse({
      tournamentId: req.params.tournamentId,
      racerId: req.params.racerId
    });
    const input = adminTournamentRacerRemovalSchema.parse(req.body);
    res.json(service.removeRacerFromTournament(params.tournamentId, params.racerId, input));
  });

  app.post(`${API_PREFIX}/tournaments/:tournamentId/bracket/:nodeId/stage`, (req, res) => {
    const input = tournamentBracketMatchSchema.parse({
      tournamentId: req.params.tournamentId,
      nodeId: req.params.nodeId
    });
    res.json(service.stageTournamentBracketMatch(input.tournamentId, input.nodeId));
  });

  app.post(`${API_PREFIX}/tournaments/:tournamentId/bracket/:nodeId/undo`, (req, res) => {
    const input = tournamentBracketMatchSchema.parse({
      tournamentId: req.params.tournamentId,
      nodeId: req.params.nodeId
    });
    res.json(service.undoTournamentBracketMatch(input.tournamentId, input.nodeId));
  });

  app.get(
    `${API_PREFIX}/tournaments/:tournamentId/bracket/:nodeId/fill-bye-options`,
    (req, res) => {
      const input = tournamentBracketMatchSchema.parse({
        tournamentId: req.params.tournamentId,
        nodeId: req.params.nodeId
      });
      res.json(service.getTournamentByeFillOptions(input.tournamentId, input.nodeId));
    }
  );

  app.post(`${API_PREFIX}/tournaments/:tournamentId/bracket/:nodeId/fill-bye`, (req, res) => {
    const params = tournamentBracketMatchSchema.parse({
      tournamentId: req.params.tournamentId,
      nodeId: req.params.nodeId
    });
    const input = adminTournamentByeFillSchema.parse(req.body);
    res.json(
      service.fillTournamentByeSlot(params.tournamentId, params.nodeId, input.replacementRacerId)
    );
  });

  app.post(`${API_PREFIX}/tournaments/:tournamentId/group-matches/:matchId/stage`, (req, res) => {
    const input = tournamentGroupMatchSchema.parse({
      tournamentId: req.params.tournamentId,
      matchId: req.params.matchId
    });
    res.json(service.stageTournamentGroupMatch(input.tournamentId, input.matchId));
  });

  app.post(`${API_PREFIX}/tournaments/:tournamentId/group-matches/:matchId/undo`, (req, res) => {
    const input = tournamentGroupMatchSchema.parse({
      tournamentId: req.params.tournamentId,
      matchId: req.params.matchId
    });
    res.json(service.undoTournamentGroupMatch(input.tournamentId, input.matchId));
  });

  app.post(`${API_PREFIX}/tunnel/start`, (_req, res) => {
    res.json(service.startTunnel());
  });

  app.post(`${API_PREFIX}/tunnel/stop`, (_req, res) => {
    res.json(service.stopTunnel());
  });

  app.get(`${API_PREFIX}/tunnel/diagnostics`, (_req, res) => {
    res.json(service.getTunnelDiagnostics());
  });

  app.post(`${API_PREFIX}/tunnel/install-cloudflared`, async (_req, res, next) => {
    try {
      res.json(await service.installCloudflared());
    } catch (error) {
      next(error);
    }
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
      const statusCode = error instanceof AppHttpError ? error.statusCode : 500;
      const code = error instanceof AppHttpError ? error.code : undefined;
      if (debugEnabled) {
        console.error("[api] request failed", error);
      }
      res.status(statusCode).json({ message, code });
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
