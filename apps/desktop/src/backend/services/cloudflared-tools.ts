import { spawnSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { API_PREFIX, WS_PATH } from "@roller-rumble/shared/constants";
import type { TunnelDiagnostics } from "@roller-rumble/shared/types";

type CloudflaredBinarySource = TunnelDiagnostics["binarySource"];
type TunnelMode = TunnelDiagnostics["mode"];

const CLOUDFLARED_RELEASE_BASE =
  "https://github.com/cloudflare/cloudflared/releases/latest/download";

interface CloudflaredConfigOptions {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
}

export interface CloudflaredConfig {
  dataDir: string;
  mode: TunnelMode;
  tunnelName: string | null;
  token: string | null;
  publicRacerUrl: string | null;
  configuredBinaryPath: string | null;
}

export interface CloudflaredDownloadTarget {
  platform: NodeJS.Platform;
  arch: string;
  url: string;
  archiveType: "tgz" | "exe";
}

export interface CloudflaredCandidate {
  source: Exclude<CloudflaredBinarySource, "missing">;
  path: string;
}

export interface CloudflaredCommand {
  command: string;
  args: string[];
  publicUrl: string | null;
}

interface VersionResult {
  version: string | null;
  error: string | null;
}

function normalizedEnvValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}

function normalizeTunnelMode(value: string | undefined, hasToken: boolean): TunnelMode {
  if (value === "quick" || value === "token") {
    return value;
  }

  return hasToken ? "token" : "quick";
}

export function normalizePublicRacerUrl(value: string | null | undefined): string | null {
  const normalized = normalizedEnvValue(value ?? undefined);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/racer";
    }
    return url.toString();
  } catch {
    return normalized.endsWith("/racer") ? normalized : `${normalized.replace(/\/+$/, "")}/racer`;
  }
}

export function getPublicBackendHealthUrl(publicRacerUrl: string | null): string | null {
  if (!publicRacerUrl) {
    return null;
  }

  try {
    return new URL(`${API_PREFIX}/health`, publicRacerUrl).toString();
  } catch {
    return null;
  }
}

export function getPublicRacerPageUrl(publicRacerUrl: string | null): string | null {
  return normalizePublicRacerUrl(publicRacerUrl);
}

export function getPublicWebSocketProbeUrl(publicRacerUrl: string | null): string | null {
  if (!publicRacerUrl) {
    return null;
  }

  try {
    return new URL(WS_PATH, publicRacerUrl).toString();
  } catch {
    return null;
  }
}

export function publicHostnameRoutingHint(): string {
  return [
    "Cloudflare Public Hostname should have an empty Path and service http://127.0.0.1:3187.",
    `That single root route must cover /racer, /assets/*, /uploads/*, ${API_PREFIX}/*, and ${WS_PATH}.`
  ].join(" ");
}

/**
 * cloudflared logs a QUIC/edge dial timeout when its connection to Cloudflare's edge briefly drops
 * (flaky Wi-Fi, sleep, or networks that throttle UDP/QUIC). These lines contain "error" but
 * cloudflared retries on its own, so they must not flip the tunnel into a fatal error state.
 */
export function isTransientTunnelConnectionError(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("retrying connection") ||
    lower.includes("failed to dial a quic connection") ||
    lower.includes("no recent network activity")
  );
}

/**
 * cloudflared logs a registered-connection line each time it (re)establishes an edge connection.
 * Detecting it lets the app clear a transient error and show the tunnel as active again.
 */
export function isTunnelConnectionRegistered(text: string): boolean {
  return text.toLowerCase().includes("registered tunnel connection");
}

export function createCloudflaredConfig({
  dataDir,
  env = process.env
}: CloudflaredConfigOptions): CloudflaredConfig {
  const token = normalizedEnvValue(env.ROLLER_RUMBLE_TUNNEL_TOKEN);
  return {
    dataDir,
    mode: normalizeTunnelMode(env.ROLLER_RUMBLE_TUNNEL_MODE, Boolean(token)),
    tunnelName: normalizedEnvValue(env.ROLLER_RUMBLE_TUNNEL_NAME),
    token,
    publicRacerUrl: normalizePublicRacerUrl(env.ROLLER_RUMBLE_PUBLIC_RACER_URL),
    configuredBinaryPath: normalizedEnvValue(env.ROLLER_RUMBLE_CLOUDFLARED_PATH)
  };
}

export function selectCloudflaredDownload(
  platform: NodeJS.Platform = process.platform,
  arch = process.arch
): CloudflaredDownloadTarget | null {
  if (platform === "darwin" && arch === "arm64") {
    return {
      platform,
      arch,
      url: `${CLOUDFLARED_RELEASE_BASE}/cloudflared-darwin-arm64.tgz`,
      archiveType: "tgz"
    };
  }

  if (platform === "darwin" && arch === "x64") {
    return {
      platform,
      arch,
      url: `${CLOUDFLARED_RELEASE_BASE}/cloudflared-darwin-amd64.tgz`,
      archiveType: "tgz"
    };
  }

  if (platform === "win32" && arch === "x64") {
    return {
      platform,
      arch,
      url: `${CLOUDFLARED_RELEASE_BASE}/cloudflared-windows-amd64.exe`,
      archiveType: "exe"
    };
  }

  return null;
}

export function getManagedCloudflaredPath(
  dataDir: string,
  platform: NodeJS.Platform = process.platform,
  arch = process.arch
): string | null {
  if (!selectCloudflaredDownload(platform, arch)) {
    return null;
  }

  const executableName = platform === "win32" ? "cloudflared.exe" : "cloudflared";
  return path.join(dataDir, "tools", "cloudflared", `${platform}-${arch}`, executableName);
}

function resolveConfiguredPath(configuredPath: string | null): string | null {
  if (!configuredPath) {
    return null;
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(configuredPath);
}

function isUsableFile(filePath: string | null): boolean {
  if (!filePath) {
    return false;
  }

  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function pathExecutableNames(): string[] {
  if (process.platform !== "win32") {
    return ["cloudflared"];
  }

  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .map((extension) => extension.toLowerCase());
  return extensions.map((extension) => `cloudflared${extension}`);
}

export function findCloudflaredOnPath(pathValue = process.env.PATH ?? ""): string | null {
  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) {
      continue;
    }

    for (const executableName of pathExecutableNames()) {
      const candidate = path.join(entry, executableName);
      if (isUsableFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function getCloudflaredCandidateOrder(
  config: CloudflaredConfig,
  pathBinary = findCloudflaredOnPath(),
  managedPath = getManagedCloudflaredPath(config.dataDir)
): CloudflaredCandidate[] {
  return [
    { source: "env", path: resolveConfiguredPath(config.configuredBinaryPath) },
    { source: "managed", path: managedPath },
    { source: "path", path: pathBinary }
  ].filter((candidate): candidate is CloudflaredCandidate => Boolean(candidate.path));
}

function readCloudflaredVersion(binaryPath: string): VersionResult {
  const result = spawnSync(binaryPath, ["--version"], {
    encoding: "utf8",
    timeout: 5000
  });
  if (result.error) {
    return { version: null, error: result.error.message };
  }

  const output = `${result.stdout}${result.stderr}`.trim();
  if (result.status !== 0) {
    return {
      version: null,
      error: output || `cloudflared --version exited with status ${String(result.status)}`
    };
  }

  return { version: output || "cloudflared version unknown", error: null };
}

export function resolveCloudflared(config: CloudflaredConfig): TunnelDiagnostics {
  const download = selectCloudflaredDownload();
  const installPath = getManagedCloudflaredPath(config.dataDir);
  const lastErrors: string[] = [];

  for (const candidate of getCloudflaredCandidateOrder(config)) {
    if (!isUsableFile(candidate.path)) {
      lastErrors.push(`${candidate.source} path is not usable: ${candidate.path}`);
      continue;
    }

    const version = readCloudflaredVersion(candidate.path);
    if (version.version) {
      return {
        mode: config.mode,
        publicUrl: config.publicRacerUrl,
        tunnelName: config.tunnelName,
        hasToken: Boolean(config.token),
        binaryPath: candidate.path,
        binarySource: candidate.source,
        cloudflaredVersion: version.version,
        installPath,
        downloadUrl: download?.url ?? null,
        supportedPlatform: Boolean(download),
        message: "cloudflared is ready",
        lastError: null
      };
    }

    lastErrors.push(`${candidate.source} path failed: ${version.error ?? "unknown error"}`);
  }

  return {
    mode: config.mode,
    publicUrl: config.publicRacerUrl,
    tunnelName: config.tunnelName,
    hasToken: Boolean(config.token),
    binaryPath: null,
    binarySource: "missing",
    cloudflaredVersion: null,
    installPath,
    downloadUrl: download?.url ?? null,
    supportedPlatform: Boolean(download),
    message: download
      ? "cloudflared is not installed for Roller Rumble yet"
      : `App-managed cloudflared install is not supported on ${os.platform()}/${os.arch()}`,
    lastError: lastErrors.at(-1) ?? null
  };
}

export function buildCloudflaredStartCommand(
  config: CloudflaredConfig,
  binaryPath: string,
  port: number
): CloudflaredCommand {
  if (config.mode === "token") {
    if (!config.token) {
      throw new Error("ROLLER_RUMBLE_TUNNEL_TOKEN is required when tunnel mode is token.");
    }
    if (!config.publicRacerUrl) {
      throw new Error("ROLLER_RUMBLE_PUBLIC_RACER_URL is required when tunnel mode is token.");
    }

    return {
      command: binaryPath,
      // The token is issued for one named tunnel, so cloudflared does not need the tunnel name here.
      args: ["tunnel", "--no-autoupdate", "run", "--token", config.token],
      publicUrl: config.publicRacerUrl
    };
  }

  return {
    command: binaryPath,
    args: ["tunnel", "--url", `http://127.0.0.1:${String(port)}`],
    publicUrl: null
  };
}

function downloadFile(url: string, destinationPath: string, redirectCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const statusCode = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
        response.resume();
        if (redirectCount > 5) {
          reject(new Error("Too many redirects while downloading cloudflared."));
          return;
        }
        const redirectUrl = new URL(response.headers.location, url).toString();
        void downloadFile(redirectUrl, destinationPath, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`cloudflared download failed with HTTP ${String(statusCode)}`));
        return;
      }

      const output = fs.createWriteStream(destinationPath);
      response.pipe(output);
      output.on("finish", () => {
        output.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      output.on("error", reject);
    });

    request.on("error", reject);
  });
}

function findExtractedCloudflared(searchDir: string): string | null {
  const entries = fs.readdirSync(searchDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(searchDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExtractedCloudflared(entryPath);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && entry.name === "cloudflared") {
      return entryPath;
    }
  }

  return null;
}

export async function installCloudflared(config: CloudflaredConfig): Promise<TunnelDiagnostics> {
  const download = selectCloudflaredDownload();
  const installPath = getManagedCloudflaredPath(config.dataDir);
  if (!download || !installPath) {
    return resolveCloudflared(config);
  }

  const installDir = path.dirname(installPath);
  const tempDir = path.join(config.dataDir, "tools", "cloudflared", ".tmp");
  fs.mkdirSync(tempDir, { recursive: true });

  const downloadPath = path.join(
    tempDir,
    download.archiveType === "exe" ? "cloudflared.exe" : "cloudflared.tgz"
  );
  await downloadFile(download.url, downloadPath);

  // This directory is owned entirely by the app-managed installer, so replacing it is safe.
  fs.rmSync(installDir, { recursive: true, force: true });
  fs.mkdirSync(installDir, { recursive: true });

  if (download.archiveType === "exe") {
    fs.copyFileSync(downloadPath, installPath);
  } else {
    const extractResult = spawnSync("tar", ["-xzf", downloadPath, "-C", installDir], {
      encoding: "utf8"
    });
    if (extractResult.error) {
      throw extractResult.error;
    }
    if (extractResult.status !== 0) {
      throw new Error(extractResult.stderr || "Failed to extract cloudflared archive.");
    }

    const extractedPath = findExtractedCloudflared(installDir);
    if (!extractedPath) {
      throw new Error("Downloaded cloudflared archive did not contain a cloudflared binary.");
    }
    if (extractedPath !== installPath) {
      fs.copyFileSync(extractedPath, installPath);
    }
    fs.chmodSync(installPath, 0o755);
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  return resolveCloudflared(config);
}
