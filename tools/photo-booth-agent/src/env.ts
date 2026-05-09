import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function envFileNames(profile: string): string[] {
  return [".env", ".env.local", `.env.${profile}`, `.env.${profile}.local`];
}

function loadDotenvFilesFrom(dir: string, shellProvidedKeys: Set<string>): void {
  for (const fileName of envFileNames("photo-booth")) {
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = dotenv.parse(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
      // The launcher may pass resolved paths into this package, so do not override
      // values that already existed before direct package dotenv loading began.
      if (!shellProvidedKeys.has(key)) {
        process.env[key] = value;
      }
    }
  }
}

function isGoldSprintsRepoRoot(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "package.json")) &&
    fs.existsSync(path.join(dir, "tools", "photo-booth-agent", "package.json"))
  );
}

export function loadBoothDotenv(): void {
  const shellProvidedKeys = new Set(Object.keys(process.env));
  const sourcePath = fileURLToPath(import.meta.url);
  const packageDir = path.resolve(path.dirname(sourcePath), "..");
  const repoRoot = path.resolve(packageDir, "..", "..");

  if (isGoldSprintsRepoRoot(repoRoot)) {
    loadDotenvFilesFrom(repoRoot, shellProvidedKeys);
  }
  loadDotenvFilesFrom(packageDir, shellProvidedKeys);
}
