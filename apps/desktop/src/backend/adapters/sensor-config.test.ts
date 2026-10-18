import { describe, expect, it } from "vitest";
import {
  BOX_COUNTDOWN_MS,
  OPENSPRINTS_ROLLER_ROLLOUT_METERS
} from "@roller-rumble/shared/constants";
import {
  readSensorBoxCountdownMs,
  readSensorLaneAssignments,
  readSensorMode,
  readSensorMaxSpeedKph,
  readSensorPortOverride,
  readSensorPortRollouts,
  readSensorProtocol,
  readSensorRawLogging,
  readSensorRolloutMeters
} from "./sensor-config";

describe("sensor-config", () => {
  it("defaults to the simulator unless opensprints is selected", () => {
    expect(readSensorMode({})).toBe("simulator");
    expect(readSensorMode({ ROLLER_RUMBLE_SENSOR_MODE: "anything" })).toBe("simulator");
    expect(readSensorMode({ ROLLER_RUMBLE_SENSOR_MODE: "opensprints" })).toBe("opensprints");
  });

  it("defaults the protocol to auto and only accepts known variants", () => {
    expect(readSensorProtocol({})).toBe("auto");
    expect(readSensorProtocol({ ROLLER_RUMBLE_SENSOR_PROTOCOL: "nonsense" })).toBe("auto");
    expect(readSensorProtocol({ ROLLER_RUMBLE_SENSOR_PROTOCOL: "advanced" })).toBe("advanced");
    expect(readSensorProtocol({ ROLLER_RUMBLE_SENSOR_PROTOCOL: "ss-basic" })).toBe("ss-basic");
  });

  it("reads a trimmed port override, or null when blank", () => {
    expect(readSensorPortOverride({})).toBeNull();
    expect(readSensorPortOverride({ ROLLER_RUMBLE_SENSOR_PORT: "  " })).toBeNull();
    expect(readSensorPortOverride({ ROLLER_RUMBLE_SENSOR_PORT: " COM3 " })).toBe("COM3");
  });

  it("parses a lane map, treating unused/blank slots as null", () => {
    expect(readSensorLaneAssignments({ ROLLER_RUMBLE_SENSOR_LANE_MAP: "right, left" })).toEqual([
      "right",
      "left"
    ]);
    expect(
      readSensorLaneAssignments({ ROLLER_RUMBLE_SENSOR_LANE_MAP: "left,unused,right" })
    ).toEqual(["left", null, "right"]);
  });

  it("rejects a malformed lane map rather than guessing", () => {
    expect(readSensorLaneAssignments({})).toBeNull();
    expect(readSensorLaneAssignments({ ROLLER_RUMBLE_SENSOR_LANE_MAP: "left,banana" })).toBeNull();
  });

  it("falls back to the confirmed roller rollout for blank or non-positive values", () => {
    expect(readSensorRolloutMeters({})).toBe(OPENSPRINTS_ROLLER_ROLLOUT_METERS);
    expect(readSensorRolloutMeters({ ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS: "0" })).toBe(
      OPENSPRINTS_ROLLER_ROLLOUT_METERS
    );
    expect(readSensorRolloutMeters({ ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS: "-1" })).toBe(
      OPENSPRINTS_ROLLER_ROLLOUT_METERS
    );
    expect(readSensorRolloutMeters({ ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS: "0.36" })).toBe(0.36);
  });

  it("falls back to the default box countdown for blank or invalid values", () => {
    expect(readSensorBoxCountdownMs({})).toBe(BOX_COUNTDOWN_MS);
    expect(readSensorBoxCountdownMs({ ROLLER_RUMBLE_SENSOR_BOX_COUNTDOWN_MS: "nope" })).toBe(
      BOX_COUNTDOWN_MS
    );
    expect(readSensorBoxCountdownMs({ ROLLER_RUMBLE_SENSOR_BOX_COUNTDOWN_MS: "-1" })).toBe(
      BOX_COUNTDOWN_MS
    );
    // Zero is valid (a box with no silent gap); a fractional value rounds to whole ms.
    expect(readSensorBoxCountdownMs({ ROLLER_RUMBLE_SENSOR_BOX_COUNTDOWN_MS: "0" })).toBe(0);
    expect(readSensorBoxCountdownMs({ ROLLER_RUMBLE_SENSOR_BOX_COUNTDOWN_MS: "3500.4" })).toBe(
      3500
    );
  });

  it("resolves a per-port rollout, falling back to the shared rollout for blank slots", () => {
    expect(readSensorPortRollouts({}, 4)).toEqual(Array(4).fill(OPENSPRINTS_ROLLER_ROLLOUT_METERS));
    expect(
      readSensorPortRollouts(
        {
          ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS: "0.4",
          ROLLER_RUMBLE_SENSOR_PORT_ROLLOUT_METERS: " , 0.18"
        },
        3
      )
    ).toEqual([0.4, 0.18, 0.4]);
  });

  it("ignores the whole per-port list when any slot is not a positive number", () => {
    expect(
      readSensorPortRollouts(
        {
          ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS: "0.4",
          ROLLER_RUMBLE_SENSOR_PORT_ROLLOUT_METERS: "0.3,banana"
        },
        2
      )
    ).toEqual([0.4, 0.4]);
    expect(
      readSensorPortRollouts({ ROLLER_RUMBLE_SENSOR_PORT_ROLLOUT_METERS: "0.3,0" }, 2)
    ).toEqual([OPENSPRINTS_ROLLER_ROLLOUT_METERS, OPENSPRINTS_ROLLER_ROLLOUT_METERS]);
  });

  it("reads the plausible-speed ceiling, or null (no ceiling) when blank or invalid", () => {
    expect(readSensorMaxSpeedKph({})).toBeNull();
    expect(readSensorMaxSpeedKph({ ROLLER_RUMBLE_SENSOR_MAX_SPEED_KPH: "0" })).toBeNull();
    expect(readSensorMaxSpeedKph({ ROLLER_RUMBLE_SENSOR_MAX_SPEED_KPH: "nope" })).toBeNull();
    expect(readSensorMaxSpeedKph({ ROLLER_RUMBLE_SENSOR_MAX_SPEED_KPH: "80" })).toBe(80);
  });

  it("turns raw sensor logging on only when asked", () => {
    expect(readSensorRawLogging({})).toBe(false);
    expect(readSensorRawLogging({ ROLLER_RUMBLE_SENSOR_RAW_LOGGING: "off" })).toBe(false);
    expect(readSensorRawLogging({ ROLLER_RUMBLE_SENSOR_RAW_LOGGING: "on" })).toBe(true);
  });
});
