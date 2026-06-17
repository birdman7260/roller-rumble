import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureRuntimeEnvFile, loadDotenvFiles, writeWebPushEnvValues } from "./env";

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
});
