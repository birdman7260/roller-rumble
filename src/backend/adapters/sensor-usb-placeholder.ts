import type { RaceParticipant } from "../../shared/types";
import type { RotationListener, SensorAdapter } from "./sensor";

export class UsbSensorPlaceholderAdapter implements SensorAdapter {
  readonly id = "usb-placeholder";
  readonly label = "USB device adapter slot";
  private listener: RotationListener | null = null;

  connect(listener: RotationListener): void {
    this.listener = listener;
  }

  disconnect(): void {
    this.listener = null;
  }

  beginRace(_participants: RaceParticipant[]): void {
    // Placeholder for the eventual real USB implementation.
  }

  endRace(): void {
    // Placeholder for the eventual real USB implementation.
  }
}
