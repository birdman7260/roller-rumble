import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadDotenvFiles } from "./load-env.mjs";

const rootDir = process.cwd();
const packageDir = path.join(rootDir, "tools", "photo-booth-agent");
const packageNodeModules = path.join(packageDir, "node_modules");
const packageLockfile = path.join(packageDir, "pnpm-lock.yaml");
const corepackCommand = process.platform === "win32" ? "corepack.cmd" : "corepack";

function createPhotoBoothEnv() {
  const env = { ...process.env };
  const configuredDataDir = env.GOLDSPRINTS_BOOTH_DATA_DIR;
  if (!configuredDataDir) {
    env.GOLDSPRINTS_BOOTH_DATA_DIR = path.join(rootDir, ".goldsprints-booth");
    return env;
  }

  env.GOLDSPRINTS_BOOTH_DATA_DIR = path.isAbsolute(configuredDataDir)
    ? configuredDataDir
    : path.resolve(rootDir, configuredDataDir);
  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    stdio: "inherit",
    env: options.env ?? process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function runPhotoBoothPackageScript(scriptName, forwardedArgs = []) {
  loadDotenvFiles({ rootDir, profile: "photo-booth" });
  const env = createPhotoBoothEnv();
  if (!fs.existsSync(packageNodeModules)) {
    const installArgs = ["pnpm", "--dir", packageDir, "install"];
    if (fs.existsSync(packageLockfile)) {
      installArgs.push("--frozen-lockfile");
    }
    run(corepackCommand, installArgs);
  }

  run(corepackCommand, ["pnpm", "--dir", packageDir, "run", scriptName, ...forwardedArgs], { env });
}
