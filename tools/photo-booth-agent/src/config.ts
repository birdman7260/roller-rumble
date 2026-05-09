import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBoothDotenv } from "./env";
import { resolveDefaultLightSelection } from "./light-looks";
import type { LightSelection } from "./types";
import { UMBRELLA_PANEL_COUNT } from "./umbrella-panels";

loadBoothDotenv();

export interface BoothAgentConfig {
  boothId: string;
  pairingSecret: string;
  mainServerUrl: string;
  dataDir: string;
  port: number;
  kioskDistDir: string;
  camera: {
    mode: "gphoto2" | "simulator";
    gphotoPath: string;
    simulatorPhotoPath: string;
  };
  scanner: {
    mode: "serial" | "manual" | "simulator";
    serialPort?: string;
    baudRate: number;
  };
  lights: {
    mode: "wled-serial" | "simulator";
    serialPort?: string;
    baudRate: number;
    idlePreset: number | null;
    defaultSelection: LightSelection;
  };
  umbrella: {
    mode: "process" | "simulator";
    pythonCommand: string;
    helperPath: string;
    stepPin?: number;
    directionPin?: number;
    enablePin?: number;
    hallPin?: number;
    panelCount: number;
    stepsPerRevolution: number;
    microsteps: number;
    homeDirection: 1 | -1;
    spinRpm: number;
    moveRpm: number;
    homingTimeoutMs: number;
  };
  testing: {
    allowFakeQr: boolean;
  };
}

const sourcePath = fileURLToPath(import.meta.url);
const packageDir = path.resolve(path.dirname(sourcePath), "..");
const repoRoot = path.resolve(packageDir, "..", "..");

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readDirection(name: string, fallback: 1 | -1): 1 | -1 {
  return process.env[name] === "-1" ? -1 : fallback;
}

function readOptionalBoolean(name: string): boolean | null {
  const raw = process.env[name];
  if (!raw) {
    return null;
  }

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function readDataDir(): string {
  const dataDir = process.env.GOLDSPRINTS_BOOTH_DATA_DIR ?? ".goldsprints-booth";
  return path.isAbsolute(dataDir) ? dataDir : path.resolve(process.cwd(), dataDir);
}

function resolveBoothPath(configuredPath: string | undefined, fallbackPath: string): string {
  if (!configuredPath) {
    return fallbackPath;
  }

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  const candidates = [
    path.resolve(repoRoot, configuredPath),
    path.resolve(packageDir, configuredPath),
    path.resolve(process.cwd(), configuredPath)
  ];
  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));

  // Most documented paths are repo-relative; use that as the stable fallback if
  // the target file does not exist yet, for example before a user adds a sample.
  return existingPath ?? candidates[0];
}

function defaultLightSelection(): LightSelection {
  return resolveDefaultLightSelection(process.env.GOLDSPRINTS_WLED_DEFAULT_LOOK);
}

function resolveScannerMode(): BoothAgentConfig["scanner"]["mode"] {
  const requested = process.env.GOLDSPRINTS_BOOTH_SCANNER_MODE;
  if (requested === "serial" || requested === "manual" || requested === "simulator") {
    return requested;
  }

  return process.env.GOLDSPRINTS_BOOTH_SCANNER_SERIAL_PORT ? "serial" : "simulator";
}

function resolveLightMode(): BoothAgentConfig["lights"]["mode"] {
  return process.env.GOLDSPRINTS_WLED_SERIAL_PORT ? "wled-serial" : "simulator";
}

function resolveUmbrellaMode(): BoothAgentConfig["umbrella"]["mode"] {
  const requested = process.env.GOLDSPRINTS_UMBRELLA_MODE;
  if (requested === "process" || requested === "simulator") {
    return requested;
  }

  return process.env.GOLDSPRINTS_UMBRELLA_STEP_PIN &&
    process.env.GOLDSPRINTS_UMBRELLA_DIR_PIN &&
    process.env.GOLDSPRINTS_UMBRELLA_HALL_PIN
    ? "process"
    : "simulator";
}

export function getConfig(): BoothAgentConfig {
  const cameraMode = process.env.GOLDSPRINTS_BOOTH_CAMERA === "gphoto2" ? "gphoto2" : "simulator";
  const scannerMode = resolveScannerMode();
  const fakeQrOverride = readOptionalBoolean("GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR");
  const allowFakeQr =
    fakeQrOverride ?? (cameraMode === "simulator" || ["manual", "simulator"].includes(scannerMode));

  return {
    boothId: process.env.GOLDSPRINTS_BOOTH_ID ?? "booth-dev",
    pairingSecret: process.env.GOLDSPRINTS_BOOTH_SECRET ?? "dev-secret",
    mainServerUrl: process.env.GOLDSPRINTS_BOOTH_SERVER_URL ?? "http://127.0.0.1:3187",
    dataDir: readDataDir(),
    port: readNumber("GOLDSPRINTS_BOOTH_PORT", 3197),
    kioskDistDir: path.join(packageDir, "dist", "kiosk"),
    camera: {
      mode: cameraMode,
      gphotoPath: process.env.GOLDSPRINTS_GPHOTO_PATH ?? "gphoto2",
      simulatorPhotoPath: resolveBoothPath(
        process.env.GOLDSPRINTS_BOOTH_SIMULATOR_PHOTO_PATH,
        path.join(packageDir, "assets", "simulated-dslr-photo.jpg")
      )
    },
    scanner: {
      mode: scannerMode,
      serialPort: process.env.GOLDSPRINTS_BOOTH_SCANNER_SERIAL_PORT,
      baudRate: readNumber("GOLDSPRINTS_BOOTH_SCANNER_BAUD", 9_600)
    },
    lights: {
      mode: resolveLightMode(),
      serialPort: process.env.GOLDSPRINTS_WLED_SERIAL_PORT,
      baudRate: readNumber("GOLDSPRINTS_WLED_BAUD", 115_200),
      idlePreset: readOptionalNumber("GOLDSPRINTS_WLED_IDLE_PRESET") ?? null,
      defaultSelection: defaultLightSelection()
    },
    umbrella: {
      mode: resolveUmbrellaMode(),
      pythonCommand: process.env.GOLDSPRINTS_BOOTH_PYTHON ?? "python3",
      helperPath: resolveBoothPath(
        process.env.GOLDSPRINTS_UMBRELLA_HELPER_PATH,
        path.join(packageDir, "hardware", "umbrella_helper.py")
      ),
      stepPin: readOptionalNumber("GOLDSPRINTS_UMBRELLA_STEP_PIN"),
      directionPin: readOptionalNumber("GOLDSPRINTS_UMBRELLA_DIR_PIN"),
      enablePin: readOptionalNumber("GOLDSPRINTS_UMBRELLA_ENABLE_PIN"),
      hallPin: readOptionalNumber("GOLDSPRINTS_UMBRELLA_HALL_PIN"),
      panelCount: readNumber("GOLDSPRINTS_UMBRELLA_PANEL_COUNT", UMBRELLA_PANEL_COUNT),
      stepsPerRevolution: readNumber("GOLDSPRINTS_UMBRELLA_STEPS_PER_REVOLUTION", 200),
      microsteps: readNumber("GOLDSPRINTS_UMBRELLA_MICROSTEPS", 16),
      homeDirection: readDirection("GOLDSPRINTS_UMBRELLA_HOME_DIRECTION", -1),
      spinRpm: readNumber("GOLDSPRINTS_UMBRELLA_SPIN_RPM", 3),
      moveRpm: readNumber("GOLDSPRINTS_UMBRELLA_MOVE_RPM", 8),
      homingTimeoutMs: readNumber("GOLDSPRINTS_UMBRELLA_HOMING_TIMEOUT_MS", 15_000)
    },
    testing: {
      allowFakeQr
    }
  };
}
