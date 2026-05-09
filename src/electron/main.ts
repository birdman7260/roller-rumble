import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, screen } from "electron";
import { loadDotenvFiles } from "../backend/env";
import { createBackendServer, type BackendServer } from "../backend/server";

loadDotenvFiles();

let backend: BackendServer | null = null;
let adminWindow: BrowserWindow | null = null;
let raceWindow: BrowserWindow | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isDev(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL);
}

function isDebugEnabled(): boolean {
  return process.env.GOLDSPRINTS_DEBUG === "1";
}

function shouldOpenDevTools(): boolean {
  return process.env.GOLDSPRINTS_OPEN_DEVTOOLS === "1";
}

function resolveRendererDistDir(): string {
  return isDev()
    ? path.resolve(__dirname, "../../dist/renderer")
    : path.resolve(__dirname, "../renderer");
}

function resolveRuntimeDataDir(): string {
  const override = process.env.GOLDSPRINTS_DATA_DIR;
  if (override) {
    // Dev mode can pin data into the repo so resets are predictable and don't touch real app data.
    return path.resolve(process.cwd(), override);
  }

  if (isDev()) {
    return path.resolve(process.cwd(), ".goldsprints-dev/runtime");
  }

  return path.join(app.getPath("userData"), "runtime");
}

function wireWindowDebugging(window: BrowserWindow, label: string): void {
  if (shouldOpenDevTools()) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  if (!isDebugEnabled()) {
    return;
  }

  // Mirroring renderer console output into the terminal makes async UI failures visible during dev.
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${label}] level=${level} ${sourceId}:${line} ${message}`);
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(
      `[renderer:${label}] failed to load ${validatedUrl} (${errorCode}): ${errorDescription}`
    );
  });
}

async function createWindows(port: number): Promise<void> {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const baseUrl = rendererUrl ?? `http://127.0.0.1:${port}`;
  const displays = screen.getAllDisplays();
  const secondaryDisplay = displays.length > 1 ? displays[1] : null;

  adminWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    title: "GoldSprints Admin",
    autoHideMenuBar: true,
    backgroundColor: "#08111d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  raceWindow = new BrowserWindow({
    width: secondaryDisplay?.workArea.width ?? 1600,
    height: secondaryDisplay?.workArea.height ?? 900,
    x: secondaryDisplay?.bounds.x,
    y: secondaryDisplay?.bounds.y,
    title: "GoldSprints Race Display",
    autoHideMenuBar: true,
    backgroundColor: "#08111d",
    fullscreen: Boolean(secondaryDisplay),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  wireWindowDebugging(adminWindow, "admin");
  wireWindowDebugging(raceWindow, "race");

  // Both windows render the same app, but route-level shells tailor each surface to its role.
  await adminWindow.loadURL(`${baseUrl}/admin`);
  await raceWindow.loadURL(`${baseUrl}/race`);

  adminWindow.on("closed", () => {
    adminWindow = null;
    if (raceWindow && !raceWindow.isDestroyed()) {
      raceWindow.close();
    }
  });

  raceWindow.on("closed", () => {
    raceWindow = null;
  });
}

async function bootstrap(): Promise<void> {
  // The backend is embedded into the desktop app so SQLite, APIs, and the racer page ship together.
  const userDataDir = resolveRuntimeDataDir();
  backend = createBackendServer({
    dataDir: userDataDir,
    port: Number(process.env.GOLDSPRINTS_PORT ?? "3187"),
    rendererDistDir: resolveRendererDistDir(),
    rendererDevUrl: process.env.ELECTRON_RENDERER_URL
  });

  const { port } = await backend.start();
  await createWindows(port);
}

process.on("uncaughtException", (error) => {
  console.error("[main] uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection", reason);
});

void app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  void (async () => {
    await backend?.stop();
    backend = null;
    if (process.platform !== "darwin") {
      app.quit();
    }
  })();
});

app.on("activate", () => {
  void (async () => {
    if (BrowserWindow.getAllWindows().length === 0 && backend) {
      const port = Number(process.env.GOLDSPRINTS_PORT ?? "3187");
      await createWindows(port);
    }
  })();
});
