# dotenv

| Package | Installed | Target |
| ------- | --------- | ------ |
| dotenv  | 17.4.2    | 18.0.6 |

Ranges to bump: `package.json:44`, `apps/desktop/package.json:54`, `tools/photo-booth-agent/package.json:17` (separate install, own `tools/photo-booth-agent/pnpm-lock.yaml`; install with `--ignore-workspace`).

The repo calls only `dotenv.parse(buffer)`, at three sites. None of them calls `config()`, `configDotenv()`, `populate()`, `dotenv/config`, the `dotenv` CLI, `-r dotenv/config`, or any `DOTENV_*` variable:

- `scripts/load-env.mjs:3,19`
- `apps/desktop/src/backend/env.ts:3,289`
- `tools/photo-booth-agent/src/env.ts:4,17`

Each one does its own shell-wins/override merge into `process.env`, so dotenv's `override`, `quiet`, `path` arrays, `processEnv`, and log output never come into play. I checked the published source: the default `parse()` (no `fast` option) is byte-for-byte the same regex parser as 17.4.2 in every 18.x release (`parse(src, options)` calls `parseRegex(src)` unless `options.fast` is truthy).

Repo-wide search (excluding `node_modules`, `dist`, `.git`, `.scratch`) for `dotenv|DOTENV_` turned up only the three sites above, the three package.json ranges, docs prose (README.md, CONTEXT.md, docs/), and the `dotenvSearchDirs` option name (`apps/desktop/src/backend/server.ts`, `services/app.ts`, `electron/main.ts`), which is unrelated to the package API.

## dotenv 18.0.0

- **breaking** — `.env.vault` support removed: the `DOTENV_KEY` config option and `process.env.DOTENV_KEY` handling, the exported `decrypt()` function, and the `INVALID_DOTENV_KEY` / `NOT_FOUND_DOTENV_ENVIRONMENT` / `DECRYPTION_FAILED` / `MISSING_DATA` error codes are gone ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1800-2026-09-17), [PR #1033](https://github.com/motdotla/dotenv/pull/1033))
  - not used: searched `DOTENV_KEY`, `.env.vault`, `decrypt(`, `INVALID_DOTENV_KEY`, `DECRYPTION_FAILED` (no hits)
- **breaking** — Preloading removed: the `dotenv_config_*` argv options (`lib/cli-options`) and `node -r dotenv/config` preload flow are gone. Use `dotenv run -- <cmd>` instead ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1800-2026-09-17), [PR #1035](https://github.com/motdotla/dotenv/pull/1035))
  - not used: searched `-r dotenv`, `--require dotenv`, `dotenv/config`, `dotenv_config_` across package.json scripts, `scripts/*.mjs`, apps/, packages/, tools/ (no hits)
- **requirement** — Package layout changed: `main`/`exports["."]` moves from `lib/main.js` to a bundled `dist/index.cjs` (CJS, still `engines.node >=12`), and types move to `dist/index.d.ts`. The `./lib/env-options(.js)` and `./lib/cli-options(.js)` export subpaths are removed, so only `.`, `./config`, `./config.js` and `./package.json` stay exported. `dist/index.cjs` starts with a `#!/usr/bin/env node` shebang (it doubles as the `dotenv` bin) and eagerly `require`s `child_process` on load ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/package.json), compare [v17.4.2...v18.0.6](https://github.com/motdotla/dotenv/compare/v17.4.2...v18.0.6))
  - not used: searched `dotenv/lib`, `env-options`, `cli-options` (no deep imports). All three sites use the default import `import dotenv from "dotenv"`. The new `dist/index.d.ts`, like the old one, has only named exports, and the default import still type-checks through `esModuleInterop`/`allowSyntheticDefaultImports` in `tsconfig.base.json:7-8`. At runtime it resolves to `module.exports` in Node ESM, tsx and vitest. In the Electron build, `apps/desktop/tsup.electron.config.ts` leaves `dotenv` external (it's a dependency and isn't listed in `noExternal`), so the shebang and the `child_process` require are never bundled into a renderer. No renderer or kiosk code imports the env modules.
- **behavior change** — The "injected env" log line now goes to **stderr** instead of stdout, and the rotating tips are removed ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1800-2026-09-17), [PR #1037](https://github.com/motdotla/dotenv/pull/1037), [PR #1031](https://github.com/motdotla/dotenv/pull/1031))
  - not used: the log only comes from `config()`/`dotenv run`. Searched `config(`, `configDotenv`, `injected env`, `injecting env`, `◇` in apps/, packages/, tools/, scripts/ (no dotenv hits, and no tests assert on dotenv output)
- **behavior change** — `config()` now also reads options from `DOTENV_<OPT>` env vars (`DOTENV_PATH`, `DOTENV_QUIET`, `DOTENV_DEBUG`, `DOTENV_OVERRIDE`, `DOTENV_ENCODING`, `DOTENV_FAST`), which take precedence over `DOTENV_CONFIG_<OPT>` ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1800-2026-09-17), compare [v17.4.2...v18.0.6](https://github.com/motdotla/dotenv/compare/v17.4.2...v18.0.6) `lib/config-options.js`)
  - not used: searched `DOTENV_` in code and `.env*` files (no hits), and `config()` is never called
- **behavior change** (additive) — New opt-in fast parser via `parse(src, { fast: true })`, `config({ fast: true })`, `--fast`, or `DOTENV_FAST=true`. It's off by default, so `parse(src)` keeps the classic regex parser ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1800-2026-09-17), [PR #1010](https://github.com/motdotla/dotenv/pull/1010))
  - not used: searched `fast:` next to `dotenv.parse`. All three call sites pass no options, so parsing output is unchanged.
- **behavior change** (additive) — New `dotenv run -- <cmd>` CLI ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1800-2026-09-17), [PR #1022](https://github.com/motdotla/dotenv/pull/1022))
  - not used: searched `dotenv run` in package.json scripts and `scripts/` (no hits)

## dotenv 18.0.1

- **behavior change** — `config({ path })` with a file `URL` no longer throws `ERR_INVALID_ARG_TYPE` while formatting the log line, and the original `ENOENT` is preserved ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1801-2026-09-18), [PR #1054](https://github.com/motdotla/dotenv/pull/1054))
  - not used: `config(` is never called

## dotenv 18.0.2

- **behavior change** — Fixes edge cases in the fast parser only ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1802-2026-09-21), [PR #1056](https://github.com/motdotla/dotenv/pull/1056))
  - not used: the fast parser is opt-in and no call site passes `{ fast: true }`

## dotenv 18.0.3

- **behavior change** — `DOTENV_QUIET` set inside the loaded `.env` file is now honored by `config()` ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1803-2026-09-22), [PR #1059](https://github.com/motdotla/dotenv/pull/1059))
  - not used: searched `DOTENV_QUIET`, `quiet` with dotenv (no hits), and `config(` is never called

## dotenv 18.0.4

- **behavior change** — `import 'dotenv/config'` defaults to `quiet: true` unless `DOTENV_QUIET`/`DOTENV_CONFIG_QUIET` is set ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1804-2026-09-25), [PR #1063](https://github.com/motdotla/dotenv/pull/1063))
  - not used: searched `dotenv/config` (no hits)

## dotenv 18.0.5

- **behavior change** — Adds a missing TypeScript module declaration for `dotenv/config` (`dist/config.d.ts`) ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1805-2026-09-30), [PR #1068](https://github.com/motdotla/dotenv/pull/1068))
  - not used: searched `dotenv/config` (no hits)
- **behavior change** — Fast-parser comment scans now stop at the line boundary, a performance-only change ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1805-2026-09-30), [PR #1066](https://github.com/motdotla/dotenv/pull/1066))
  - not used: the fast parser is not enabled anywhere

## dotenv 18.0.6

- **behavior change** — `populate()` (and so `config()`) now reads `debug`/`override` with `parseBoolean`, so string values such as `'false'`, `'0'`, `'no'`, `'off'` and `''` mean false. Before, `Boolean('false')` made them true ([source](https://github.com/motdotla/dotenv/blob/v18.0.6/CHANGELOG.md#1806-2026-10-06), [PR #1069](https://github.com/motdotla/dotenv/pull/1069))
  - not used: searched `populate(`, `override`, `debug:` with dotenv (no hits). The repo does its own override merge after `dotenv.parse`.
