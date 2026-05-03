import type { CountdownTriggerListener, RaceTriggerAdapter } from "./trigger";

export class ManualRaceTriggerAdapter implements RaceTriggerAdapter {
  readonly id = "manual";
  readonly label = "Manual trigger";

  private listener: CountdownTriggerListener | null = null;

  start(listener: CountdownTriggerListener): void {
    this.listener = listener;
  }

  stop(): void {
    this.listener = null;
  }

  armRace(_raceId: string): void {
    return;
  }

  disarmRace(): void {
    return;
  }

  setEnabled(_enabled: boolean): void {
    return;
  }

  trigger(): void {
    this.listener?.("manual");
  }
}
