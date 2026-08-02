import { describe, expect, it } from "vitest";
import { describeBike, describeLaneSwap } from "./lane-swap";

describe("describeLaneSwap", () => {
  it("calls a two-rider swap an exchange", () => {
    expect(
      describeLaneSwap([
        { lane: "left", racerId: "ava" },
        { lane: "right", racerId: "bo" }
      ])
    ).toBe("Swap Bikes");
  });

  it("names the destination bike for a lone rider", () => {
    expect(describeLaneSwap([{ lane: "left", racerId: "ava" }])).toBe("Move To Right Bike");
    expect(describeLaneSwap([{ lane: "right", racerId: "ava" }])).toBe("Move To Left Bike");
  });
});

describe("describeBike", () => {
  it("names each roller the way the operator sees it", () => {
    expect(describeBike("left")).toBe("Left bike");
    expect(describeBike("right")).toBe("Right bike");
  });

  it("puts a legacy solo lane on the left bike, matching the sensor default", () => {
    expect(describeBike("solo")).toBe("Left bike");
  });
});
