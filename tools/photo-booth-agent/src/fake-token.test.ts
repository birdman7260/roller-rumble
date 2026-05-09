import { describe, expect, it } from "vitest";
import { createFakePhotoBoothSession, isFakeQrToken } from "./fake-token";

describe("fake photo booth QR tokens", () => {
  it("creates a fake session from shorthand manual input", () => {
    const session = createFakePhotoBoothSession("fake:Ada Fast", 1_000)!;

    expect(session.racerName).toBe("Ada Fast");
    expect(session.racerId).toBe("fake-ada-fast");
    expect(session.eventName).toBe("Fake Photo Booth Test");
  });

  it("creates a fake session from JSON scanner-style input", () => {
    const session = createFakePhotoBoothSession(
      JSON.stringify({
        type: "goldsprints.photo-booth.fake-token",
        racerName: "Grace Hopper"
      })
    )!;

    expect(session.racerName).toBe("Grace Hopper");
  });

  it("ignores normal signed-token-looking payloads", () => {
    expect(isFakeQrToken("not-a-fake-token")).toBe(false);
  });
});
