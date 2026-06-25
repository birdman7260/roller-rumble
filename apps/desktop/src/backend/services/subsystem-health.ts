import type {
  Os2lDiagnostics,
  PhotoBoothStatus,
  RuntimeEnvInfo,
  StripeSetupStatus,
  SubsystemHealth,
  TunnelState
} from "@roller-rumble/shared/types";
import type { SubsystemId } from "@roller-rumble/shared/managed-settings";
import { lookupKnownError } from "./known-errors";

/**
 * Everything the subsystem-health summary needs, all of it already carried by the runtime
 * context that feeds the snapshot. Kept as a plain input so the assembly stays a pure function
 * (it never touches `process.env`, the filesystem, or any adapter) and rides the existing
 * SnapshotAssembler boundary (ADR 0002).
 */
export interface SubsystemHealthInput {
  tunnel: TunnelState;
  os2l: Os2lDiagnostics;
  os2lEnabled: boolean;
  stripe: StripeSetupStatus;
  photoBooth: PhotoBoothStatus;
  runtimeEnv: RuntimeEnvInfo;
}

const LABELS: Record<SubsystemId, string> = {
  tunnel: "Cloudflare tunnel",
  stripe: "Stripe payments",
  webPush: "Racer notifications",
  network: "Local network",
  os2l: "VirtualDJ (OS2L)",
  photoBooth: "Photo booth"
};

function managedIsSet(runtimeEnv: RuntimeEnvInfo, id: string): boolean {
  return runtimeEnv.managedSettings.find((setting) => setting.id === id)?.set ?? false;
}

function entry(
  id: SubsystemId,
  status: SubsystemHealth["status"],
  summary: string,
  lastError: string | null = null
): SubsystemHealth {
  return {
    id,
    label: LABELS[id],
    status,
    summary,
    lastError,
    guidance: lookupKnownError(lastError)
  };
}

function tunnelHealth(input: SubsystemHealthInput): SubsystemHealth {
  const { tunnel } = input;
  if (tunnel.binarySource === "missing") {
    return entry(
      "tunnel",
      "failed",
      "cloudflared is not installed.",
      "cloudflared binary not found"
    );
  }
  if (tunnel.mode === "token" && !managedIsSet(input.runtimeEnv, "tunnelToken")) {
    return entry("tunnel", "degraded", "Token mode is selected but no tunnel token is set.");
  }
  switch (tunnel.status) {
    case "active":
      return entry(
        "tunnel",
        "ready",
        tunnel.message ?? "Tunnel is active.",
        tunnel.lastError ?? null
      );
    case "starting":
      return entry("tunnel", "degraded", "Tunnel is starting…");
    case "error":
      return entry(
        "tunnel",
        "failed",
        tunnel.message ?? "Tunnel failed to start.",
        tunnel.lastError ?? null
      );
    case "idle":
    default:
      return entry("tunnel", "ready", "Tunnel is not running.");
  }
}

function stripeHealth(input: SubsystemHealthInput): SubsystemHealth {
  const { stripe } = input;
  if (!stripe.hasSecretKey && !stripe.hasWebhookSecret) {
    return entry("stripe", "disabled", "Stripe Checkout is turned off.");
  }
  if (stripe.configured) {
    return entry("stripe", "ready", "Stripe Checkout is ready.");
  }
  return entry("stripe", "degraded", stripe.message);
}

function webPushHealth(input: SubsystemHealthInput): SubsystemHealth {
  const hasPublic = managedIsSet(input.runtimeEnv, "webPushPublicKey");
  const hasPrivate = managedIsSet(input.runtimeEnv, "webPushPrivateKey");
  if (!hasPublic && !hasPrivate) {
    return entry("webPush", "disabled", "Racer notifications are turned off.");
  }
  if (hasPublic && hasPrivate) {
    return entry("webPush", "ready", "Racer notifications are ready.");
  }
  return entry(
    "webPush",
    "degraded",
    "Racer notifications are only partly configured (missing a push key)."
  );
}

function networkHealth(input: SubsystemHealthInput): SubsystemHealth {
  const { runtimeEnv } = input;
  // The runtime file exists but did not load means saved settings are not being applied.
  if (runtimeEnv.exists && !runtimeEnv.loadedFiles.includes(runtimeEnv.path)) {
    return entry(
      "network",
      "failed",
      "The settings file was not loaded.",
      "settings file was not loaded"
    );
  }
  return entry(
    "network",
    "ready",
    managedIsSet(runtimeEnv, "localServerHost")
      ? "Using a manually set local network address."
      : "Using the auto-detected local network address."
  );
}

function os2lHealth(input: SubsystemHealthInput): SubsystemHealth {
  const { os2l } = input;
  if (!input.os2lEnabled && !os2l.enabled) {
    return entry("os2l", "disabled", "VirtualDJ integration is turned off.");
  }
  if (os2l.lastError) {
    return entry("os2l", "failed", "VirtualDJ integration reported an error.", os2l.lastError);
  }
  if (os2l.listening) {
    return entry("os2l", "ready", "Listening for VirtualDJ beats.");
  }
  return entry("os2l", "degraded", "Enabled but not listening yet.");
}

function photoBoothHealth(input: SubsystemHealthInput): SubsystemHealth {
  const { photoBooth } = input;
  switch (photoBooth.status) {
    case "online":
    case "capturing":
    case "syncing":
      return entry("photoBooth", "ready", photoBooth.message ?? "Photo booth is connected.");
    case "error":
      return entry(
        "photoBooth",
        "failed",
        photoBooth.message ?? "Photo booth reported an error.",
        photoBooth.message ?? null
      );
    case "idle":
    default:
      return entry("photoBooth", "disabled", "Photo booth is not connected.");
  }
}

/**
 * Pure assembly of the per-subsystem readiness summary surfaced at the top of Settings. Each
 * subsystem maps to ready/degraded/failed/disabled, and a recognized failure carries
 * known-error guidance for the operator.
 */
export function assembleSubsystemHealth(input: SubsystemHealthInput): SubsystemHealth[] {
  return [
    tunnelHealth(input),
    networkHealth(input),
    stripeHealth(input),
    webPushHealth(input),
    os2lHealth(input),
    photoBoothHealth(input)
  ];
}
