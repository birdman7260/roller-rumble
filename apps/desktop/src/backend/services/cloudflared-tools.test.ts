import { describe, expect, it } from "vitest";
import {
  buildCloudflaredStartCommand,
  createCloudflaredConfig,
  getCloudflaredCandidateOrder,
  getPublicBackendHealthUrl,
  getPublicRacerPageUrl,
  getPublicWebSocketProbeUrl,
  isTransientTunnelConnectionError,
  isTunnelConnectionRegistered,
  normalizePublicRacerUrl,
  publicHostnameRoutingHint,
  selectCloudflaredDownload
} from "./cloudflared-tools";

const dataDir = "/tmp/roller-rumble-cloudflared-test";

describe("cloudflared tools", () => {
  it("normalizes bare public domains into racer page URLs", () => {
    expect(normalizePublicRacerUrl("https://roller-rumble.birdsnest.family")).toBe(
      "https://roller-rumble.birdsnest.family/racer"
    );
    expect(normalizePublicRacerUrl("https://roller-rumble.birdsnest.family/racer")).toBe(
      "https://roller-rumble.birdsnest.family/racer"
    );
  });

  it("derives the public backend health URL from the racer page URL", () => {
    expect(getPublicBackendHealthUrl("https://roller-rumble.birdsnest.family/racer")).toBe(
      "https://roller-rumble.birdsnest.family/api/health"
    );
  });

  it("derives public racer page and websocket probe URLs", () => {
    expect(getPublicRacerPageUrl("https://roller-rumble.birdsnest.family")).toBe(
      "https://roller-rumble.birdsnest.family/racer"
    );
    expect(getPublicWebSocketProbeUrl("https://roller-rumble.birdsnest.family/racer")).toBe(
      "https://roller-rumble.birdsnest.family/ws"
    );
  });

  it("documents the required root public hostname route", () => {
    expect(publicHostnameRoutingHint()).toContain("empty Path");
    expect(publicHostnameRoutingHint()).toContain("/ws");
  });

  it("classifies transient edge/QUIC dial timeouts as recoverable", () => {
    expect(
      isTransientTunnelConnectionError(
        'ERR Failed to dial a quic connection error="failed to dial to edge with quic: timeout: no recent network activity" connIndex=0'
      )
    ).toBe(true);
    expect(
      isTransientTunnelConnectionError("INF Retrying connection in up to 4s connIndex=0")
    ).toBe(true);
    expect(
      isTransientTunnelConnectionError(
        "ERR Request failed error=unable to reach the origin service"
      )
    ).toBe(false);
  });

  it("detects when cloudflared registers an edge connection", () => {
    expect(
      isTunnelConnectionRegistered(
        "INF Registered tunnel connection connIndex=0 connID=abc location=sea01"
      )
    ).toBe(true);
    expect(isTunnelConnectionRegistered("INF Starting tunnel")).toBe(false);
  });

  it("selects official release assets for supported desktop platforms", () => {
    expect(selectCloudflaredDownload("darwin", "arm64")?.url).toContain(
      "cloudflared-darwin-arm64.tgz"
    );
    expect(selectCloudflaredDownload("darwin", "x64")?.url).toContain(
      "cloudflared-darwin-amd64.tgz"
    );
    expect(selectCloudflaredDownload("win32", "x64")?.url).toContain(
      "cloudflared-windows-amd64.exe"
    );
    expect(selectCloudflaredDownload("aix", "ppc64")).toBeNull();
  });

  it("prefers configured, then managed, then PATH binaries", () => {
    const config = createCloudflaredConfig({
      dataDir,
      env: {
        ROLLER_RUMBLE_CLOUDFLARED_PATH: "/custom/cloudflared"
      }
    });

    expect(
      getCloudflaredCandidateOrder(config, "/usr/local/bin/cloudflared", "/managed/cloudflared")
    ).toEqual([
      { source: "env", path: "/custom/cloudflared" },
      { source: "managed", path: "/managed/cloudflared" },
      { source: "path", path: "/usr/local/bin/cloudflared" }
    ]);
  });

  it("builds the current quick tunnel command", () => {
    const config = createCloudflaredConfig({ dataDir, env: {} });
    expect(buildCloudflaredStartCommand(config, "/bin/cloudflared", 3187)).toEqual({
      command: "/bin/cloudflared",
      args: ["tunnel", "--url", "http://127.0.0.1:3187"],
      publicUrl: null
    });
  });

  it("builds a token tunnel command without requiring the tunnel name in arguments", () => {
    const config = createCloudflaredConfig({
      dataDir,
      env: {
        ROLLER_RUMBLE_TUNNEL_MODE: "token",
        ROLLER_RUMBLE_TUNNEL_NAME: "Roller Rumble",
        ROLLER_RUMBLE_TUNNEL_TOKEN: "secret-token",
        ROLLER_RUMBLE_PUBLIC_RACER_URL: "https://roller-rumble.birdsnest.family"
      }
    });

    expect(buildCloudflaredStartCommand(config, "/bin/cloudflared", 3187)).toEqual({
      command: "/bin/cloudflared",
      args: ["tunnel", "--no-autoupdate", "run", "--token", "secret-token"],
      publicUrl: "https://roller-rumble.birdsnest.family/racer"
    });
  });
});
