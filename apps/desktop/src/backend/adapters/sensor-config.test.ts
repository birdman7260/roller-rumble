import { describe, expect, it } from "vitest";
import { OPENSPRINTS_ROLLER_ROLLOUT_METERS } from "@roller-rumble/shared/constants";
import {
  readSensorLaneAssignments,
  readSensorMode,
  readSensorPortOverride,
  readSensorProtocol,
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
});
