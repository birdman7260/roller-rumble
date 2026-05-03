import net from "node:net";
import { DEFAULT_OS2L_PORT } from "../../shared/constants";
import type { CountdownTriggerListener, RaceTriggerAdapter } from "./trigger";

function shouldTrigger(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("goldsprints-start") ||
    normalized.includes("race-start") ||
    normalized.includes('"evt":"play"') ||
    normalized.includes('"evt":"cue"') ||
    normalized.includes('"action":"start"')
  );
}

export class Os2lRaceTriggerAdapter implements RaceTriggerAdapter {
  readonly id = "os2l";
  readonly label = "VirtualDJ OS2L";

  private server: net.Server | null = null;
  private listener: CountdownTriggerListener | null = null;
  private enabled = false;
  private armedRaceId: string | null = null;

  constructor(private readonly port = DEFAULT_OS2L_PORT) {}

  start(listener: CountdownTriggerListener): void {
    this.listener = listener;
    this.server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        if (!this.enabled || !this.armedRaceId) {
          return;
        }

        const message = chunk.toString();
        if (shouldTrigger(message)) {
          this.listener?.("os2l");
        }
      });
    });

    this.server.listen(this.port, "127.0.0.1");
  }

  stop(): void {
    this.disarmRace();
    this.listener = null;
    this.server?.close();
    this.server = null;
  }

  armRace(raceId: string): void {
    this.armedRaceId = raceId;
  }

  disarmRace(): void {
    this.armedRaceId = null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
