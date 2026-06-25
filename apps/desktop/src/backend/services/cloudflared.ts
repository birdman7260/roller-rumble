import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { TunnelDiagnostics, TunnelState } from "@roller-rumble/shared/types";
import {
  buildCloudflaredStartCommand,
  createCloudflaredConfig,
  installCloudflared,
  normalizePublicRacerUrl,
  resolveCloudflared,
  type CloudflaredConfig
} from "./cloudflared-tools";

const tryCloudflareUrlPattern = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i;

interface CloudflaredTunnelManagerOptions {
  dataDir: string;
}

function isOriginRequestFailure(text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes("request failed") && lowerText.includes("unable to reach the origin service")
  );
}

function originRequestFailureMessage(): string {
  return [
    "cloudflared is running, but at least one public request could not reach the app origin.",
    "Verify the Cloudflare Public Hostname has an empty Path and service http://127.0.0.1:3187 so /racer, /assets, /api, /uploads, and /ws all route to Roller Rumble."
  ].join(" ");
}

export class CloudflaredTunnelManager {
  private config: CloudflaredConfig;
  private readonly dataDir: string;
  private process: ChildProcessWithoutNullStreams | null = null;
  private activationTimer: NodeJS.Timeout | null = null;
  private requestFailure: string | null = null;
  private stopRequested = false;
  private state: TunnelState;

  constructor(options: CloudflaredTunnelManagerOptions) {
    this.dataDir = options.dataDir;
    this.config = createCloudflaredConfig({ dataDir: options.dataDir });
    const diagnostics = resolveCloudflared(this.config);
    this.state = this.stateFromDiagnostics("idle", diagnostics);
  }

  /**
   * Re-read tunnel config from the (now-updated) environment. The tunnel is the one subsystem
   * that caches its config at construction, so a managed-setting change to a tunnel key only
   * takes effect after this — and, if the tunnel is running, after a restart. We never restart
   * here: a live event's racer connections ride the tunnel, so the restart is user-confirmed.
   */
  reloadConfig(): void {
    this.config = createCloudflaredConfig({ dataDir: this.dataDir });
    if (!this.process) {
      this.state = this.stateFromDiagnostics("idle", resolveCloudflared(this.config));
    }
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  getState(): TunnelState {
    return this.state;
  }

  getDiagnostics(): TunnelDiagnostics {
    const diagnostics = resolveCloudflared(this.config);
    if (!this.process) {
      this.state = this.stateFromDiagnostics("idle", diagnostics);
    }
    return diagnostics;
  }

  async installCloudflared(): Promise<TunnelDiagnostics> {
    try {
      const diagnostics = await installCloudflared(this.config);
      if (!this.process) {
        this.state = this.stateFromDiagnostics("idle", diagnostics);
      }
      return diagnostics;
    } catch (error) {
      const diagnostics = resolveCloudflared(this.config);
      const message = error instanceof Error ? error.message : "Unable to install cloudflared.";
      this.state = this.stateFromDiagnostics("error", diagnostics, message);
      throw error;
    }
  }

  start(port: number, onStateChange?: (state: TunnelState) => void): TunnelState {
    if (this.process) {
      return this.state;
    }

    const diagnostics = resolveCloudflared(this.config);
    if (!diagnostics.binaryPath) {
      this.state = this.stateFromDiagnostics("error", diagnostics, diagnostics.message);
      onStateChange?.(this.state);
      return this.state;
    }

    let command;
    try {
      command = buildCloudflaredStartCommand(this.config, diagnostics.binaryPath, port);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start tunnel.";
      this.state = this.stateFromDiagnostics("error", diagnostics, message);
      onStateChange?.(this.state);
      return this.state;
    }

    this.stopRequested = false;
    this.requestFailure = null;
    this.state = this.stateFromDiagnostics(
      "starting",
      diagnostics,
      "Launching cloudflared tunnel..."
    );
    onStateChange?.(this.state);

    this.process = spawn(command.command, command.args, {
      stdio: "pipe"
    });

    if (command.publicUrl) {
      // Named tunnels do not print a new URL like quick tunnels do; the configured URL is stable.
      this.activationTimer = setTimeout(() => {
        if (!this.process || this.state.status !== "starting") {
          return;
        }
        this.state = this.stateFromDiagnostics(
          "active",
          diagnostics,
          this.requestFailure ? originRequestFailureMessage() : "Tunnel is active"
        );
        onStateChange?.(this.state);
      }, 1500);
    }

    this.process.stdout.on("data", (chunk: Buffer) => {
      this.handleOutput(chunk, diagnostics, onStateChange);
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      this.handleOutput(chunk, diagnostics, onStateChange);
    });

    this.process.on("error", (error) => {
      this.clearActivationTimer();
      this.state = this.stateFromDiagnostics("error", diagnostics, error.message);
      onStateChange?.(this.state);
    });

    this.process.on("exit", (code) => {
      this.clearActivationTimer();
      this.process = null;
      if (this.stopRequested) {
        this.state = this.stateFromDiagnostics("idle", diagnostics);
        onStateChange?.(this.state);
        return;
      }

      this.state = this.stateFromDiagnostics(
        "error",
        diagnostics,
        `cloudflared exited unexpectedly${code === null ? "" : ` with code ${String(code)}`}`
      );
      onStateChange?.(this.state);
    });

    return this.state;
  }

  stop(onStateChange?: (state: TunnelState) => void): TunnelState {
    this.stopRequested = true;
    this.requestFailure = null;
    this.clearActivationTimer();
    this.process?.kill();
    this.process = null;
    const diagnostics = resolveCloudflared(this.config);
    this.state = this.stateFromDiagnostics("idle", diagnostics);
    onStateChange?.(this.state);
    return this.state;
  }

  private handleOutput(
    chunk: Buffer,
    diagnostics: TunnelDiagnostics,
    onStateChange?: (state: TunnelState) => void
  ): void {
    const text = chunk.toString("utf8").trim();
    if (!text) {
      return;
    }

    const quickMatch = tryCloudflareUrlPattern.exec(text);
    const quickPublicUrl = normalizePublicRacerUrl(quickMatch?.[1]);
    if (quickPublicUrl) {
      this.clearActivationTimer();
      this.state = {
        ...this.stateFromDiagnostics("active", diagnostics, "Tunnel is active"),
        publicUrl: quickPublicUrl
      };
      onStateChange?.(this.state);
      return;
    }

    if (text.toLowerCase().includes("error")) {
      if (isOriginRequestFailure(text)) {
        this.requestFailure = originRequestFailureMessage();
        // Named tunnels can continue running while individual browser requests fail. Keep the
        // process state intact and surface the route hint instead of making "Start Tunnel" look dead.
        this.state = {
          ...this.state,
          message: originRequestFailureMessage(),
          lastError: this.requestFailure
        };
        onStateChange?.(this.state);
        return;
      }

      this.clearActivationTimer();
      this.state = this.stateFromDiagnostics("error", diagnostics, text);
      onStateChange?.(this.state);
    }
  }

  private clearActivationTimer(): void {
    if (this.activationTimer) {
      clearTimeout(this.activationTimer);
      this.activationTimer = null;
    }
  }

  private stateFromDiagnostics(
    status: TunnelState["status"],
    diagnostics: TunnelDiagnostics,
    message: string | null = null
  ): TunnelState {
    return {
      status,
      mode: diagnostics.mode,
      publicUrl: diagnostics.mode === "token" ? diagnostics.publicUrl : null,
      tunnelName: diagnostics.tunnelName,
      binarySource: diagnostics.binarySource,
      cloudflaredVersion: diagnostics.cloudflaredVersion,
      message,
      lastError:
        status === "error"
          ? (message ?? diagnostics.lastError)
          : (this.requestFailure ?? diagnostics.lastError)
    };
  }
}
