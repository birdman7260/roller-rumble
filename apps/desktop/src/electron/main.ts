import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, screen, shell } from "electron";
import AdmZip from "adm-zip";
import { loadDotenvFiles } from "../backend/env";
import { createBackendServer, type BackendServer } from "../backend/server";
import { handleStartupFailure } from "./startup-failure";
import { getLogFilePath, getRecentLogLines, initLogging } from "./logging";
import type {
  ProjectorWindowResizeResult,
  ProjectorWindowSizePreset
} from "@roller-rumble/shared/types";

let backend: BackendServer | null = null;
let adminWindow: BrowserWindow | null = null;
let raceWindow: BrowserWindow | null = null;
let loadedDotenvFiles: string[] = [];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = findWorkspaceRoot();

function findWorkspaceRoot(): string {
  let candidate = process.cwd();

  while (candidate !== path.dirname(candidate)) {
    if (fs.existsSync(path.join(candidate, "pnpm-workspace.yaml"))) {
      return candidate;
    }

    candidate = path.dirname(candidate);
  }

  return process.cwd();
}

function isDev(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL);
}

function isDebugEnabled(): boolean {
  return process.env.ROLLER_RUMBLE_DEBUG === "1";
}

function shouldOpenDevTools(): boolean {
  return process.env.ROLLER_RUMBLE_OPEN_DEVTOOLS === "1";
}

function resolveRendererDistDir(): string {
  return isDev()
    ? path.resolve(__dirname, "../../dist/renderer")
    : path.resolve(__dirname, "../renderer");
}

function resolveRuntimeDataDir(): string {
  const override = process.env.ROLLER_RUMBLE_DATA_DIR;
  if (override) {
    // Dev mode can pin data into the repo so resets are predictable and don't touch real app data.
    return path.resolve(workspaceRoot, override);
  }

  if (isDev()) {
    return path.resolve(workspaceRoot, ".roller-rumble-dev/runtime");
  }

  return path.join(app.getPath("userData"), "runtime");
}

function resolveRuntimeEnvFilePath(): string {
  return path.join(isDev() ? workspaceRoot : app.getPath("userData"), ".env.local");
}

function resolveDotenvSearchDirs(): string[] {
  if (isDev()) {
    return [workspaceRoot];
  }

  return [workspaceRoot, app.getPath("userData")];
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

function resizeRaceWindow(preset: ProjectorWindowSizePreset): ProjectorWindowResizeResult {
  if (!raceWindow || raceWindow.isDestroyed()) {
    throw new Error("The projector window is not open.");
  }

  const size = preset === "720p" ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
  const currentBounds = raceWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const { workArea } = display;
  const xOffset = Math.max(0, (workArea.width - size.width) / 2);
  const yOffset = Math.max(0, (workArea.height - size.height) / 2);

  raceWindow.setFullScreen(false);
  raceWindow.unmaximize();
  raceWindow.setBounds({
    width: size.width,
    height: size.height,
    x: Math.round(workArea.x + xOffset),
    y: Math.round(workArea.y + yOffset)
  });
  raceWindow.focus();

  return {
    preset,
    ...size
  };
}

async function createWindows(port: number): Promise<void> {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const baseUrl = rendererUrl ?? `http://127.0.0.1:${port}`;
  const displays = screen.getAllDisplays();
  const secondaryDisplay = displays.length > 1 ? displays[1] : null;

  adminWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    title: "Roller Rumble Admin",
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
    title: "Roller Rumble Race Display",
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

async function saveDiagnosticsBundle(
  files: { name: string; content: string }[]
): Promise<string | null> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const parentWindow = adminWindow ?? raceWindow;
  const dialogOptions = {
    title: "Save Roller Rumble diagnostics",
    defaultPath: path.join(app.getPath("downloads"), `roller-rumble-diagnostics-${timestamp}.zip`),
    filters: [{ name: "Zip archive", extensions: ["zip"] }]
  };
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (result.canceled || !result.filePath) {
    return null;
  }

  const zip = new AdmZip();
  for (const file of files) {
    zip.addFile(file.name, Buffer.from(file.content, "utf8"));
  }
  zip.writeZip(result.filePath);
  return result.filePath;
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "EADDRINUSE"
  );
}

async function bootstrap(): Promise<void> {
  // Always-on logging is initialized before anything else so startup output is captured too.
  initLogging();
  loadedDotenvFiles = loadDotenvFiles({ searchDirs: resolveDotenvSearchDirs() });

  // The backend is embedded into the desktop app so SQLite, APIs, and the racer page ship together.
  const userDataDir = resolveRuntimeDataDir();
  backend = createBackendServer({
    dataDir: userDataDir,
    loadedDotenvFiles,
    dotenvSearchDirs: resolveDotenvSearchDirs(),
    openExternalUrl: (url) => shell.openExternal(url),
    openPath: (filePath) => shell.openPath(filePath),
    port: Number(process.env.ROLLER_RUMBLE_PORT ?? "3187"),
    resizeProjectorWindow: async (preset) => resizeRaceWindow(preset),
    rendererDistDir: resolveRendererDistDir(),
    rendererDevUrl: process.env.ELECTRON_RENDERER_URL,
    runtimeEnvFilePath: resolveRuntimeEnvFilePath(),
    appVersion: app.getVersion(),
    getLogLines: () => getRecentLogLines(),
    logFilePath: getLogFilePath(),
    saveDiagnosticsBundle: (files) => saveDiagnosticsBundle(files)
  });

  let port: number;
  try {
    ({ port } = await backend.start());
  } catch (error) {
    // A fatal backend startup error (bad migration, native module failure) otherwise leaves the app
    // hanging with no window. Surface it as a native dialog with a data-reset escape hatch instead.
    // Only backend.start() is guarded here — a later window-load failure must not offer to wipe data.
    console.error("[main] backend failed to start", error);
    backend = null;

    // A port conflict is not a data problem — never offer to wipe data for it. Another copy of the
    // app (or some other program) already owns the port; tell the operator plainly and quit.
    if (isAddressInUseError(error)) {
      const conflictPort = Number(process.env.ROLLER_RUMBLE_PORT ?? "3187");
      await dialog.showMessageBox({
        type: "error",
        title: "Roller Rumble is already running",
        message: `Another program is already using port ${conflictPort} on this computer.`,
        detail:
          "This is usually another copy of Roller Rumble that is still running. Close it (check " +
          "Task Manager), then open Roller Rumble again. If another program needs that port, set " +
          "ROLLER_RUMBLE_PORT to a different value in your settings file."
      });
      app.quit();
      return;
    }

    await handleStartupFailure({
      error,
      dataDir: userDataDir,
      showMessageBox: (options) => dialog.showMessageBox(options),
      removeDataDir: (dir) => fs.rmSync(dir, { recursive: true, force: true }),
      relaunchApp: () => {
        app.relaunch();
        app.exit(0);
      },
      quitApp: () => app.quit()
    });
    return;
  }

  await createWindows(port);
}

process.on("uncaughtException", (error) => {
  console.error("[main] uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection", reason);
});

// Serial ports and the backend port (3187) are exclusive: a second packaged instance can't open a
// COM port the first already holds ("Access denied") and can't bind the port ("EADDRINUSE"), so it
// must never start. Take the single-instance lock before any work; if another instance owns it, focus
// that window and quit instead of racing it for the hardware. Dev is exempt so a maintainer can still
// run a second, port-shifted instance for debugging.
if (app.isPackaged && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (app.isPackaged) {
    app.on("second-instance", () => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        return;
      }
      const existing = windows[0];
      if (existing.isMinimized()) {
        existing.restore();
      }
      existing.focus();
    });
  }

  void app.whenReady().then(bootstrap);
}

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
      const port = Number(process.env.ROLLER_RUMBLE_PORT ?? "3187");
      await createWindows(port);
    }
  })();
});
