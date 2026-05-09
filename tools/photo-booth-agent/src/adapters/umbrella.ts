import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { createHealth, nowIso, type HardwareComponentHealth, type UmbrellaState } from "../types";

export interface UmbrellaAdapter {
  home(): Promise<UmbrellaState>;
  spin(): Promise<UmbrellaState>;
  moveToPanel(panelIndex: number): Promise<UmbrellaState>;
  hold(): Promise<UmbrellaState>;
  park(): Promise<UmbrellaState>;
  stop(): Promise<UmbrellaState>;
  shutdown(): Promise<void>;
  diagnose(): Promise<{ umbrella: HardwareComponentHealth; hallSensor: HardwareComponentHealth }>;
  getState(): UmbrellaState;
  getHealth(): { umbrella: HardwareComponentHealth; hallSensor: HardwareComponentHealth };
}

interface HelperResponse {
  id?: string;
  ok?: boolean;
  state?: UmbrellaState;
  error?: string;
  hallActive?: boolean;
}

interface PendingCommand {
  resolve: (state: UmbrellaState) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class UmbrellaProcessAdapter implements UmbrellaAdapter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingCommand>();
  private state: UmbrellaState;
  private umbrellaHealth = createHealth("unknown", "Umbrella helper has not started yet.");
  private hallHealth = createHealth("unknown", "Hall sensor has not been checked yet.");
  private nextId = 1;

  constructor(
    private readonly options: {
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
    }
  ) {
    this.state = {
      mode: "parked",
      panelCount: options.panelCount,
      currentPanel: 0,
      message: "Umbrella helper has not started yet."
    };
  }

  async home(): Promise<UmbrellaState> {
    return this.sendCommand("home", {});
  }

  async spin(): Promise<UmbrellaState> {
    return this.sendCommand("spin", {});
  }

  async moveToPanel(panelIndex: number): Promise<UmbrellaState> {
    return this.sendCommand("moveToPanel", { panelIndex });
  }

  async hold(): Promise<UmbrellaState> {
    return this.sendCommand("hold", {});
  }

  async park(): Promise<UmbrellaState> {
    return this.sendCommand("moveToPanel", { panelIndex: 0 });
  }

  async stop(): Promise<UmbrellaState> {
    return this.sendCommand("stop", {});
  }

  async shutdown(): Promise<void> {
    if (!this.child) {
      return;
    }

    await this.sendCommand("shutdown", {}).catch(() => this.state);
    this.child.kill();
    this.child = null;
    this.umbrellaHealth = createHealth("offline", "Umbrella helper stopped.");
  }

  async diagnose(): Promise<{
    umbrella: HardwareComponentHealth;
    hallSensor: HardwareComponentHealth;
  }> {
    try {
      const state = await this.sendCommand("status", {});
      this.umbrellaHealth = createHealth("online", state.message ?? "Umbrella helper responded.");
      this.hallHealth = createHealth("online", "Hall sensor status is reported by the helper.");
    } catch (error) {
      this.umbrellaHealth = createHealth(
        "error",
        error instanceof Error ? error.message : "Umbrella helper diagnostic failed."
      );
      this.hallHealth = createHealth("error", "Hall sensor could not be checked.");
    }

    return this.getHealth();
  }

  getState(): UmbrellaState {
    return this.state;
  }

  getHealth(): { umbrella: HardwareComponentHealth; hallSensor: HardwareComponentHealth } {
    return {
      umbrella: this.umbrellaHealth,
      hallSensor: this.hallHealth
    };
  }

  private ensureStarted(): void {
    if (this.child) {
      return;
    }

    const args = [
      this.options.helperPath,
      "--config-json",
      JSON.stringify({
        stepPin: this.options.stepPin,
        directionPin: this.options.directionPin,
        enablePin: this.options.enablePin,
        hallPin: this.options.hallPin,
        panelCount: this.options.panelCount,
        stepsPerRevolution: this.options.stepsPerRevolution,
        microsteps: this.options.microsteps,
        homeDirection: this.options.homeDirection,
        spinRpm: this.options.spinRpm,
        moveRpm: this.options.moveRpm,
        homingTimeoutMs: this.options.homingTimeoutMs
      })
    ];
    const child = spawn(this.options.pythonCommand, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    this.umbrellaHealth = createHealth("online", "Umbrella helper process started.");

    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleHelperLine(line));
    child.stderr.on("data", (chunk: Buffer) => {
      this.umbrellaHealth = createHealth("error", chunk.toString("utf8").trim());
    });
    child.on("exit", () => {
      this.child = null;
      this.umbrellaHealth = createHealth("offline", "Umbrella helper process exited.");
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Umbrella helper exited before responding."));
      }
      this.pending.clear();
    });
  }

  private sendCommand(type: string, payload: Record<string, unknown>): Promise<UmbrellaState> {
    this.ensureStarted();
    const child = this.child;
    if (!child) {
      return Promise.reject(new Error("Umbrella helper is unavailable."));
    }

    const id = `cmd-${this.nextId++}`;
    const timeoutMs = type === "home" ? this.options.homingTimeoutMs + 2_000 : 12_000;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Umbrella command timed out: ${type}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      child.stdin.write(`${JSON.stringify({ id, type, ...payload, sentAt: nowIso() })}\n`);
    });
  }

  private handleHelperLine(line: string): void {
    let response: HelperResponse;
    try {
      response = JSON.parse(line) as HelperResponse;
    } catch {
      return;
    }

    if (response.state) {
      this.state = response.state;
    }
    if (typeof response.hallActive === "boolean") {
      this.hallHealth = createHealth(
        "online",
        response.hallActive ? "Hall sensor is active." : "Hall sensor is inactive."
      );
    }
    if (!response.id) {
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if (response.ok && response.state) {
      this.umbrellaHealth = createHealth("online", response.state.message ?? "Umbrella ready.");
      pending.resolve(response.state);
      return;
    }

    const message = response.error ?? "Umbrella helper command failed.";
    this.umbrellaHealth = createHealth("error", message);
    pending.reject(new Error(message));
  }
}

export class SimulatedUmbrellaAdapter implements UmbrellaAdapter {
  private state: UmbrellaState;
  private umbrellaHealth = createHealth("simulated", "Umbrella is running in simulator mode.");
  private hallHealth = createHealth("simulated", "Hall sensor is running in simulator mode.");

  constructor(panelCount: number) {
    this.state = {
      mode: "parked",
      panelCount,
      currentPanel: 0,
      message: "Simulated umbrella is parked."
    };
  }

  home(): Promise<UmbrellaState> {
    this.state = { ...this.state, mode: "parked", currentPanel: 0, message: "Simulated home." };
    return Promise.resolve(this.state);
  }

  spin(): Promise<UmbrellaState> {
    this.state = { ...this.state, mode: "spinning", message: "Simulated slow spin." };
    return Promise.resolve(this.state);
  }

  moveToPanel(panelIndex: number): Promise<UmbrellaState> {
    const currentPanel =
      ((Math.round(panelIndex) % this.state.panelCount) + this.state.panelCount) %
      this.state.panelCount;
    this.state = {
      ...this.state,
      mode: "holding",
      currentPanel,
      message: `Simulated hold on panel ${currentPanel + 1}.`
    };
    return Promise.resolve(this.state);
  }

  hold(): Promise<UmbrellaState> {
    this.state = { ...this.state, mode: "holding", message: "Simulated hold." };
    return Promise.resolve(this.state);
  }

  park(): Promise<UmbrellaState> {
    return this.moveToPanel(0);
  }

  stop(): Promise<UmbrellaState> {
    this.state = { ...this.state, mode: "parked", message: "Simulated stop." };
    return Promise.resolve(this.state);
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  diagnose(): Promise<{ umbrella: HardwareComponentHealth; hallSensor: HardwareComponentHealth }> {
    return Promise.resolve(this.getHealth());
  }

  getState(): UmbrellaState {
    return this.state;
  }

  getHealth(): { umbrella: HardwareComponentHealth; hallSensor: HardwareComponentHealth } {
    return {
      umbrella: this.umbrellaHealth,
      hallSensor: this.hallHealth
    };
  }
}
