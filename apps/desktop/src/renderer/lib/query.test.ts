import { describe, expect, it } from "vitest";
import { hasNotificationRevisionChanged } from "./query";

describe("snapshot notification revision", () => {
  it("does not treat unrelated snapshot changes as notification changes", () => {
    expect(
      hasNotificationRevisionChanged(
        { notificationRevision: "2:2026-06-18T00:00:00.000Z:" },
        { notificationRevision: "2:2026-06-18T00:00:00.000Z:" }
      )
    ).toBe(false);
  });

  it("detects notification inbox changes", () => {
    expect(
      hasNotificationRevisionChanged(
        { notificationRevision: "2:2026-06-18T00:00:00.000Z:" },
        { notificationRevision: "3:2026-06-18T00:01:00.000Z:" }
      )
    ).toBe(true);
  });
});
