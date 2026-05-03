import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { TunnelState } from "../../shared/types";

const urlPattern = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i;

export class CloudflaredTunnelManager {
  private process: ChildProcessWithoutNullStreams | null = null;
  private state: TunnelState = {
    status: "idle",
    publicUrl: null,
    message: null
  };

  getState(): TunnelState {
    return this.state;
  }

  start(port: number, onStateChange?: (state: TunnelState) => void): TunnelState {
    if (this.process) {
      return this.state;
    }

    this.state = {
      status: "starting",
      publicUrl: null,
      message: "Launching cloudflared tunnel..."
    };
    onStateChange?.(this.state);

    this.process = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${String(port)}`], {
      stdio: "pipe"
    });

    this.process.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const match = urlPattern.exec(text);
      const publicUrl = match?.[1];
      if (publicUrl) {
        this.state = {
          status: "active",
          publicUrl,
          message: "Tunnel is active"
        };
        onStateChange?.(this.state);
      }
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (!text) {
        return;
      }

      if (text.toLowerCase().includes("error")) {
        this.state = {
          status: "error",
          publicUrl: null,
          message: text
        };
        onStateChange?.(this.state);
      }
    });

    this.process.on("error", (error) => {
      this.state = {
        status: "error",
        publicUrl: null,
        message: error.message
      };
      onStateChange?.(this.state);
    });

    this.process.on("exit", () => {
      this.process = null;
      if (this.state.status !== "error") {
        this.state = {
          status: "idle",
          publicUrl: null,
          message: null
        };
        onStateChange?.(this.state);
      }
    });

    return this.state;
  }

  stop(onStateChange?: (state: TunnelState) => void): TunnelState {
    this.process?.kill();
    this.process = null;
    this.state = {
      status: "idle",
      publicUrl: null,
      message: null
    };
    onStateChange?.(this.state);
    return this.state;
  }
}
