import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureRuntimeEnvFile,
  loadDotenvFiles,
  reloadDotenvFiles,
  resetEnvProvenanceForTesting,
  writeManagedEnvValue,
  writeWebPushEnvValues
} from "./env";

const testKeys = [
  "ROLLER_RUMBLE_ENV_TEST_BASE",
  "ROLLER_RUMBLE_ENV_TEST_LOCAL",
  "ROLLER_RUMBLE_ENV_TEST_SHELL"
] as const;

const originalValues = new Map<string, string | undefined>();

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "roller-rumble-env-"));
}

describe("dotenv runtime loading", () => {
  beforeEach(() => {
    resetEnvProvenanceForTesting();
    for (const key of testKeys) {
      originalValues.set(key, process.env[key]);
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    for (const key of testKeys) {
      const original = originalValues.get(key);
      if (original == null) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = original;
      }
    }
    originalValues.clear();
  });

  it("loads .env.local after .env and allows later search dirs to override earlier dotenv files", () => {
    const projectDir = makeTempDir();
    const appDataDir = makeTempDir();
    fs.writeFileSync(
      path.join(projectDir, ".env"),
      [
        "ROLLER_RUMBLE_ENV_TEST_BASE=project-env",
        "ROLLER_RUMBLE_ENV_TEST_LOCAL=project-env",
        ""
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(projectDir, ".env.local"),
      ["ROLLER_RUMBLE_ENV_TEST_LOCAL=project-local", ""].join("\n")
    );
    fs.writeFileSync(
      path.join(appDataDir, ".env.local"),
      ["ROLLER_RUMBLE_ENV_TEST_LOCAL=appdata-local", ""].join("\n")
    );

    const loadedFiles = loadDotenvFiles({ searchDirs: [projectDir, appDataDir] });

    expect(loadedFiles).toEqual([
      path.join(projectDir, ".env"),
      path.join(projectDir, ".env.local"),
      path.join(appDataDir, ".env.local")
    ]);
    expect(process.env.ROLLER_RUMBLE_ENV_TEST_BASE).toBe("project-env");
    expect(process.env.ROLLER_RUMBLE_ENV_TEST_LOCAL).toBe("appdata-local");
  });

  it("preserves shell-provided environment variables", () => {
    const projectDir = makeTempDir();
    process.env.ROLLER_RUMBLE_ENV_TEST_SHELL = "shell-value";
    fs.writeFileSync(
      path.join(projectDir, ".env.local"),
      ["ROLLER_RUMBLE_ENV_TEST_SHELL=dotenv-value", ""].join("\n")
    );

    loadDotenvFiles({ searchDirs: [projectDir] });

    expect(process.env.ROLLER_RUMBLE_ENV_TEST_SHELL).toBe("shell-value");
  });

  it("creates a starter .env.local file without replacing an existing one", () => {
    const appDataDir = makeTempDir();
    const envFilePath = path.join(appDataDir, ".env.local");

    const created = ensureRuntimeEnvFile(envFilePath);

    expect(created.exists).toBe(true);
    expect(fs.readFileSync(envFilePath, "utf8")).toContain("ROLLER_RUMBLE_LOCAL_SERVER_HOST");

    fs.writeFileSync(envFilePath, "ROLLER_RUMBLE_ENV_TEST_LOCAL=custom\n");
    ensureRuntimeEnvFile(envFilePath);

    expect(fs.readFileSync(envFilePath, "utf8")).toBe("ROLLER_RUMBLE_ENV_TEST_LOCAL=custom\n");
  });

  it("writes Web Push keys into the env file without removing existing settings", () => {
    const appDataDir = makeTempDir();
    const envFilePath = path.join(appDataDir, ".env.local");
    fs.writeFileSync(
      envFilePath,
      [
        "ROLLER_RUMBLE_LOCAL_SERVER_HOST=192.168.1.42",
        "# ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY=",
        "# ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY=",
        "# ROLLER_RUMBLE_WEB_PUSH_SUBJECT=mailto:you@example.com",
        ""
      ].join("\n")
    );

    writeWebPushEnvValues(envFilePath, {
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:roller-rumble@example.com"
    });

    const content = fs.readFileSync(envFilePath, "utf8");
    expect(content).toContain("ROLLER_RUMBLE_LOCAL_SERVER_HOST=192.168.1.42");
    expect(content).toContain("ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY=public-key");
    expect(content).toContain("ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY=private-key");
    expect(content).toContain("ROLLER_RUMBLE_WEB_PUSH_SUBJECT=mailto:roller-rumble@example.com");
  });

  it("writes a single managed key while leaving comments and unrelated lines intact", () => {
    const appDataDir = makeTempDir();
    const envFilePath = path.join(appDataDir, ".env.local");
    fs.writeFileSync(
      envFilePath,
      [
        "# Cloudflare tunnel",
        "# ROLLER_RUMBLE_TUNNEL_TOKEN=",
        "ROLLER_RUMBLE_LOCAL_SERVER_HOST=192.168.1.42",
        ""
      ].join("\n")
    );

    writeManagedEnvValue(envFilePath, "ROLLER_RUMBLE_TUNNEL_TOKEN", "abc.def.ghi");

    const content = fs.readFileSync(envFilePath, "utf8");
    expect(content).toContain("# Cloudflare tunnel");
    expect(content).toContain("ROLLER_RUMBLE_TUNNEL_TOKEN=abc.def.ghi");
    // The commented placeholder is replaced in place, not duplicated.
    expect(content.match(/ROLLER_RUMBLE_TUNNEL_TOKEN=/g)).toHaveLength(1);
    expect(content).toContain("ROLLER_RUMBLE_LOCAL_SERVER_HOST=192.168.1.42");
  });

  it("creates an absent runtime env file on first managed write", () => {
    const appDataDir = makeTempDir();
    const envFilePath = path.join(appDataDir, ".env.local");
    expect(fs.existsSync(envFilePath)).toBe(false);

    writeManagedEnvValue(envFilePath, "ROLLER_RUMBLE_PUBLIC_RACER_URL", "https://example.com/racer");

    expect(fs.existsSync(envFilePath)).toBe(true);
    expect(fs.readFileSync(envFilePath, "utf8")).toContain(
      "ROLLER_RUMBLE_PUBLIC_RACER_URL=https://example.com/racer"
    );
  });

  it("refuses to write a non-managed (advanced) env key", () => {
    const envFilePath = path.join(makeTempDir(), ".env.local");
    expect(() => writeManagedEnvValue(envFilePath, "ROLLER_RUMBLE_SERVER_PORT", "4000")).toThrow();
  });

  it("reload picks up a file edit while a genuine shell override still wins", () => {
    const projectDir = makeTempDir();
    const envFilePath = path.join(projectDir, ".env.local");
    fs.writeFileSync(
      envFilePath,
      [
        "ROLLER_RUMBLE_ENV_TEST_BASE=first",
        "ROLLER_RUMBLE_ENV_TEST_SHELL=file-value",
        ""
      ].join("\n")
    );
    // A genuine shell override is present before any file load.
    process.env.ROLLER_RUMBLE_ENV_TEST_SHELL = "shell-value";

    loadDotenvFiles({ searchDirs: [projectDir] });
    expect(process.env.ROLLER_RUMBLE_ENV_TEST_BASE).toBe("first");
    expect(process.env.ROLLER_RUMBLE_ENV_TEST_SHELL).toBe("shell-value");

    // Operator hand-edits the file, then reloads.
    fs.writeFileSync(
      envFilePath,
      [
        "ROLLER_RUMBLE_ENV_TEST_BASE=second",
        "ROLLER_RUMBLE_ENV_TEST_SHELL=file-value-2",
        ""
      ].join("\n")
    );
    reloadDotenvFiles({ searchDirs: [projectDir] });

    // The file-sourced value is refreshed; the shell override is preserved.
    expect(process.env.ROLLER_RUMBLE_ENV_TEST_BASE).toBe("second");
    expect(process.env.ROLLER_RUMBLE_ENV_TEST_SHELL).toBe("shell-value");
  });
});
