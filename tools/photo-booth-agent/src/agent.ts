import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import type { Response } from "express";
import type { PhotoBoothSession } from "../../../src/shared/types";
import {
  GPhotoCameraAdapter,
  ManualScannerAdapter,
  SerialScannerAdapter,
  SimulatedCameraAdapter,
  SimulatedLightAdapter,
  SimulatedScannerAdapter,
  SimulatedUmbrellaAdapter,
  UmbrellaProcessAdapter,
  WledSerialLightAdapter,
  extractToken,
  type CameraAdapter,
  type CapturedPhoto,
  type LightAdapter,
  type ScannerAdapter,
  type UmbrellaAdapter
} from "./adapters";
import { getConfig, type BoothAgentConfig } from "./config";
import { createFakePhotoBoothSession, isFakeQrToken } from "./fake-token";
import { PHOTO_MODE_START_LOOK_ID, resolveLightLookSelection } from "./light-looks";
import { BoothQueue, type QueuedBoothCapture } from "./queue";
import { createIdleBoothState, reduceBoothSession, type BoothSessionState } from "./state";
import type {
  BoothHardwareHealth,
  DiagnosticsResult,
  LightSelection,
  UmbrellaState
} from "./types";
import { nowIso } from "./types";

const CAPTURE_COUNTDOWN_MS = 3_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseLightLookRequest(body: Record<string, unknown>): LightSelection {
  return resolveLightLookSelection(body.lookId);
}

async function readResponseErrorMessage(response: globalThis.Response): Promise<string> {
  const body = await response.text();
  try {
    const payload = JSON.parse(body) as { message?: unknown };
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Fall back to the raw text because some upstream failures are not JSON.
  }

  return body.trim() || `Request failed with status ${response.status}`;
}

function createCamera(config: BoothAgentConfig, captureDir: string): CameraAdapter {
  return config.camera.mode === "gphoto2"
    ? new GPhotoCameraAdapter({ outputDir: captureDir, gphotoPath: config.camera.gphotoPath })
    : new SimulatedCameraAdapter({
        outputDir: captureDir,
        samplePhotoPath: config.camera.simulatorPhotoPath
      });
}

function createScanner(config: BoothAgentConfig): ScannerAdapter {
  if (config.scanner.mode === "serial" && config.scanner.serialPort) {
    return new SerialScannerAdapter({
      serialPort: config.scanner.serialPort,
      baudRate: config.scanner.baudRate
    });
  }

  return config.scanner.mode === "manual"
    ? new ManualScannerAdapter()
    : new SimulatedScannerAdapter();
}

function createLights(config: BoothAgentConfig): LightAdapter {
  if (config.lights.mode === "wled-serial" && config.lights.serialPort) {
    return new WledSerialLightAdapter({
      serialPort: config.lights.serialPort,
      baudRate: config.lights.baudRate,
      idlePreset: config.lights.idlePreset,
      defaultSelection: config.lights.defaultSelection
    });
  }

  return new SimulatedLightAdapter(config.lights.defaultSelection);
}

function createUmbrella(config: BoothAgentConfig): UmbrellaAdapter {
  if (config.umbrella.mode === "process") {
    return new UmbrellaProcessAdapter(config.umbrella);
  }

  return new SimulatedUmbrellaAdapter(config.umbrella.panelCount);
}

class PhotoBoothAgent {
  private readonly app = express();
  private readonly queue: BoothQueue;
  private readonly camera: CameraAdapter;
  private readonly scanner: ScannerAdapter;
  private readonly lights: LightAdapter;
  private readonly umbrella: UmbrellaAdapter;
  private readonly sseClients = new Set<Response>();
  private state: BoothSessionState;
  private currentCapture: CapturedPhoto | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private preCaptureUmbrella: UmbrellaState | null = null;

  constructor(private readonly config: BoothAgentConfig) {
    const captureDir = path.join(config.dataDir, "captures");
    this.queue = new BoothQueue(config.dataDir);
    this.camera = createCamera(config, captureDir);
    this.scanner = createScanner(config);
    this.lights = createLights(config);
    this.umbrella = createUmbrella(config);
    this.state = createIdleBoothState(config.lights.defaultSelection, this.umbrella.getState());

    this.app.use(express.json({ limit: "1mb" }));
    this.app.use("/captures", express.static(captureDir));
    this.app.use(express.static(config.kioskDistDir));
    this.registerRoutes();
  }

  start(): void {
    this.app.listen(this.config.port, () => {
      console.log(`Photo booth kiosk listening on http://127.0.0.1:${this.config.port}`);
    });
    void this.startHardware();
    void this.syncPending();
    setInterval(() => {
      void this.syncPending();
    }, 15_000);
    this.registerShutdownHandlers();
  }

  private async startHardware(): Promise<void> {
    await this.scanner.start((payload) => {
      void this.handleScanPayload(payload, "scanner");
    });
    await this.prepareIdleHardware();
    await this.sendBoothStatus("idle", this.queue.listPending().length);
    this.broadcastState();
  }

  private registerRoutes(): void {
    this.app.get("/", (_req, res) => {
      const indexPath = path.join(this.config.kioskDistDir, "index.html");
      if (fsSync.existsSync(indexPath)) {
        res.sendFile(indexPath);
        return;
      }

      res.type("html").send("<h1>Run pnpm --dir tools/photo-booth-agent kiosk:build first.</h1>");
    });

    this.app.get("/api/state", (_req, res) => {
      res.json(this.presenterState());
    });

    this.app.get("/api/events", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify(this.presenterState())}\n\n`);
      this.sseClients.add(res);
      req.on("close", () => {
        this.sseClients.delete(res);
      });
    });

    this.app.post("/api/scan", async (req, res, next) => {
      try {
        const body = req.body as Record<string, unknown>;
        const payload = typeof body.payload === "string" ? body.payload : "";
        await this.handleScanPayload(payload, "manual");
        res.json(this.presenterState());
      } catch (error) {
        next(error);
      }
    });

    this.app.post("/api/lights/selection", async (req, res, next) => {
      try {
        const selection = parseLightLookRequest(req.body as Record<string, unknown>);
        await this.lights.applySelection(selection);
        this.state = reduceBoothSession(this.state, { type: "light-selected", selection });
        this.broadcastState();
        res.json(this.presenterState());
      } catch (error) {
        await this.fail(error);
        next(error);
      }
    });

    this.app.post("/api/umbrella/spin", async (_req, res, next) => {
      try {
        const umbrella = await this.umbrella.spin();
        this.state = reduceBoothSession(this.state, { type: "umbrella-updated", umbrella });
        this.broadcastState();
        res.json(this.presenterState());
      } catch (error) {
        await this.fail(error);
        next(error);
      }
    });

    this.app.post("/api/umbrella/panel", async (req, res, next) => {
      try {
        const body = req.body as Record<string, unknown>;
        const panelIndex = Number(body.panelIndex ?? 0);
        const umbrella = await this.umbrella.moveToPanel(panelIndex);
        this.state = reduceBoothSession(this.state, { type: "umbrella-updated", umbrella });
        this.broadcastState();
        res.json(this.presenterState());
      } catch (error) {
        await this.fail(error);
        next(error);
      }
    });

    this.app.post("/api/capture", async (_req, res, next) => {
      try {
        await this.capturePhoto();
        res.json(this.presenterState());
      } catch (error) {
        await this.fail(error);
        next(error);
      }
    });

    this.app.post("/api/accept", async (_req, res, next) => {
      try {
        await this.acceptCapture();
        res.json(this.presenterState());
      } catch (error) {
        await this.fail(error);
        next(error);
      }
    });

    this.app.post("/api/retake", async (_req, res, next) => {
      try {
        await this.retakeCapture();
        res.json(this.presenterState());
      } catch (error) {
        await this.fail(error);
        next(error);
      }
    });

    this.app.post("/api/cancel", async (_req, res, next) => {
      try {
        await this.resetSession();
        res.json(this.presenterState());
      } catch (error) {
        next(error);
      }
    });

    this.app.post("/api/sync", async (_req, res) => {
      await this.syncPending();
      res.json(this.presenterState());
    });

    this.app.get("/api/diagnostics", async (_req, res) => {
      res.json(await this.runDiagnostics());
    });

    this.app.post("/api/diagnostics/run", async (_req, res) => {
      res.json(await this.runDiagnostics());
    });

    this.app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(500).json({
          ...this.presenterState(),
          message: error instanceof Error ? error.message : "Photo booth action failed."
        });
      }
    );
  }

  private presenterState(): BoothSessionState & {
    previewUrl: string | null;
    pendingUploadCount: number;
    hardware: BoothHardwareHealth;
    diagnosticsUrl: string;
  } {
    return {
      ...this.state,
      previewUrl: this.state.previewPath,
      pendingUploadCount: this.queue.listPending().length,
      hardware: this.getHardwareHealth(),
      diagnosticsUrl: "/api/diagnostics"
    };
  }

  private broadcastState(): void {
    const payload = `data: ${JSON.stringify(this.presenterState())}\n\n`;
    for (const client of this.sseClients) {
      client.write(payload);
    }
  }

  private getHardwareHealth(): BoothHardwareHealth {
    const umbrella = this.umbrella.getHealth();
    return {
      scanner: this.scanner.getHealth(),
      camera: this.camera.getHealth(),
      lights: this.lights.getHealth(),
      umbrella: umbrella.umbrella,
      hallSensor: umbrella.hallSensor
    };
  }

  private async handleScanPayload(
    scanPayload: string,
    source: "scanner" | "manual"
  ): Promise<void> {
    if (!["idle", "error"].includes(this.state.flow)) {
      return;
    }

    const token = extractToken(scanPayload);
    if (!token) {
      throw new Error("Scan a racer QR before starting a photo session.");
    }

    const session = await this.resolveSession(token);
    this.state = reduceBoothSession(this.state, {
      type: "scan",
      token,
      racerName: session.racerName
    });
    // Each booth session begins from white light so the picker state matches the hardware reset.
    this.state = reduceBoothSession(this.state, {
      type: "light-selected",
      selection: resolveLightLookSelection(PHOTO_MODE_START_LOOK_ID)
    });
    await this.lights.enterPhotoMode(session.racerName);
    const umbrella = await this.umbrella.spin();
    this.state = reduceBoothSession(this.state, { type: "photo-mode-ready", umbrella });
    this.armWatchdog();
    await this.sendBoothStatus(
      "online",
      this.queue.listPending().length,
      `Ready for ${session.racerName}`
    );
    this.broadcastState();
    console.log(`[booth] ${source} scan resolved for ${session.racerName}`);
  }

  private async capturePhoto(): Promise<void> {
    if (!this.state.token) {
      throw new Error("Scan a racer QR before taking a photo.");
    }

    const token = this.state.token;
    this.preCaptureUmbrella = this.state.umbrella;
    this.state = reduceBoothSession(this.state, {
      type: "capture-started",
      countdownEndsAt: new Date(Date.now() + CAPTURE_COUNTDOWN_MS).toISOString()
    });
    await this.sendBoothStatus("capturing", this.queue.listPending().length, "Capturing photo.");
    this.broadcastState();
    await delay(CAPTURE_COUNTDOWN_MS);
    const umbrella = await this.umbrella.hold();
    this.currentCapture = await this.camera.capturePhoto(token.slice(0, 12));
    this.state = reduceBoothSession(this.state, {
      type: "capture-ready",
      previewPath: `/captures/${this.currentCapture.fileName}`,
      umbrella
    });
    this.armWatchdog();
    this.broadcastState();
  }

  private async acceptCapture(): Promise<void> {
    if (!this.state.token || !this.currentCapture) {
      throw new Error("There is no captured photo to accept.");
    }

    const token = this.state.token;
    this.state = reduceBoothSession(this.state, { type: "accept-started" });
    if (this.config.testing.allowFakeQr && isFakeQrToken(token)) {
      await this.deleteCurrentCapture();
      await this.lights.success();
      await this.prepareIdleHardware();
      this.state = reduceBoothSession(this.state, {
        type: "accepted",
        idleUmbrella: this.umbrella.getState()
      });
      this.clearWatchdog();
      await this.sendBoothStatus(
        "online",
        this.queue.listPending().length,
        "Fake booth test accepted locally."
      );
      this.broadcastState();
      return;
    }

    this.queue.enqueue({
      token,
      boothId: this.config.boothId,
      filePath: this.currentCapture.filePath,
      fileName: this.currentCapture.fileName,
      contentType: this.currentCapture.contentType,
      capturedAt: this.currentCapture.capturedAt
    });
    await this.syncPending();
    await this.lights.success();
    this.currentCapture = null;
    await this.prepareIdleHardware();
    this.state = reduceBoothSession(this.state, {
      type: "accepted",
      idleUmbrella: this.umbrella.getState()
    });
    this.clearWatchdog();
    this.broadcastState();
  }

  private async retakeCapture(): Promise<void> {
    await this.deleteCurrentCapture();
    await this.lights.applySelection(this.state.lightSelection);
    const umbrella = await this.restorePreCaptureUmbrella();
    this.state = reduceBoothSession(this.state, { type: "retake", umbrella });
    this.armWatchdog();
    this.broadcastState();
  }

  private async restorePreCaptureUmbrella(): Promise<UmbrellaState> {
    if (
      this.preCaptureUmbrella?.mode === "holding" &&
      this.preCaptureUmbrella.currentPanel !== null
    ) {
      return this.umbrella.moveToPanel(this.preCaptureUmbrella.currentPanel);
    }

    return this.umbrella.spin();
  }

  private async prepareIdleHardware(): Promise<void> {
    await this.lights.enterIdle().catch(() => undefined);
    await this.umbrella.park().catch(() => undefined);
  }

  private async resolveSession(token: string): Promise<PhotoBoothSession> {
    if (this.config.testing.allowFakeQr) {
      const fakeSession = createFakePhotoBoothSession(token);
      if (fakeSession) {
        return fakeSession;
      }
    }

    const response = await fetch(`${this.config.mainServerUrl}/api/booth/sessions/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goldsprints-booth-secret": this.config.pairingSecret
      },
      body: JSON.stringify({
        token,
        boothId: this.config.boothId
      })
    });
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response));
    }

    return (await response.json()) as PhotoBoothSession;
  }

  private async syncPending(): Promise<void> {
    const pending = this.queue.listPending();
    await this.sendBoothStatus(pending.length > 0 ? "syncing" : "online", pending.length);

    for (const capture of pending) {
      try {
        await this.uploadCapture(capture);
        this.queue.markSynced(capture.id);
      } catch (error) {
        this.queue.markFailed(
          capture.id,
          error instanceof Error ? error.message : "Unknown sync failure"
        );
      }
    }

    await this.sendBoothStatus("online", this.queue.listPending().length);
  }

  private async uploadCapture(capture: QueuedBoothCapture): Promise<void> {
    const bytes = await fs.readFile(capture.filePath);
    const form = new FormData();
    form.set("token", capture.token);
    form.set("boothId", capture.boothId);
    form.set("capturedAt", capture.capturedAt);
    form.set(
      "photo",
      new Blob([new Uint8Array(bytes)], { type: capture.contentType }),
      capture.fileName
    );

    const response = await fetch(`${this.config.mainServerUrl}/api/booth/avatar-originals`, {
      method: "POST",
      headers: {
        "x-goldsprints-booth-secret": this.config.pairingSecret
      },
      body: form
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }

    await fs.unlink(capture.filePath).catch(() => undefined);
  }

  private async sendBoothStatus(
    status: "idle" | "online" | "capturing" | "syncing" | "error",
    pendingUploadCount: number,
    message?: string
  ): Promise<void> {
    await fetch(`${this.config.mainServerUrl}/api/booth/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goldsprints-booth-secret": this.config.pairingSecret
      },
      body: JSON.stringify({
        boothId: this.config.boothId,
        status,
        pendingUploadCount,
        message,
        hardware: this.getHardwareHealth()
      })
    }).catch(() => undefined);
  }

  private async runDiagnostics(): Promise<DiagnosticsResult> {
    const [scanner, camera, lights, umbrella] = await Promise.all([
      this.scanner.diagnose(),
      this.camera.diagnose(),
      this.lights.diagnose(),
      this.umbrella.diagnose()
    ]);
    const result = {
      checkedAt: nowIso(),
      scanner,
      camera,
      lights,
      umbrella: umbrella.umbrella,
      hallSensor: umbrella.hallSensor
    };
    this.broadcastState();
    return result;
  }

  private async fail(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Photo booth action failed.";
    this.state = reduceBoothSession(this.state, { type: "failed", message });
    await this.lights.error().catch(() => undefined);
    await this.umbrella.stop().catch(() => undefined);
    await this.sendBoothStatus("error", this.queue.listPending().length, message);
    this.broadcastState();
  }

  private async resetSession(): Promise<void> {
    await this.deleteCurrentCapture();
    await this.prepareIdleHardware();
    this.state = reduceBoothSession(this.state, {
      type: "cancelled",
      idleUmbrella: this.umbrella.getState()
    });
    this.clearWatchdog();
    await this.sendBoothStatus("idle", this.queue.listPending().length);
    this.broadcastState();
  }

  private async deleteCurrentCapture(): Promise<void> {
    if (!this.currentCapture) {
      return;
    }

    await fs.unlink(this.currentCapture.filePath).catch(() => undefined);
    this.currentCapture = null;
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdog = setTimeout(() => {
      void this.resetSession();
    }, 120_000);
  }

  private clearWatchdog(): void {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }

  private registerShutdownHandlers(): void {
    const shutdown = () => {
      void (async () => {
        await this.scanner.stop().catch(() => undefined);
        await this.lights.enterIdle().catch(() => undefined);
        await this.umbrella.shutdown().catch(() => undefined);
        process.exit(0);
      })();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  new PhotoBoothAgent(getConfig()).start();
}
