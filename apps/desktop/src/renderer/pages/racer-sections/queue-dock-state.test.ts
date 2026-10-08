import { describe, expect, it } from "vitest";
import { getQueueDockState } from "./queue-dock-state";

const signedInOpenQueue = {
  signedIn: true,
  tournamentMode: false,
  bracketExpanded: false,
  queueOpen: true
};

describe("getQueueDockState", () => {
  it("offers the queue actions to a signed-in racer while the queue is open", () => {
    expect(getQueueDockState(signedInOpenQueue)).toBe("open");
  });

  it("shows the closed queue in place of the actions while the operator has closed it", () => {
    expect(getQueueDockState({ ...signedInOpenQueue, queueOpen: false })).toBe("closed");
  });

  it("stays out of the way of a visitor who hasn't registered", () => {
    expect(getQueueDockState({ ...signedInOpenQueue, signedIn: false })).toBe("hidden");
    expect(getQueueDockState({ ...signedInOpenQueue, signedIn: false, queueOpen: false })).toBe(
      "hidden"
    );
  });

  it("disappears while a tournament pauses the open queue", () => {
    expect(getQueueDockState({ ...signedInOpenQueue, tournamentMode: true })).toBe("hidden");
  });

  it("disappears while the racer has the bracket expanded full screen", () => {
    expect(getQueueDockState({ ...signedInOpenQueue, bracketExpanded: true })).toBe("hidden");
  });
});
