import { describe, expect, it } from "vitest";
import {
  createWebSocketUrlFromApiBase,
  forgetRacerSessionToken,
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
