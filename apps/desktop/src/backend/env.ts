import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

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

export function writeWebPushEnvValues(
  filePath: string,
  values: {
    publicKey: string;
    privateKey: string;
    subject: string;
  }
): RuntimeEnvFileInfo {
  ensureRuntimeEnvFile(filePath);
  let content = fs.readFileSync(filePath, "utf8");
  content = replaceOrAppendEnvValue(content, "ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY", values.publicKey);
  content = replaceOrAppendEnvValue(
    content,
    "ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY",
    values.privateKey
  );
  content = replaceOrAppendEnvValue(content, "ROLLER_RUMBLE_WEB_PUSH_SUBJECT", values.subject);
  fs.writeFileSync(filePath, content, "utf8");

  return getRuntimeEnvFileInfo(filePath);
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

export function loadDotenvFiles(options: DotenvLoadOptions = {}): string[] {
  const rootDirs = uniqueDirs(options.searchDirs ?? [options.rootDir ?? process.cwd()]);
  const shellProvidedKeys = new Set(Object.keys(process.env));
  const loadedFiles: string[] = [];

  for (const rootDir of rootDirs) {
    for (const fileName of envFileNames(options.profile)) {
      const filePath = path.join(rootDir, fileName);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const parsed = dotenv.parse(fs.readFileSync(filePath));
      for (const [key, value] of Object.entries(parsed)) {
        // Preserve command-line overrides while still allowing .env.local to override .env.
        if (!shellProvidedKeys.has(key)) {
          process.env[key] = value;
        }
      }
      loadedFiles.push(filePath);
    }
  }

  return loadedFiles;
}
