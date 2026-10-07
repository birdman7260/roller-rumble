import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWebSocketUrlFromApiBase,
  forgetRacerSessionToken,
  registerRacer,
  rememberRacerSessionToken,
  resolveApiBase
} from "./api";

describe("api routing", () => {
  it("uses the dev API override for local Vite pages", () => {
    expect(
      resolveApiBase(
        {
          hostname: "127.0.0.1",
          origin: "http://127.0.0.1:5173",
          port: "5173"
        },
        "http://127.0.0.1:3187"
      )
    ).toBe("http://127.0.0.1:3187");
  });

  it("uses the public origin instead of localhost overrides for tunnel visitors", () => {
    expect(
      resolveApiBase(
        {
          hostname: "roller-rumble.birdsnest.family",
          origin: "https://roller-rumble.birdsnest.family",
          port: ""
        },
        "http://127.0.0.1:3187"
      )
    ).toBe("https://roller-rumble.birdsnest.family");
  });

  it("creates secure websocket URLs for public HTTPS origins", () => {
    expect(createWebSocketUrlFromApiBase("https://roller-rumble.birdsnest.family")).toBe(
      "wss://roller-rumble.birdsnest.family/ws"
    );
  });

  it("identifies racer websocket streams for server-side throttling", () => {
    expect(createWebSocketUrlFromApiBase("https://roller-rumble.birdsnest.family", "racer")).toBe(
      "wss://roller-rumble.birdsnest.family/ws?surface=racer"
    );
  });

  it("stores and clears the durable racer session fallback token", () => {
    rememberRacerSessionToken("signed-session-token");

    expect(localStorage.getItem("roller-rumble.racerSessionToken")).toBe("signed-session-token");

    forgetRacerSessionToken();

    expect(localStorage.getItem("roller-rumble.racerSessionToken")).toBeNull();
  });
});

describe("registerRacer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("registers without sending the device login the phone already holds", async () => {
    rememberRacerSessionToken("someone-elses-device-login");
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ racer: { id: "racer-2" }, sessionToken: "new" }), {
          status: 200
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    await registerRacer({
      realName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "555-010-0100",
      displayName: "Speedy"
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/register$/);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(JSON.parse(init.body as string)).toEqual({
      realName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "555-010-0100",
      displayName: "Speedy"
    });
  });
});
