import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  getManagedSettingByEnvKey,
  MANAGED_SETTINGS
} from "@roller-rumble/shared/managed-settings";
import type { ManagedSettingState, RuntimeEnvInfo } from "@roller-rumble/shared/types";

interface DotenvLoadOptions {
  rootDir?: string;
  searchDirs?: string[];
  profile?: string;
}

export interface RuntimeEnvFileInfo {
  path: string;
  exists: boolean;
  loadedFiles: string[];
}

function envFileNames(profile?: string): string[] {
  return [".env", ".env.local", ...(profile ? [`.env.${profile}`, `.env.${profile}.local`] : [])];
}

function uniqueDirs(dirs: string[]): string[] {
  return [...new Set(dirs.map((dir) => path.resolve(dir)))];
}

export function getDefaultRuntimeEnvTemplate(): string {
  return [
    "# Roller Rumble settings file",
    "#",
    "# Plain English version:",
    "# - This file is for settings that are private or specific to this computer.",
    "# - Lines that start with # are notes. Roller Rumble ignores them.",
    "# - To turn on a setting, remove the # at the start of that line and put your value after =.",
    "# - Do not add spaces around =.",
    "# - Save this file, then fully quit and reopen Roller Rumble.",
    "# - Keep this file private. It may contain passwords, tokens, and secret keys.",
    "#",
    "# Example:",
    "#   # This is ignored:",
    "#   # ROLLER_RUMBLE_LOCAL_SERVER_HOST=192.168.1.42",
    "#   # This is used:",
    "#   ROLLER_RUMBLE_LOCAL_SERVER_HOST=192.168.1.42",
    "",
    "# -----------------------------------------------------------------------------",
    "# Local network address",
    "# -----------------------------------------------------------------------------",
    "# Use this only if racer phones, the QR code, or the photo booth are showing the",
    "# wrong address for this computer. Replace the example with this computer's LAN",
    "# IP address, usually something like 192.168.x.x or 10.x.x.x.",
    "# ROLLER_RUMBLE_LOCAL_SERVER_HOST=192.168.1.42",
    "",
    "# -----------------------------------------------------------------------------",
    "# Public racer URL",
    "# -----------------------------------------------------------------------------",
    "# Use this if racers should always use a specific public HTTPS address.",
    "# Most events can leave this commented out unless you are using a stable tunnel",
    "# or a custom domain.",
    "# ROLLER_RUMBLE_PUBLIC_RACER_URL=https://example.com/racer",
    "",
    "# -----------------------------------------------------------------------------",
    "# Cloudflare tunnel",
    "# -----------------------------------------------------------------------------",
    "# Quick mode is easiest and does not need a token. Token mode is for a stable",
    "# Cloudflare tunnel that you already created in Cloudflare.",
    "#",
    "# For quick mode:",
    "# ROLLER_RUMBLE_TUNNEL_MODE=quick",
    "#",
    "# For token mode, uncomment both lines and paste the token from Cloudflare:",
    "# ROLLER_RUMBLE_TUNNEL_MODE=quick",
    "# ROLLER_RUMBLE_TUNNEL_TOKEN=",
    "",
    "# -----------------------------------------------------------------------------",
    "# Stripe payments",
    "# -----------------------------------------------------------------------------",
    "# Only fill these in if racers pay through Stripe Checkout.",
    "# Copy these from your Stripe dashboard. Keep them secret.",
    "# ROLLER_RUMBLE_STRIPE_SECRET_KEY=",
    "# ROLLER_RUMBLE_STRIPE_WEBHOOK_SECRET=",
    "#",
    "# If Stripe says Roller Rumble could not reach Stripe and your computer uses",
    "# Zscaler, a company VPN, or other HTTPS inspection, export that trusted",
    "# certificate as a PEM file and paste the full file path here.",
    "# Example on macOS:",
    "# ROLLER_RUMBLE_STRIPE_EXTRA_CA_CERT_FILE=/Users/you/Documents/zscaler-root.pem",
    "# Example on Windows:",
    "# ROLLER_RUMBLE_STRIPE_EXTRA_CA_CERT_FILE=C:\\Users\\you\\Documents\\zscaler-root.pem",
    "",
    "# -----------------------------------------------------------------------------",
    "# Racer push notifications",
    "# -----------------------------------------------------------------------------",
    "# You usually do not need to type these by hand.",
    "# In Roller Rumble, open Settings -> Environment and click Generate Push Keys.",
    "# That button will fill in the three lines below for you.",
    "#",
    "# The subject is contact info for browser push services.",
    "# You may leave the generated default alone, or change it to your email later.",
    "# Example: mailto:you@example.com",
    "# ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY=",
    "# ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY=",
    "# ROLLER_RUMBLE_WEB_PUSH_SUBJECT=mailto:roller-rumble@localhost.local",
    "",
    "# -----------------------------------------------------------------------------",
    "# Bike sensor",
    "# -----------------------------------------------------------------------------",
    "# Leave everything below commented to use the built-in simulator (fake riders).",
    "# To use the physical OpenSprints USB race box, set the mode to opensprints, then",
    "# fully quit and reopen Roller Rumble. You can also change this from Settings.",
    "# ROLLER_RUMBLE_SENSOR_MODE=opensprints",
    "#",
    "# The box is found automatically. Set a port only if auto-detect picks the wrong",
    "# device, e.g. COM3 on Windows or /dev/tty.usbserial-XXXX on a Mac.",
    "# ROLLER_RUMBLE_SENSOR_PORT=COM3",
    "#",
    "# Which race lane each sensor port feeds, in order. Confirmed wiring is left,right.",
    "# A flipped map crowns the wrong winner, so match it to the real hardware.",
    "# ROLLER_RUMBLE_SENSOR_LANE_MAP=left,right",
    "#",
    "# Advanced. Force a firmware only if auto-detect cannot identify the box, and set the",
    "# roller rollout (meters traveled per roller revolution) only for a non-standard roller.",
    "# ROLLER_RUMBLE_SENSOR_PROTOCOL=auto",
    "# ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS=0.359",
    "#",
    "# Advanced. How long (ms) the box stays silent between GO and its first tick. Roller Rumble",
    "# delays the box's GO so this silent stretch lands at the end of the on-screen countdown.",
    "# Change it only if the countdown reaching zero does not match when your box actually goes.",
    "# ROLLER_RUMBLE_SENSOR_BOX_COUNTDOWN_MS=4000",
    ""
  ].join("\n");
}

function replaceOrAppendEnvValue(content: string, key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(#\\s*)?${escapedKey}=.*$`, "m");
  const line = `${key}=${value}`;

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const prefix = content.endsWith("\n") ? content : `${content}\n`;
  return `${prefix}${line}\n`;
}

/**
 * Write managed settings into the runtime env file one key at a time, preserving comments and
 * unrelated lines (and the operator's own hand-edits) instead of rewriting the whole file. Only
 * keys in the managed-settings registry may be written; advanced settings stay file-only.
 *
 * Creates the runtime env file from the starter template if it is absent.
 */
export function writeManagedEnvValues(
  filePath: string,
  values: Record<string, string>
): RuntimeEnvFileInfo {
  for (const envKey of Object.keys(values)) {
    if (!getManagedSettingByEnvKey(envKey)) {
      throw new Error(`Refusing to write non-managed env key: ${envKey}`);
    }
  }

  ensureRuntimeEnvFile(filePath);
  let content = fs.readFileSync(filePath, "utf8");
  for (const [envKey, value] of Object.entries(values)) {
    content = replaceOrAppendEnvValue(content, envKey, value);
  }
  fs.writeFileSync(filePath, content, "utf8");

  return getRuntimeEnvFileInfo(filePath);
}

export function writeManagedEnvValue(
  filePath: string,
  envKey: string,
  value: string
): RuntimeEnvFileInfo {
  return writeManagedEnvValues(filePath, { [envKey]: value });
}

export function writeWebPushEnvValues(
  filePath: string,
  values: {
    publicKey: string;
    privateKey: string;
    subject: string;
  }
): RuntimeEnvFileInfo {
  return writeManagedEnvValues(filePath, {
    ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY: values.publicKey,
    ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY: values.privateKey,
    ROLLER_RUMBLE_WEB_PUSH_SUBJECT: values.subject
  });
}

export function ensureRuntimeEnvFile(filePath: string): RuntimeEnvFileInfo {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, getDefaultRuntimeEnvTemplate(), { encoding: "utf8", flag: "wx" });
  }

  return getRuntimeEnvFileInfo(filePath);
}

export function getRuntimeEnvFileInfo(
  filePath: string,
  loadedFiles: string[] = []
): RuntimeEnvFileInfo {
  return {
    path: filePath,
    exists: fs.existsSync(filePath),
    loadedFiles
  };
}

/**
 * Derive the set/unset state of every managed setting from `process.env`. Secret values are
 * reported only as set/unset plus the last 4 characters — never the full value — so this can
 * feed the status surface and diagnostics bundle without leaking secrets.
 */
export function buildManagedSettingStates(
  env: NodeJS.ProcessEnv = process.env
): ManagedSettingState[] {
  return MANAGED_SETTINGS.map((setting) => {
    const value = env[setting.envKey]?.trim() ?? "";
    const set = value.length > 0;
    return {
      id: setting.id,
      envKey: setting.envKey,
      secret: setting.secret,
      set,
      value: setting.secret ? null : value,
      last4: set && setting.secret ? value.slice(-4) : null
    };
  });
}

/** The full runtime env info surfaced on the snapshot: file location, loaded files, managed state. */
export function getRuntimeEnvInfo(
  filePath: string,
  loadedFiles: string[] = [],
  env: NodeJS.ProcessEnv = process.env
): RuntimeEnvInfo {
  return {
    path: filePath,
    exists: fs.existsSync(filePath),
    loadedFiles,
    managedSettings: buildManagedSettingStates(env)
  };
}

/**
 * Keys we have set from a dotenv file. We *own* these on reload (we may overwrite them with a
 * newer file value), whereas any key already in `process.env` that we did not set is treated as
 * a genuine shell/command-line override and preserved. Without this provenance a second load
 * would silently no-op (the original "refuse to overwrite anything already present" behavior),
 * which would make "Reload settings from disk" do nothing. See ADR 0004.
 */
const fileProvidedKeys = new Set<string>();

/** Reset key provenance. Test-only seam so a fresh module state can be simulated. */
export function resetEnvProvenanceForTesting(): void {
  fileProvidedKeys.clear();
}

export function loadDotenvFiles(options: DotenvLoadOptions = {}): string[] {
  const rootDirs = uniqueDirs(options.searchDirs ?? [options.rootDir ?? process.cwd()]);
  const loadedFiles: string[] = [];

  for (const rootDir of rootDirs) {
    for (const fileName of envFileNames(options.profile)) {
      const filePath = path.join(rootDir, fileName);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const parsed = dotenv.parse(fs.readFileSync(filePath));
      for (const [key, value] of Object.entries(parsed)) {
        // A value we previously loaded from a file is ours to refresh; a value present in the
        // environment that we never set is a genuine shell override and must win.
        if (fileProvidedKeys.has(key) || !(key in process.env)) {
          process.env[key] = value;
          fileProvidedKeys.add(key);
        }
      }
      loadedFiles.push(filePath);
    }
  }

  return loadedFiles;
}

/**
 * Re-read the runtime env files from disk and re-apply them, overriding values we previously
 * loaded from a file while preserving genuine shell-provided overrides. Used by the in-app
 * "Reload settings from disk" action so hand-edited advanced settings are picked up without a
 * full restart.
 */
export function reloadDotenvFiles(options: DotenvLoadOptions = {}): string[] {
  return loadDotenvFiles(options);
}

/**
 * Apply a managed setting that was just written to the runtime env file directly into
 * `process.env`, marking it as file-provided so a later reload behaves consistently. Most
 * subsystems derive config from `process.env` on each use, so this makes a Save take effect
 * without a full restart.
 */
export function applyManagedEnvValue(envKey: string, value: string): void {
  process.env[envKey] = value;
  fileProvidedKeys.add(envKey);
}
