# concurrently

| Package      | Installed | Target |
| ------------ | --------- | ------ |
| concurrently | 9.2.1     | 10.0.6 |

Repo usage (the only one): `apps/desktop/package.json:89` declares `"concurrently": "^9.1.2"` (devDependency; bump the range to `^10.0.6`). `apps/desktop/scripts/run-dev.mjs:24-33` spawns the `concurrently` **bin** (never imported as a library) with argv `["-k", "--success", "first", "vite --strictPort", <electronCommand>]`, where `<electronCommand>` is `wait-on tcp:5173 && cross-env ... electron ... src/electron/main.ts` (lines 8-12). It's reached via `pnpm dev`, `dev:debug` and `dev:debug:break` (root `package.json:9-11` → `apps/desktop/package.json:9-11`). Flags passed: `-k` (`--kill-others`) and `--success first`. Both still exist unchanged in 10.0.6 (checked `dist/bin/index.js` in the 10.0.6 tarball: `'kill-others': { alias: 'k' }` and `success: { alias: 's' }` with `first`). Searches across `apps/`, `packages/`, `tools/`, `scripts/` and config (excluding `node_modules`, `dist`) for `concurrently` found only these two files.

Releases 9.2.2-9.2.5 are 9.x backports published alongside the 10.x line. They're semver-in-range, so they're listed for completeness. The upgrade jumps straight to 10.0.6, which already contains their fixes.

## concurrently 9.2.2

Nothing in scope. Not published to npm. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v9.2.2))

## concurrently 9.2.3

Nothing in scope. Security-only update to the `shell-quote` dependency (#591, #596). ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v9.2.3))

## concurrently 9.2.4

Nothing in scope. Upgrades `shell-quote` to 1.9.0 (#597, #600). ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v9.2.4))

## concurrently 9.2.5

Nothing in scope. Updates `shell-quote` to 1.12.0 (#622). ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v9.2.5))

## concurrently 10.0.0

- **requirement**: dropped support for Node.js <22.0.0. 10.0.6 declares `engines: { node: ">=22" }`. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.0))
  - not affected (requirement already met): `mise.toml` pins `node = "22"`, `README.md:346` states "Node.js 22 is the project runtime version", `.github/workflows/release.yml:63` uses `node-version: "22"`, and local `node -v` is v22.22.3. No `engines` field or `engine-strict` in the repo (searched `"engines"` and `engine-strict` in `package.json`, `apps/desktop/package.json` and `.npmrc`; none found). No change needed.
- **requirement / breaking**: concurrently is now ESM-only. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.0))
  - not used: searched `require("concurrently`, `from "concurrently` and `import(` of concurrently in `apps`, `packages`, `tools` and `scripts`. Nothing found. The repo only runs the CLI bin (`run-dev.mjs:24-28`), which is unaffected by the module format. The 10.0.6 tarball's `bin` entry still exists.
- **behavior change**: prefix colors now default to `auto` instead of `reset`. Each command's `[0]`/`[1]` prefix is colored from a cyan/magenta/green/yellow/blue palette. Pass `-c reset` to restore uncolored prefixes. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.0), [PR #581](https://github.com/open-cli-tools/concurrently/pull/581))
  - [ ] affected: `apps/desktop/scripts/run-dev.mjs:29` passes no `-c`/`--prefix-colors`. The `[0]` (vite) and `[1]` (electron) prefixes in `pnpm dev` output will now be colored. No code change is required (the new colored output is the intended improvement). Only if monochrome output is wanted, change the argv to `["-k", "--success", "first", "-c", "reset", "vite --strictPort", electronCommand]`. Recommended action: accept the new default and make no edit. Tick once you've confirmed the dev output looks right.
- **breaking**: removed the CLI flag `--name-separator` (use commas) and the API option `killOthers` (use `killOthersOn`). ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.0))
  - not used: searched `name-separator` and `killOthers`. Nothing found. The repo uses the CLI flag `-k`/`--kill-others`, which is **not** removed (verified in the 10.0.6 `dist/bin/index.js`).
- **behavior change**: shell resolution is now `--shell` flag → `npm_config_script_shell` env var (inherited from npm/pnpm/yarn v1 `script-shell` config) → `/bin/sh` (`cmd.exe` on Windows). Previously concurrently always used `/bin/sh`/`cmd.exe`. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.0), [PR #589](https://github.com/open-cli-tools/concurrently/pull/589), [shell-resolution doc](https://github.com/open-cli-tools/concurrently/blob/v10.0.6/docs/shell-resolution.md))
  - not affected: searched `script-shell` and `script_shell` across the repo and `.npmrc` (no repo `.npmrc` exists). Nothing found. `pnpm config get script-shell` returns `undefined` and `npm config get script-shell` returns `null`, so commands still run under `/bin/sh` and the `&&` chain in `run-dev.mjs:8-12` behaves as before. No change needed. (A developer with a personal `script-shell` set to a POSIX shell would still be fine.)
- **behavior change**: quote normalization (stripping outer quotes from commands) now applies only to CLI input, not to the library API. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.0), [PR #585](https://github.com/open-cli-tools/concurrently/pull/585))
  - not affected: the repo uses the CLI, where normalization still applies. The commands in `run-dev.mjs:8-12,29` contain no wrapping quotes (searched them for `"` and `'` inside the command strings; none). No change needed.
- **behavior change**: concurrently no longer throws when a named color doesn't exist (#580). It also now warns when running from a Snap-installed Node (#584). ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.0))
  - not used: no `-c`/`--prefix-colors`/`prefixColors` anywhere (searched `prefix-colors` and `prefixColors`). Node comes from mise, not Snap, on macOS. No change needed.

## concurrently 10.0.1

Nothing in scope. Exports the `FlowController` type (#594), which matters only for API users. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.1))

## concurrently 10.0.2

Nothing in scope. Test release to restore Trusted Publishing; not published to npm. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.2))

## concurrently 10.0.3

Nothing in scope. Republish of 10.0.1 with Trusted Publishing (#595). ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.3))

## concurrently 10.0.4

- **behavior change**: with `killTimeout`/`--kill-timeout` set, the force-kill timer no longer keeps concurrently alive after all processes stop cooperatively, so exit no longer waits out the full timeout. ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.4), [PR #601](https://github.com/open-cli-tools/concurrently/pull/601))
  - not used: searched `kill-timeout` and `killTimeout`. Nothing found. `run-dev.mjs:29` uses `-k` without a kill timeout. No change needed.
- Also upgrades `shell-quote` to 1.9.0 (#599). Not in scope.

## concurrently 10.0.5

- **behavior change**: non-ASCII output now renders correctly on Windows (#604). Wildcard commands (`npm:dev:*`) now expand from `package.json5` when `package.json` is missing (#608). ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.5))
  - not used: searched `npm:`/`pnpm:` wildcard shorthands in `run-dev.mjs` (none) and `package.json5` (none exist). Dev runs on macOS, and the Windows path (`concurrently.cmd`, `run-dev.mjs:24`) only benefits. No change needed.

## concurrently 10.0.6

- **behavior change**: with `killTimeout` set, concurrently no longer logs `Sending SIGKILL to 0 processes..` when no processes remain (#616). ([source](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.6), [PR #616](https://github.com/open-cli-tools/concurrently/pull/616))
  - not used: searched `kill-timeout` and `killTimeout`. Nothing found. No change needed.
- Also docs updates (#609, #611) and `shell-quote` 1.12.0 (#622). Not in scope.
