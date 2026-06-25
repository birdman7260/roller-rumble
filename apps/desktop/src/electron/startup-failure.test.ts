import { describe, expect, it, vi } from "vitest";
import {
  describeStartupError,
  handleStartupFailure,
  type StartupFailureMessageBoxOptions
} from "./startup-failure";

describe("describeStartupError", () => {
  it("returns the message of an Error", () => {
    expect(describeStartupError(new Error("disk on fire"))).toBe("disk on fire");
  });

  it("stringifies non-Error values for diagnostic reporting", () => {
    expect(describeStartupError("plain string failure")).toBe("plain string failure");
    expect(describeStartupError(42)).toBe("42");
  });
});

describe("handleStartupFailure", () => {
  function makeDeps(response: number) {
    return {
      error: new Error("migration 0009 failed"),
      dataDir: "/tmp/roller-rumble/runtime",
      showMessageBox: vi
        .fn<(options: StartupFailureMessageBoxOptions) => Promise<{ response: number }>>()
        .mockResolvedValue({ response }),
      removeDataDir: vi.fn(),
      relaunchApp: vi.fn(),
      quitApp: vi.fn()
    };
  }

  it("shows a dialog with a plain-English message and the raw error detail", async () => {
    const deps = makeDeps(1);

    await handleStartupFailure(deps);

    expect(deps.showMessageBox).toHaveBeenCalledTimes(1);
    const options = deps.showMessageBox.mock.calls[0][0];
    expect(options.message).toMatch(/database could not be opened/i);
    expect(options.detail).toBe("migration 0009 failed");
    expect(options.buttons).toEqual(["Delete all data and restart", "Quit"]);
  });

  it("deletes the runtime data folder and relaunches when the user chooses delete-and-restart", async () => {
    const deps = makeDeps(0);

    await handleStartupFailure(deps);

    expect(deps.removeDataDir).toHaveBeenCalledWith("/tmp/roller-rumble/runtime");
    expect(deps.relaunchApp).toHaveBeenCalledTimes(1);
    expect(deps.quitApp).not.toHaveBeenCalled();
  });

  it("quits without touching data when the user chooses quit", async () => {
    const deps = makeDeps(1);

    await handleStartupFailure(deps);

    expect(deps.quitApp).toHaveBeenCalledTimes(1);
    expect(deps.removeDataDir).not.toHaveBeenCalled();
    expect(deps.relaunchApp).not.toHaveBeenCalled();
  });
});
