import type { AppSnapshot } from "@roller-rumble/shared/types";
import { LiveLogPanel } from "./live-log-panel";
import { SensorTuningPanel } from "./sensor-tuning";

/**
 * Everything for dialing in the bike sensors at the hardware: the live race-box monitor and every
 * measurement setting beside the app log, so a spin of a roller can be watched in both at once.
 */
export function SensorTab({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <div className="page-grid sensor-page-grid">
      <SensorTuningPanel snapshot={snapshot} />
      <LiveLogPanel />
    </div>
  );
}
