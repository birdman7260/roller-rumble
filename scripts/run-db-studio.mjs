import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const studioDir = path.join(rootDir, "tools", "db-studio");
const studioNodeModules = path.join(studioDir, "node_modules");
const rootConfigPath = path.join(rootDir, "drizzle.config.ts");
const forwardedArgs = process.argv.slice(2);
const normalizedArgs = forwardedArgs[0] === "--" ? forwardedArgs.slice(1) : forwardedArgs;
const corepackCommand = process.platform === "win32" ? "corepack.cmd" : "corepack";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// The Studio package keeps its own Node-flavored better-sqlite3 build, so we
// only bootstrap it when its isolated install tree is missing.
if (!fs.existsSync(studioNodeModules)) {
  run(corepackCommand, ["pnpm", "--dir", studioDir, "install", "--frozen-lockfile"]);
}

const studioArgs = [
  "pnpm",
  "--dir",
  studioDir,
  "exec",
  "drizzle-kit",
  "studio",
  `--config=${rootConfigPath}`,
  ...normalizedArgs
];

run(corepackCommand, studioArgs);
