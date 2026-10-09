# cross-env

| Package   | Installed | Target |
| --------- | --------- | ------ |
| cross-env | 7.0.3     | 10.1.0 |

Usage in the repo: there's a single call site, `apps/desktop/scripts/run-dev.mjs:8`, `:10` and `:12`. The three `electronCommands` strings each run `cross-env KEY=value ... electron ...` and are spawned through `concurrently`. They're reached from `apps/desktop/package.json:9-11` (`dev`, `dev:debug`, `dev:debug:break`). The only manifest entry is `apps/desktop/package.json:90` (`"cross-env": "^7.0.3"`). Nothing imports cross-env as a module, and `cross-env-shell` isn't used anywhere. No `@types/cross-env` either.

Searches run on `apps/`, `packages/`, `tools/`, `scripts/`, the root `package.json` and `.github/`, excluding `node_modules` and `dist`:

- `cross-env`
- `cross-env-shell`
- `from 'cross-env` / `require('cross-env`
- `${VAR:-` (the default-value syntax)

Only the call site and manifest entry listed above came back.

## cross-env 7.0.4 / 8.0.0 / 9.0.0

Nothing in scope. These git tags exist (`v7.0.4`, `v8.0.0` and `v9.0.0`, all dated 2025-07-25), but none were published to npm or given a GitHub Release. `npm view cross-env versions` jumps straight from `7.0.3` to `10.0.0`. v9.0.0 was a manual release-tooling commit whose body says "BREAKING CHANGE: I will fix up these notes soon". The v10.0.0 notes say the release "should have been v8 except I had some issues with automated releases", so all their changes are covered under 10.0.0 below. ([source](https://github.com/kentcdodds/cross-env/releases/tag/v10.0.0), [v9.0.0 tag commit](https://github.com/kentcdodds/cross-env/tree/v9.0.0))

## cross-env 10.0.0

- **requirement**: Node.js >=20 (`engines.node: ">=20"`). ([source](https://github.com/kentcdodds/cross-env/releases/tag/v10.0.0))
  - not used / already satisfied:
    - cross-env runs as a CLI under the system Node, not Electron's Node. It's launched via `concurrently` from `node scripts/run-dev.mjs`.
    - Local Node is v22.22.3, and `.github/workflows/release.yml:63` pins `node-version: "22"`. The release workflow doesn't call cross-env anyway; it's dev-only.
    - No `engines` field in any repo `package.json` needs to change.
- **breaking (requirement)**: The package is now ESM-only (`"type": "module"`), and CommonJS support is gone. `exports` only provides `import` conditions for `.`, `./bin/cross-env` and `./bin/cross-env-shell`. The bins moved to `dist/bin/cross-env.js` and `dist/bin/cross-env-shell.js`. ([source](https://github.com/kentcdodds/cross-env/releases/tag/v10.0.0))
  - not used: searched `require('cross-env`, `from 'cross-env`, `cross-env/src`, `cross-env/dist` and `cross-env-shell`. The repo only invokes the `cross-env` bin by name through `node_modules/.bin`, which pnpm regenerates, so the moved bin paths don't matter.
- **behavior change**: The TypeScript rewrite (#261) changed some parsing edge cases. Empty-string command arguments are now dropped (`commandArgs = cStart.slice(1).filter(Boolean)`). If there's no command after the env setters, it now throws an `invariant` error ("Command is required"). An env setter with an empty unquoted value (`FOO=`) now becomes `''` instead of `undefined`. Signal forwarding and exit-code handling are the same as in 7.0.3. ([source: v10.1.0 src/index.ts](https://github.com/kentcdodds/cross-env/blob/v10.1.0/src/index.ts), compared with [v7.0.3 src/index.js](https://github.com/kentcdodds/cross-env/blob/v7.0.3/src/index.js))
  - not used: none of the three `run-dev.mjs` commands pass an empty argument, an empty `KEY=` setter, or setters without a command. Every one ends in `electron <args> src/electron/main.ts`, and every setter has a non-empty value (`NODE_OPTIONS=--import=tsx`, `ELECTRON_RENDERER_URL=http://127.0.0.1:5173`, `ROLLER_RUMBLE_DEBUG=1`, `ROLLER_RUMBLE_OPEN_DEVTOOLS=1`).

## cross-env 10.1.0

- **behavior change**: Adds support for the default-value syntax `${VAR:-default}` in commands. On Windows, cross-env now replaces `${VAR:-default}` with the value of `VAR`, or with `default` when `VAR` is unset. Before, the simple-variable regex mangled this syntax. On non-Windows platforms the command still goes through unchanged and the shell expands it. ([source](https://github.com/kentcdodds/cross-env/releases/tag/v10.1.0), [src/command.ts](https://github.com/kentcdodds/cross-env/blob/v10.1.0/src/command.ts))
  - not used: searched `\$\{[A-Z_]+:-` and `${` in `apps/desktop/scripts/run-dev.mjs`. No command passed to cross-env contains `$` variable references.

No item needs a code change. The upgrade only bumps `apps/desktop/package.json:90` to `"cross-env": "^10.1.0"` and refreshes `pnpm-lock.yaml`. To check it, run `pnpm dev` and confirm Electron starts with `ELECTRON_RENDERER_URL` set, so the admin window loads from Vite.
