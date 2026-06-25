import http from "node:http";
import https from "node:https";
import {
  getPublicBackendHealthUrl,
  getPublicRacerPageUrl,
  getPublicWebSocketProbeUrl
} from "./cloudflared-tools";
import type { TunnelHealthCheck } from "./diagnostics-bundle";

const PROBE_TIMEOUT_MS = 5000;

async function probeHttp(
  name: string,
  url: string | null,
  expectHtml: boolean
): Promise<TunnelHealthCheck> {
  if (!url) {
    return { name, ok: false, detail: "skipped — no public URL configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType = response.headers.get("content-type") ?? "";
    const ok = expectHtml ? response.ok && contentType.includes("text/html") : response.ok;
    return {
      name,
      ok,
      detail: `HTTP ${String(response.status)}${contentType ? ` ${contentType}` : ""} (${url})`
    };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : "request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function probeWebSocket(url: string | null): Promise<TunnelHealthCheck> {
  const name = "WebSocket";
  if (!url) {
    return Promise.resolve({ name, ok: false, detail: "skipped — no public URL configured" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TunnelHealthCheck) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const probeUrl = new URL(url);
    const requestModule = probeUrl.protocol === "https:" ? https : http;
    const request = requestModule.request(probeUrl, {
      method: "GET",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ=="
      }
    });

    request.on("upgrade", (response, socket) => {
      socket.destroy();
      finish({
        name,
        ok: response.statusCode === 101,
        detail: `HTTP ${String(response.statusCode ?? "unknown")}`
      });
    });
    request.on("response", (response) => {
      response.resume();
      finish({ name, ok: false, detail: `HTTP ${String(response.statusCode ?? "unknown")}` });
    });
    request.on("error", (error) => finish({ name, ok: false, detail: error.message }));
    request.setTimeout(PROBE_TIMEOUT_MS, () => request.destroy(new Error("timed out")));
    request.end();
  });
}

/**
 * Run the three separate tunnel reachability probes the maintainer needs to tell apart a dead
 * tunnel from a misrouted one: backend health, racer HTML, and the WebSocket upgrade. Best-effort
 * and side-effecting (network), so it lives outside the pure diagnostics seam.
 */
export async function runTunnelHealthChecks(
  publicRacerUrl: string | null
): Promise<TunnelHealthCheck[]> {
  return Promise.all([
    probeHttp("backend health", getPublicBackendHealthUrl(publicRacerUrl), false),
    probeHttp("racer HTML", getPublicRacerPageUrl(publicRacerUrl), true),
    probeWebSocket(getPublicWebSocketProbeUrl(publicRacerUrl))
  ]);
}
