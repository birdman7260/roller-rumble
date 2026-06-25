import type {
  RuntimeEnvInfo,
  SubsystemHealth,
  TunnelDiagnostics,
  TunnelState
} from "@roller-rumble/shared/types";

/**
 * The diagnostics bundle: a redacted, shareable export of app status and logs an operator sends
 * to the maintainer when something fails (see CONTEXT.md "diagnostics bundle"). This module is a
 * pure assembler — it turns already-gathered status into (a) a copyable summary and (b) a file
 * manifest for a saved zip. The actual clipboard/zip writes are side-effecting edges elsewhere.
 *
 * Belt-and-suspenders on secrets: secret values are never written to logs in the first place, and
 * this assembler redacts on export as well. Secrets appear only as set/unset or last-4.
 */

/** One of the separate tunnel reachability probes (backend health, racer HTML, WebSocket). */
export interface TunnelHealthCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DiagnosticsBundleInput {
  appVersion: string;
  platform: string;
  generatedAt: string;
  runtimeEnv: RuntimeEnvInfo;
  subsystemHealth: SubsystemHealth[];
  tunnel: TunnelState;
  tunnelDiagnostics: TunnelDiagnostics | null;
  tunnelChecks: TunnelHealthCheck[];
  /** Recent log lines (already captured by the always-on logger). */
  logs: string[];
  /**
   * The actual secret values, used ONLY so the redactor can scrub any accidental occurrence out
   * of free text (logs, error messages). They are never emitted into the bundle.
   */
  secretValues: string[];
}

export interface DiagnosticsFile {
  name: string;
  content: string;
}

export interface DiagnosticsBundle {
  /** Redacted, copyable plain-text summary for pasting into chat or email. */
  summary: string;
  /** Files for the saved zip (status JSON, redacted logs, the summary). */
  files: DiagnosticsFile[];
}

const REDACTED = "[redacted]";

/** Replace any occurrence of a secret value with a placeholder. Pure. */
export function redactSecrets(text: string, secretValues: string[]): string {
  let out = text;
  for (const secret of secretValues) {
    // Ignore short/empty values to avoid scrubbing innocuous substrings.
    if (secret && secret.length >= 4) {
      out = out.split(secret).join(REDACTED);
    }
  }
  return out;
}

function managedLine(setting: RuntimeEnvInfo["managedSettings"][number]): string {
  if (!setting.set) {
    return `  - ${setting.id}: not set`;
  }
  if (setting.secret) {
    return `  - ${setting.id}: set (ends with ${setting.last4 ?? "????"})`;
  }
  return `  - ${setting.id}: set`;
}

function subsystemLine(health: SubsystemHealth): string {
  const lines = [`  - ${health.label} [${health.status}]: ${health.summary}`];
  if (health.lastError) {
    lines.push(`      last error: ${health.lastError}`);
  }
  if (health.guidance) {
    lines.push(`      guidance: ${health.guidance.explanation} → ${health.guidance.nextAction}`);
  }
  return lines.join("\n");
}

function buildSummary(input: DiagnosticsBundleInput): string {
  const { tunnelDiagnostics } = input;
  const sections: string[] = [
    "Roller Rumble diagnostics",
    `App version: ${input.appVersion}`,
    `Platform: ${input.platform}`,
    `Generated: ${input.generatedAt}`,
    "",
    `Runtime settings file: ${input.runtimeEnv.path || "(unknown)"} (${
      input.runtimeEnv.exists ? "exists" : "missing"
    })`,
    `Loaded env files:${
      input.runtimeEnv.loadedFiles.length
        ? `\n${input.runtimeEnv.loadedFiles.map((file) => `  - ${file}`).join("\n")}`
        : " (none)"
    }`,
    "",
    "Managed settings:",
    ...input.runtimeEnv.managedSettings.map(managedLine),
    "",
    "Subsystem health:",
    ...input.subsystemHealth.map(subsystemLine),
    "",
    "Tunnel diagnostics:",
    `  - status: ${input.tunnel.status}`,
    `  - mode: ${tunnelDiagnostics?.mode ?? input.tunnel.mode ?? "(unknown)"}`,
    `  - binary source: ${tunnelDiagnostics?.binarySource ?? input.tunnel.binarySource ?? "(unknown)"}`,
    `  - cloudflared version: ${
      tunnelDiagnostics?.cloudflaredVersion ?? input.tunnel.cloudflaredVersion ?? "(unknown)"
    }`,
    `  - public URL: ${tunnelDiagnostics?.publicUrl ?? input.tunnel.publicUrl ?? "(none)"}`,
    "  - reachability checks:",
    ...(input.tunnelChecks.length
      ? input.tunnelChecks.map(
          (check) => `      ${check.name}: ${check.ok ? "ok" : "failed"} — ${check.detail}`
        )
      : ["      (not run)"])
  ];

  return redactSecrets(sections.join("\n"), input.secretValues);
}

function buildStatusJson(input: DiagnosticsBundleInput): string {
  const status = {
    appVersion: input.appVersion,
    platform: input.platform,
    generatedAt: input.generatedAt,
    runtimeEnv: {
      path: input.runtimeEnv.path,
      exists: input.runtimeEnv.exists,
      loadedFiles: input.runtimeEnv.loadedFiles,
      managedSettings: input.runtimeEnv.managedSettings
    },
    subsystemHealth: input.subsystemHealth,
    tunnel: input.tunnel,
    tunnelDiagnostics: input.tunnelDiagnostics,
    tunnelChecks: input.tunnelChecks
  };
  return redactSecrets(JSON.stringify(status, null, 2), input.secretValues);
}

export function assembleDiagnosticsBundle(input: DiagnosticsBundleInput): DiagnosticsBundle {
  const summary = buildSummary(input);
  const statusJson = buildStatusJson(input);
  const logs = redactSecrets(input.logs.join("\n"), input.secretValues);

  return {
    summary,
    files: [
      { name: "summary.txt", content: summary },
      { name: "status.json", content: statusJson },
      { name: "logs.txt", content: logs }
    ]
  };
}
