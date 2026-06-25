import { describe, expect, it } from "vitest";
import type {
  RuntimeEnvInfo,
  SubsystemHealth,
  TunnelDiagnostics,
  TunnelState
} from "@roller-rumble/shared/types";
import { MANAGED_SETTINGS } from "@roller-rumble/shared/managed-settings";
import {
  assembleDiagnosticsBundle,
  redactSecrets,
  type DiagnosticsBundleInput
} from "./diagnostics-bundle";

const SECRET_TOKEN = "supersecrettunneltoken1234";
const SECRET_STRIPE = "sk_live_abcdefghijklmnop9876";

function makeRuntimeEnv(): RuntimeEnvInfo {
  return {
    path: "/data/.env.local",
    exists: true,
    loadedFiles: ["/data/.env.local"],
    managedSettings: MANAGED_SETTINGS.map((setting) => {
      // All secret keys are "set" so we can prove their values never leak.
      const set = setting.secret;
      return {
        id: setting.id,
        envKey: setting.envKey,
        secret: setting.secret,
        set,
        last4: set && setting.secret ? "1234" : null
      };
    })
  };
}

const TUNNEL: TunnelState = {
  status: "error",
  mode: "token",
  publicUrl: null,
  tunnelName: "rumble",
  binarySource: "managed",
  cloudflaredVersion: "2026.6.0",
  message: "Provided Tunnel token is not valid",
  lastError: `Provided Tunnel token is not valid: ${SECRET_TOKEN}`
};

const TUNNEL_DIAGNOSTICS: TunnelDiagnostics = {
  mode: "token",
  publicUrl: null,
  tunnelName: "rumble",
  hasToken: true,
  binaryPath: "/data/cloudflared",
  binarySource: "managed",
  cloudflaredVersion: "2026.6.0",
  installPath: "/data/cloudflared",
  downloadUrl: null,
  supportedPlatform: true,
  message: null,
  lastError: null
};

const SUBSYSTEM_HEALTH: SubsystemHealth[] = [
  {
    id: "tunnel",
    label: "Cloudflare tunnel",
    status: "failed",
    summary: "Tunnel failed to start.",
    lastError: `Provided Tunnel token is not valid: ${SECRET_TOKEN}`,
    guidance: {
      code: "tunnel_token_rejected",
      explanation: "Cloudflare rejected the tunnel token.",
      nextAction: "Re-copy the token and restart."
    }
  }
];

function makeInput(overrides: Partial<DiagnosticsBundleInput> = {}): DiagnosticsBundleInput {
  return {
    appVersion: "0.1.7",
    platform: "darwin 24.6.0",
    generatedAt: "2026-06-25T00:00:00.000Z",
    runtimeEnv: makeRuntimeEnv(),
    subsystemHealth: SUBSYSTEM_HEALTH,
    tunnel: TUNNEL,
    tunnelDiagnostics: TUNNEL_DIAGNOSTICS,
    tunnelChecks: [
      { name: "backend health", ok: false, detail: "503 from public URL" },
      { name: "racer HTML", ok: true, detail: "200 text/html" }
    ],
    logs: [
      "info app started",
      `error tunnel rejected token ${SECRET_TOKEN}`,
      `debug using stripe key ${SECRET_STRIPE}`
    ],
    secretValues: [SECRET_TOKEN, SECRET_STRIPE],
    ...overrides
  };
}

describe("redactSecrets", () => {
  it("replaces every occurrence of a secret value", () => {
    const out = redactSecrets(`a ${SECRET_TOKEN} b ${SECRET_TOKEN}`, [SECRET_TOKEN]);
    expect(out).not.toContain(SECRET_TOKEN);
    expect(out).toBe("a [redacted] b [redacted]");
  });

  it("ignores empty or very short secret values", () => {
    expect(redactSecrets("hello", ["", "ab"])).toBe("hello");
  });
});

describe("assembleDiagnosticsBundle", () => {
  it("never emits a secret value in the summary, status, or logs", () => {
    const bundle = assembleDiagnosticsBundle(makeInput());
    const allContent = [bundle.summary, ...bundle.files.map((file) => file.content)].join("\n");
    expect(allContent).not.toContain(SECRET_TOKEN);
    expect(allContent).not.toContain(SECRET_STRIPE);
  });

  it("reports secret managed settings only as set with last-4", () => {
    const bundle = assembleDiagnosticsBundle(makeInput());
    expect(bundle.summary).toContain("tunnelToken: set (ends with 1234)");
    expect(bundle.summary).toContain("stripeSecretKey: set (ends with 1234)");
  });

  it("includes status, subsystem health, and tunnel reachability checks", () => {
    const bundle = assembleDiagnosticsBundle(makeInput());
    expect(bundle.summary).toContain("App version: 0.1.7");
    expect(bundle.summary).toContain("Cloudflare tunnel [failed]");
    expect(bundle.summary).toContain("backend health: failed");
    const fileNames = bundle.files.map((file) => file.name);
    expect(fileNames).toEqual(["summary.txt", "status.json", "logs.txt"]);
  });

  it("redacts secrets that leaked into log lines", () => {
    const bundle = assembleDiagnosticsBundle(makeInput());
    const logs = bundle.files.find((file) => file.name === "logs.txt");
    expect(logs?.content).toContain("[redacted]");
    expect(logs?.content).not.toContain(SECRET_TOKEN);
  });
});
