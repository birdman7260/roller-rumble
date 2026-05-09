import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function envFileNames(profile) {
  return [".env", ".env.local", ...(profile ? [`.env.${profile}`, `.env.${profile}.local`] : [])];
}

export function loadDotenvFiles({ rootDir = process.cwd(), profile } = {}) {
  const shellProvidedKeys = new Set(Object.keys(process.env));
  const loadedFiles = [];

  for (const fileName of envFileNames(profile)) {
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = dotenv.parse(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
      // Real shell variables should always beat repo dotenv files, but later dotenv files
      // are allowed to override earlier dotenv files for the usual .env.local workflow.
      if (!shellProvidedKeys.has(key)) {
        process.env[key] = value;
      }
    }
    loadedFiles.push(filePath);
  }

  return loadedFiles;
}
