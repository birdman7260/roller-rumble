import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

interface DotenvLoadOptions {
  rootDir?: string;
  profile?: string;
}

function envFileNames(profile?: string): string[] {
  return [".env", ".env.local", ...(profile ? [`.env.${profile}`, `.env.${profile}.local`] : [])];
}

export function loadDotenvFiles(options: DotenvLoadOptions = {}): string[] {
  const rootDir = options.rootDir ?? process.cwd();
  const shellProvidedKeys = new Set(Object.keys(process.env));
  const loadedFiles: string[] = [];

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

  return loadedFiles;
}
