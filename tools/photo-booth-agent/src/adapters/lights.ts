import { SerialPort } from "serialport";
import { createHealth, type HardwareComponentHealth, type LightSelection } from "../types";

export interface LightAdapter {
  enterIdle(): Promise<void>;
  enterPhotoMode(sessionLabel: string): Promise<void>;
  applySelection(selection: LightSelection): Promise<void>;
  success(): Promise<void>;
  error(): Promise<void>;
  off(): Promise<void>;
  diagnose(): Promise<HardwareComponentHealth>;
  getHealth(): HardwareComponentHealth;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function hsbToRgb(
  hue: number,
  saturation: number,
  brightness: number
): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const v = clamp(brightness, 0, 255) / 255;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  return [clamp((r + m) * 255, 0, 255), clamp((g + m) * 255, 0, 255), clamp((b + m) * 255, 0, 255)];
}

export function buildWledSelectionPayload(selection: LightSelection): Record<string, unknown> {
  return {
    on: true,
    bri: clamp(selection.brightness, 1, 255),
    seg: [
      {
        col: [hsbToRgb(selection.hue, selection.saturation, selection.brightness)],
        fx: clamp(selection.effectId, 0, 255),
        sx: clamp(selection.effectSpeed, 0, 255),
        ix: clamp(selection.effectIntensity, 0, 255),
        pal: clamp(selection.paletteId, 0, 255)
      }
    ]
  };
}

function openSerialPort(port: SerialPort): Promise<void> {
  return new Promise((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()));
  });
}

function writeSerialPort(port: SerialPort, payload: string): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(payload, (writeError) => {
      if (writeError) {
        reject(writeError);
        return;
      }
      port.drain((drainError) => (drainError ? reject(drainError) : resolve()));
    });
  });
}

function closeSerialPort(port: SerialPort): Promise<void> {
  return new Promise((resolve) => {
    port.close(() => resolve());
  });
}

export class WledSerialLightAdapter implements LightAdapter {
  private health = createHealth("unknown", "WLED serial has not been checked yet.");

  constructor(
    private readonly options: {
      serialPort: string;
      baudRate: number;
      idlePreset: number | null;
      defaultSelection: LightSelection;
    }
  ) {}

  async enterIdle(): Promise<void> {
    if (this.options.idlePreset !== null) {
      await this.writeWledJson({ on: true, ps: this.options.idlePreset });
      return;
    }

    await this.applySelection(this.options.defaultSelection);
  }

  async enterPhotoMode(_sessionLabel: string): Promise<void> {
    await this.writeWledJson({
      on: true,
      bri: 255,
      seg: [{ col: [[255, 255, 255]], fx: 0, sx: 128, ix: 128, pal: 0 }]
    });
  }

  async applySelection(selection: LightSelection): Promise<void> {
    await this.writeWledJson(buildWledSelectionPayload(selection));
  }

  async success(): Promise<void> {
    await this.writeWledJson({ on: true, bri: 255, seg: [{ col: [[0, 255, 120]], fx: 44 }] });
  }

  async error(): Promise<void> {
    await this.writeWledJson({ on: true, bri: 180, seg: [{ col: [[255, 40, 40]], fx: 2 }] });
  }

  async off(): Promise<void> {
    await this.writeWledJson({ on: false });
  }

  async diagnose(): Promise<HardwareComponentHealth> {
    try {
      await this.writeWledJson({ v: true });
      this.health = createHealth("online", "WLED serial port accepted a JSON command.");
    } catch (error) {
      this.health = createHealth(
        "error",
        error instanceof Error ? error.message : "WLED serial diagnostic failed."
      );
    }

    return this.health;
  }

  getHealth(): HardwareComponentHealth {
    return this.health;
  }

  private async writeWledJson(payload: Record<string, unknown>): Promise<void> {
    const port = new SerialPort({
      path: this.options.serialPort,
      baudRate: this.options.baudRate,
      autoOpen: false
    });
    await openSerialPort(port);
    try {
      await writeSerialPort(port, `${JSON.stringify(payload)}\n`);
      this.health = createHealth("online", "WLED serial command sent.");
    } finally {
      await closeSerialPort(port);
    }
  }
}

export class SimulatedLightAdapter implements LightAdapter {
  private health = createHealth("simulated", "Lights are running in simulator mode.");
  private selection: LightSelection;

  constructor(defaultSelection: LightSelection) {
    this.selection = defaultSelection;
  }

  enterIdle(): Promise<void> {
    return Promise.resolve();
  }

  enterPhotoMode(_sessionLabel: string): Promise<void> {
    return Promise.resolve();
  }

  applySelection(selection: LightSelection): Promise<void> {
    this.selection = selection;
    return Promise.resolve();
  }

  success(): Promise<void> {
    return Promise.resolve();
  }

  error(): Promise<void> {
    return Promise.resolve();
  }

  off(): Promise<void> {
    return Promise.resolve();
  }

  diagnose(): Promise<HardwareComponentHealth> {
    return Promise.resolve({
      ...this.health,
      message: `Simulated lights ready with "${this.selection.label}".`
    });
  }

  getHealth(): HardwareComponentHealth {
    return this.health;
  }
}
