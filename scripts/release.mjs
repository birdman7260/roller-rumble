#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_TYPES = new Set(["patch", "minor", "major"]);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const rootPackagePath = path.join(rootDir, "package.json");
const desktopPackagePath = path.join(rootDir, "apps/desktop/package.json");
const changelogPath = path.join(rootDir, "CHANGELOG.md");

function run(command, args, options = {}) {
  const result = execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe"
  });

  return typeof result === "string" ? result.trim() : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assertCleanWorktree() {
  const status = run("git", ["status", "--porcelain"]);
  if (status) {
    throw new Error(
      [
        "Release requires a clean worktree.",
        "Commit or stash current changes first, including CHANGELOG.md updates.",
        "",
        status
      ].join("\n")
    );
  }
}

function assertOnBranch() {
  const branch = run("git", ["branch", "--show-current"]);
  if (!branch) {
    throw new Error("Release must be run from a branch, not a detached HEAD.");
  }

  return branch;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Expected package version to be plain semver, got "${version}".`);
  }

  return match.slice(1).map((part) => Number(part));
}

function bumpVersion(version, type) {
  const [major, minor, patch] = parseVersion(version);
  if (type === "major") {
    return `${major + 1}.0.0`;
  }
  if (type === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

function extractUnreleased(changelog) {
  const match = /^## Unreleased\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(changelog);
  if (!match) {
    throw new Error("CHANGELOG.md must contain a '## Unreleased' section.");
  }

  const body = match[1].trim();
  if (!/^\s*-\s+\S/m.test(body)) {
    throw new Error("Add at least one bullet under CHANGELOG.md -> Unreleased before releasing.");
  }

  return body;
}

function updateChangelog(version) {
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const body = extractUnreleased(changelog);
  const date = new Date().toISOString().slice(0, 10);
  const nextSection = [
    "## Unreleased",
    "",
    "### Added",
    "",
    "### Changed",
    "",
    "### Fixed",
    "",
    `## ${version} - ${date}`,
    "",
    body,
    ""
  ].join("\n");

  const nextChangelog = changelog.replace(
    /^## Unreleased\s*\n[\s\S]*?(?=^## |(?![\s\S]))/m,
    nextSection
  );
  fs.writeFileSync(changelogPath, nextChangelog);
}

function assertTagDoesNotExist(tagName) {
  try {
    run("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`]);
  } catch {
    return;
  }

  throw new Error(`Tag ${tagName} already exists.`);
}

function main() {
  const releaseType = process.argv[2];
  if (!RELEASE_TYPES.has(releaseType)) {
    throw new Error("Usage: pnpm release:patch | pnpm release:minor | pnpm release:major");
  }

  const branch = assertOnBranch();
  assertCleanWorktree();

  const rootPackage = readJson(rootPackagePath);
  const desktopPackage = readJson(desktopPackagePath);
  if (rootPackage.version !== desktopPackage.version) {
    throw new Error(
      `Root package version (${rootPackage.version}) and desktop package version (${desktopPackage.version}) must match.`
    );
  }

  const nextVersion = bumpVersion(rootPackage.version, releaseType);
  const tagName = `v${nextVersion}`;
  assertTagDoesNotExist(tagName);

  extractUnreleased(fs.readFileSync(changelogPath, "utf8"));
  rootPackage.version = nextVersion;
  desktopPackage.version = nextVersion;
  writeJson(rootPackagePath, rootPackage);
  writeJson(desktopPackagePath, desktopPackage);
  updateChangelog(nextVersion);

  run("git", ["add", "package.json", "apps/desktop/package.json", "CHANGELOG.md"], {
    stdio: "inherit"
  });
  run("git", ["commit", "-m", `chore: release ${tagName}`], { stdio: "inherit" });
  run("git", ["tag", "-a", tagName, "-m", `Roller Rumble ${tagName}`], { stdio: "inherit" });
  run("git", ["push", "origin", branch], { stdio: "inherit" });
  run("git", ["push", "origin", tagName], { stdio: "inherit" });

  console.log(`Release ${tagName} pushed. GitHub Actions will build and publish the release.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
