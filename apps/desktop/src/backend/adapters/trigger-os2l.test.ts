import { describe, expect, it } from "vitest";
import { isOs2lStartCueMessage, parseOs2lCountdownDurationMs } from "./trigger-os2l";

describe("OS2L trigger parsing", () => {
  it("detects the simulator JSON start cue even when formatted with spaces", () => {
    expect(
      isOs2lStartCueMessage(
        JSON.stringify(
          {
            action: "start",
            countdownMs: 5_500,
            evt: "cue",
            id: "roller-rumble-start"
          },
          null,
          2
        )
      )
    ).toBe(true);
  });

  it("detects VirtualDJ-style button payloads by cue name", () => {
    expect(
      isOs2lStartCueMessage(
        JSON.stringify({
          evt: "btn",
          name: "roller-rumble-start countdownMs=2500",
          state: "on"
        })
      )
    ).toBe(true);
  });

  it("ignores VirtualDJ-style button release payloads", () => {
    expect(
      isOs2lStartCueMessage(
        JSON.stringify({
          evt: "btn",
          name: "roller-rumble-start countdownMs=2500",
          state: "off"
        })
      )
    ).toBe(false);
  });

  it("reads countdownMs from JSON cue payloads", () => {
    expect(
      parseOs2lCountdownDurationMs(
        JSON.stringify({
          action: "start",
          countdownMs: 5_500,
          evt: "cue",
          id: "roller-rumble-start"
        })
      )
    ).toBe(5_500);
  });

  it("reads countdownMs from plain VirtualDJ-style command text", () => {
    expect(parseOs2lCountdownDurationMs('os2l_button "roller-rumble-start countdownMs=2500"')).toBe(
      2_500
    );
  });

  it("reads countdownMs from JSON button payload names", () => {
    expect(
      parseOs2lCountdownDurationMs(
        JSON.stringify({
          evt: "btn",
          name: "roller-rumble-start countdownMs=4200",
          state: "on"
        })
      )
    ).toBe(4_200);
  });

  it("returns null when the cue does not include a countdown duration", () => {
    expect(parseOs2lCountdownDurationMs('os2l_button "roller-rumble-start"')).toBeNull();
  });
});
