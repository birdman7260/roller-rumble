import { describe, expect, it } from "vitest";
import { extractToken } from "./scanner";

describe("scanner payload parsing", () => {
  it("accepts raw token strings", () => {
    expect(extractToken(" token-123\r\n")).toBe("token-123");
  });

  it("extracts QR JSON token payloads", () => {
    expect(
      extractToken(JSON.stringify({ type: "goldsprints.photo-booth.token", token: "abc" }))
    ).toBe("abc");
  });

  it("keeps invalid JSON as a raw token", () => {
    expect(extractToken("{not-json")).toBe("{not-json");
  });
});
