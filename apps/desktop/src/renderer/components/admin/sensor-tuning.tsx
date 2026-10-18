import { useState } from "react";
import type { AppSnapshot, SensorMonitor, SensorMonitorPort } from "@roller-rumble/shared/types";
import { MANAGED_SETTINGS } from "@roller-rumble/shared/managed-settings";
import { Button, Panel, StatPill } from "@roller-rumble/shared-ui";
import { startSensorTest, stopSensorTest } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import { ManagedSettingFields } from "./operator-settings";

const SENSOR_SETTINGS = MANAGED_SETTINGS.filter((setting) => setting.subsystem === "sensor");

const MODE_LABELS: Record<SensorMonitor["mode"], string> = {
  idle: "Idle",
  testing: "Sensor test",
  racing: "Race"
};

function msLabel(value: number | null): string {
  return value == null ? "—" : `${value} ms`;
}

function goOffsetLabel(value: number | null): string {
  if (value == null) {
    return "—";
  }
  if (value === 0) {
    return "On GO";
  }
  return value > 0 ? `${value} ms late` : `${-value} ms early`;
}

/** The timing and stream-health readout above the per-port table. */
function SensorMonitorStats({ monitor }: { monitor: SensorMonitor }) {
  return (
    <div className="stat-grid">
      <StatPill label="Box" value={MODE_LABELS[monitor.mode]} />
      <StatPill label="Stream" value={monitor.streaming ? "Receiving" : "Silent"} />
      <StatPill label="Firmware" value={monitor.variant ?? "—"} />
      <StatPill label="Samples" value={monitor.sampleCount} />
      <StatPill label="Sample interval" value={msLabel(monitor.lastSampleIntervalMs)} />
      <StatPill label="Box countdown (measured)" value={msLabel(monitor.measuredBoxCountdownMs)} />
      <StatPill label="Box countdown (setting)" value={msLabel(monitor.configuredBoxCountdownMs)} />
      <StatPill label="Box start vs GO (last race)" value={goOffsetLabel(monitor.lastGoOffsetMs)} />
    </div>
  );
}

function SensorPortRow({ port, ceiling }: { port: SensorMonitorPort; ceiling: number | null }) {
  return (
    <tr className={port.lane ? undefined : "sensor-monitor__row--unused"}>
      <th scope="row">{port.index}</th>
      <td>{port.lane ?? "unused"}</td>
      <td>{port.ticks}</td>
      <td>{port.lastSampleTicks}</td>
      <td>{port.metersPerTick}</td>
      <td>{port.distanceMeters} m</td>
      <td>{port.speedKph} km/h</td>
      <td>{port.peakSampleSpeedKph} km/h</td>
      <td>{ceiling == null ? "no ceiling" : port.samplesOverCeiling}</td>
    </tr>
  );
}

function SensorPortTable({ monitor }: { monitor: SensorMonitor }) {
  return (
    <div className="sensor-monitor__table-wrap">
      <table className="sensor-monitor__table">
        <thead>
          <tr>
            <th scope="col">Port</th>
            <th scope="col">Lane</th>
            <th scope="col">Ticks</th>
            <th scope="col">Last sample</th>
            <th scope="col">m / tick</th>
            <th scope="col">Distance</th>
            <th scope="col">Speed ({monitor.speedWindowMs} ms avg)</th>
            <th scope="col">Fastest sample</th>
            <th scope="col">Over ceiling</th>
          </tr>
        </thead>
        <tbody>
          {monitor.ports.map((port) => (
            <SensorPortRow key={port.index} port={port} ceiling={monitor.maxSpeedKph} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Start/stop the out-of-race sensor test, surfacing why the backend refused one. */
function SensorTestControls({ monitor }: { monitor: SensorMonitor }) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const testing = monitor.mode === "testing";

  async function toggle(): Promise<void> {
    setWorking(true);
    setError(null);
    try {
      await (testing ? stopSensorTest() : startSensorTest());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the sensor test.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="panel-action-row">
      <Button
        variant={testing ? "ghost" : undefined}
        disabled={working || !monitor.canTest || monitor.mode === "racing"}
        onClick={() => fireAndForget(toggle(), "toggle sensor test")}
      >
        {testing ? "Stop sensor test" : "Start sensor test"}
      </Button>
      {error ? <span className="form-error">{error}</span> : null}
    </div>
  );
}

function SensorMonitorView({ monitor }: { monitor: SensorMonitor }) {
  return (
    <div className="stack-sm">
      <SensorTestControls monitor={monitor} />
      <p className="managed-field__description">
        Start the sensor test, then spin one roller at a time: its ticks should climb on its own row
        and nowhere else. Turn a roller exactly 10 times by hand to check you get 10 ticks. See
        docs/sensor-calibration.md for the full walkthrough.
      </p>
      <SensorMonitorStats monitor={monitor} />
      <SensorPortTable monitor={monitor} />
      <details>
        <summary>Raw lines from the box ({monitor.recentLines.length})</summary>
        <pre className="sensor-monitor__raw">
          {monitor.recentLines.length ? monitor.recentLines.join("\n") : "Nothing received yet."}
        </pre>
      </details>
    </div>
  );
}

/**
 * Everything that decides how riders are measured, in one place: the live readout of what the race
 * box is actually sending (with an out-of-race sensor test) beside every sensor and measurement
 * setting, so the hardware can be dialed in by watching the numbers change.
 */
export function SensorTuningPanel({ snapshot }: { snapshot: AppSnapshot }) {
  const monitor = snapshot.sensorMonitor;
  return (
    <Panel className="settings-panel" title="Bike sensor & measurement" collapsible>
      <div className="stack-md">
        {monitor ? (
          <SensorMonitorView monitor={monitor} />
        ) : (
          <p>
            The built-in simulator is in use, so there is no race box to monitor. Set Bike sensor to
            OpenSprints below, then fully quit and reopen Roller Rumble.
          </p>
        )}
        <section className="managed-group">
          <h4 className="managed-group__title">Settings</h4>
          <ManagedSettingFields snapshot={snapshot} definitions={SENSOR_SETTINGS} />
        </section>
      </div>
    </Panel>
  );
}
