import { Button, Panel, StatPill } from "@roller-rumble/shared-ui";
import type { DiagnosticsResult, HardwareComponentHealth } from "../../types";

export function HardwareBadge({
  label,
  health
}: {
  label: string;
  health?: HardwareComponentHealth;
}) {
  return (
    <StatPill
      className={`hardware-badge hardware-badge--${health?.status ?? "unknown"}`}
      label={label}
      value={health?.status ?? "unknown"}
    />
  );
}

export function DiagnosticsPanel({
  diagnostics,
  hardware,
  onRun
}: {
  diagnostics: DiagnosticsResult | null;
  hardware: Record<string, HardwareComponentHealth>;
  onRun: () => void;
}) {
  const components = diagnostics ?? hardware;
  return (
    <Panel title="Diagnostics" className="diagnostics">
      <div className="diagnostics__header">
        <Button variant="ghost" onClick={onRun}>
          Run Checks
        </Button>
      </div>
      <div className="hardware-grid">
        {["scanner", "camera", "lights", "umbrella", "hallSensor"].map((key) => {
          const health = components[key as keyof typeof components] as
            | HardwareComponentHealth
            | undefined;
          return <HardwareBadge key={key} label={key} health={health} />;
        })}
      </div>
    </Panel>
  );
}
