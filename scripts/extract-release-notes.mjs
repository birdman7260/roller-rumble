#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const changelogPath = path.join(rootDir, "CHANGELOG.md");
const tagOrVersion = process.argv[2];
const outputPath = process.argv[3];

if (!tagOrVersion || !outputPath) {
  console.error("Usage: node scripts/extract-release-notes.mjs v0.1.0 release-notes.md");
  process.exit(1);
}

const version = tagOrVersion.replace(/^v/, "");
const changelog = fs.readFileSync(changelogPath, "utf8");
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sectionPattern = new RegExp(
  `^## ${escapedVersion} - [^\\n]+\\n([\\s\\S]*?)(?=^## |\\s*$)`,
  "m"
);
const match = sectionPattern.exec(changelog);

if (!match) {
  console.error(`Could not find CHANGELOG.md notes for ${version}.`);
  process.exit(1);
}

const body = match[1].trim();
const notes = [
  body,
  "",
  "## Downloads",
  "",
  "- Windows users: download the `.exe` installer.",
  "- Mac users: download the `.dmg` file.",
  "",
  "## Install Notes",
  "",
  "- Windows may show a SmartScreen warning until Roller Rumble is code-signed. Choose `More info`, then `Run anyway` if you trust this build.",
  "- macOS may require right-clicking the app and choosing `Open` until the app is signed and notarized."
].join("\n");

fs.writeFileSync(outputPath, `${notes}\n`);
