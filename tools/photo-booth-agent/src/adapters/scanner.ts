import { ReadlineParser, SerialPort } from "serialport";
import { createHealth, type HardwareComponentHealth } from "../types";

export type ScanHandler = (payload: string) => void;

export interface ScannerAdapter {
  start(onScan: ScanHandler): Promise<void>;
  stop(): Promise<void>;
  diagnose(): Promise<HardwareComponentHealth>;
  getHealth(): HardwareComponentHealth;
}

export function extractToken(scanPayload: string): string {
  const trimmed = scanPayload.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "object" && parsed !== null && "token" in parsed) {
      const token = (parsed as { token?: unknown }).token;
      if (typeof token === "string") {
        return token;
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function openSerialPort(port: SerialPort): Promise<void> {
  return new Promise((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()));
  });
}

function closeSerialPort(port: SerialPort): Promise<void> {
  return new Promise((resolve) => {
    port.close(() => resolve());
  });
}

export class SerialScannerAdapter implements ScannerAdapter {
  private health = createHealth("unknown", "Scanner has not been opened yet.");
  private port: SerialPort | null = null;

  constructor(
    private readonly options: {
      serialPort: string;
      baudRate: number;
    }
  ) {}

  async start(onScan: ScanHandler): Promise<void> {
    if (this.port?.isOpen) {
      return;
    }

    const port = new SerialPort({
      path: this.options.serialPort,
      baudRate: this.options.baudRate,
      autoOpen: false
    });
    const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
    parser.on("data", (line: string) => {
      const token = extractToken(line);
      if (token) {
        onScan(token);
      }
    });
    port.on("error", (error) => {
      this.health = createHealth("error", error.message);
    });

    await openSerialPort(port);
    this.port = port;
    this.health = createHealth("online", "Scanner serial port is open.");
  }

  async stop(): Promise<void> {
    if (!this.port) {
      return;
    }

    await closeSerialPort(this.port);
    this.port = null;
    this.health = createHealth("offline", "Scanner serial port closed.");
  }

  async diagnose(): Promise<HardwareComponentHealth> {
    if (this.port?.isOpen) {
      this.health = createHealth("online", "Scanner serial port is open.");
    } else {
      this.health = createHealth("offline", "Scanner serial port is not open.");
    }

    return this.health;
  }

  getHealth(): HardwareComponentHealth {
    return this.health;
  }
}

export class ManualScannerAdapter implements ScannerAdapter {
  private health = createHealth("online", "Scanner input is manual HTTP input.");

  start(_onScan: ScanHandler): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  diagnose(): Promise<HardwareComponentHealth> {
    return Promise.resolve(this.health);
  }

  getHealth(): HardwareComponentHealth {
    return this.health;
  }
}

export class SimulatedScannerAdapter implements ScannerAdapter {
  private health = createHealth("simulated", "Scanner is running in simulator mode.");

  start(_onScan: ScanHandler): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  diagnose(): Promise<HardwareComponentHealth> {
    return Promise.resolve(this.health);
  }

  getHealth(): HardwareComponentHealth {
    return this.health;
  }
}
