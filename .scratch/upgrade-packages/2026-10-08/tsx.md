# tsx

| Package | Installed | Target  |
| ------- | --------- | ------- |
| tsx     | 4.21.0    | 4.23.15 |

Both installs declare `"tsx": "^4.19.4"` (`apps/desktop/package.json:96`, `tools/photo-booth-agent/package.json:31`), which already admits 4.23.15. You only need to refresh the lockfiles: the root `pnpm-lock.yaml`, and `tools/photo-booth-agent/pnpm-lock.yaml`, which is a separate `--ignore-workspace` install.

How tsx is invoked in this repo (every entry point checked against each item below):

- `apps/desktop/scripts/run-dev.mjs:8,10,12`: `NODE_OPTIONS=--import=tsx electron src/electron/main.ts` runs the Electron main process through tsx's preload hooks. Electron is 35.7.5, which bundles **Node 22.16.0** (verified with `ELECTRON_RUN_AS_NODE=1 electron -p process.versions.node`). `run-dev.mjs` itself runs under plain `node`, not tsx.
- `apps/desktop/package.json:13-16`: `tsx src/backend/services/cloudflared-cli.ts {doctor,install,version}` and `tsx src/backend/services/notifications-cli.ts` run through the tsx CLI on the system Node, which is **v22.22.3** locally.
- `tools/photo-booth-agent/package.json:7-8`: `tsx src/agent.ts` and `tsx src/doctor.ts` run through the tsx CLI on the system Node.
- tsconfig that tsx reads: `tsconfig.base.json` sets `allowJs: false`, `module: ESNext`, `moduleResolution: Bundler` and `isolatedModules`. The only `paths` are `@renderer/*` and `@backend/*` (`apps/desktop/tsconfig.json:4-5`, `apps/desktop/tsconfig.node.json:4-5`), and no backend or electron source imports them. All packages are `"type": "module"`. There are no `.cts`/`.cjs` sources, no `tsx watch`, and no `tsx/esm/api` or `tsx/cjs/api` imports.

Requirement summary: `engines.node` stays `>=18.0.0` (4.21.0 and 4.23.15). The `esbuild` dependency moves from `~0.27.0` to `~0.28.0`. No peer dependencies are added. (`npm view tsx@4.21.0` / `npm view tsx@4.23.15` `engines dependencies peerDependencies`)

## tsx 4.21.1

- **requirement** — Adds support for Node 20.11/21.2 `import.meta` paths, Node 24.15.0, and Node 26.1.0 / 25.9.0. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.21.1))
  - not used: the runtimes here are Electron's Node 22.16.0 and system Node 22.22.3. None of the newly supported versions apply, and nothing changes for 22.x.

## tsx 4.22.0

- **requirement** — Upgrades the bundled esbuild to 0.28 (dependency `~0.27.0` → `~0.28.0`). esbuild 0.28.0 is a breaking release only because its install script now integrity-checks the fallback binary download. It also adds `with { type: 'text' }` imports and moves to Go 1.26. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.22.0), [esbuild 0.28.0](https://github.com/evanw/esbuild/releases/tag/v0.28.0))
  - not used: none of these needs a code change. Searched `onlyBuiltDependencies`, `ignoredBuiltDependencies`, `allowBuilds` and `neverBuiltDependencies` in the repo and got no hits. pnpm is 9.15.9, which runs esbuild's postinstall by default. The repo has no direct `esbuild` dependency (searched `apps/desktop/package.json` and `tools/photo-booth-agent/package.json`). Other tools (tsup, vite) keep their own `esbuild@0.27.7` and `0.25.12` entries in the lockfile, so a second esbuild version will appear in both lockfiles. That is expected.

## tsx 4.22.1

- **behavior change** — tsconfig `paths` aliases that contain a colon now resolve. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.22.1))
  - not used: the only aliases are `@renderer/*` and `@backend/*`, and neither contains a colon. Searched `@backend/` and `@renderer/` in `apps/desktop/src/backend` and `apps/desktop/src/electron` with no hits.

## tsx 4.22.2

- **behavior change** — Under the ESM hooks, CommonJS JSON `require` is preserved, named exports from CommonJS TypeScript are preserved, and `module.exports` require(esm) interop is supported. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.22.2))
  - not used: searched `require(`, `createRequire`, `.cts`, `.cjs` and `from "*.json"` in `apps/`, `packages/`, `tools/` and `scripts/`, with no hits in tsx-run code. All sources are ESM.

## tsx 4.22.3

- **behavior change** — The typed loader source is now decoded, and the entrypoint is preserved when TypeScript preload hooks are used. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.22.3))
  - not used (no code change): the preload path is `NODE_OPTIONS=--import=tsx` in `apps/desktop/scripts/run-dev.mjs:8,10,12`. This is a bug fix to that path and needs no config change. `pnpm dev` will exercise it.

## tsx 4.22.4

- **behavior change** — CommonJS directory requires (`require('./dir')`) inside dependencies now resolve. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.22.4), [#803](https://github.com/privatenumber/tsx/issues/803))
  - not used: this is a fix for `node_modules` code loaded through the hooks, and no repo code depends on the old failure. Searched `require(` in `apps/`, `packages/`, `tools/` and `scripts/` with no hits.

## tsx 4.22.5

- **behavior change** — Hook state is isolated per async `module.register()` registration. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.22.5))
  - not used: searched `module.register` and `registerHooks` with no hits.

## tsx 4.23.0

- **behavior change** — Module resolution skips redundant filesystem probes (performance). ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.0))
  - not used (no code change): this applies to every entry point and has no config. Relative imports in `apps/desktop/src/backend` and `apps/desktop/src/electron` keep resolving under `moduleResolution: Bundler`. Smoke-test with `pnpm dev`.

## tsx 4.23.1

- **behavior change** — On Node v22.22.3+, tsx now uses synchronous module hooks (`module.registerHooks`) instead of async `module.register`. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.1))
  - [ ] affected: the tsx CLI entry points run on system Node v22.22.3, which is exactly at the threshold, so they switch to the new sync-hook path. Electron's Node 22.16.0 stays on the async path, so `pnpm dev` is unchanged. No code change is needed, but smoke-test the sync path:
    - `apps/desktop/package.json:15`: run `pnpm --filter @roller-rumble/desktop cloudflared:version`, which has no side effects.
    - `tools/photo-booth-agent/package.json:8`: run `pnpm --dir tools/photo-booth-agent doctor`.
    - (`notifications:keys` at `apps/desktop/package.json:16` generates keys, so skip it unless you need it. The same loader path is already covered by the two runs above.)
- **behavior change** — `tsImport` now works after a global preload. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.1))
  - not used: searched `tsImport`, `tsx/esm` and `tsx/cjs` with no hits.
- **behavior change** — Watch mode no longer clears piped output, and it treats script and dependency paths literally. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.1))
  - not used: searched `tsx watch`, `"watch` and `--watch` in the `package.json` files with no tsx watch hits.
- **behavior change** — Lazy transform-cache indexing, lazy esbuild loading in the CLI, and direct mapping of Node TypeScript formats (performance). ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.1))
  - not used (no code change): this is internal to tsx and has no options to set.

## tsx 4.23.2

- **behavior change** — `tsx watch` now exits with 128 + the signal number when interrupted. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.2), [#820](https://github.com/privatenumber/tsx/issues/820))
  - not used: there is no `tsx watch` usage (same search as 4.23.1).

## tsx 4.23.3

- **behavior change** — tsx's patched `process.listenerCount` keeps Node's overload semantics. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.3), [#823](https://github.com/privatenumber/tsx/issues/823))
  - not used: searched `listenerCount` with no hits.

## tsx 4.23.4

- **behavior change** — The tsx CLI now runs its hidden signal-relay listener _before_ application listeners. Async `process.once("SIGINT"|"SIGTERM")` handlers therefore finish their cleanup and control the exit code. Previously tsx saw no remaining listeners and called `process.exit()` right away with 130. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.4), [PR #827](https://github.com/privatenumber/tsx/pull/827))
  - [ ] affected: `tools/photo-booth-agent/src/agent.ts:661-662` registers `process.once("SIGINT"/"SIGTERM", shutdown)`. Its async shutdown (`agent.ts:648-659`) stops the scanner, puts the lights into idle, shuts down the umbrella, then calls `process.exit(0)`. Under 4.21.0, `tsx src/agent.ts` probably exited with 130 before that cleanup ran. Now cleanup completes and the exit code becomes 0. No code change is needed, and this is the behavior the code intended. Verify by running `pnpm --dir tools/photo-booth-agent agent` and pressing Ctrl+C: the lights should go idle and the process should exit 0. If one of the awaited calls hangs, a first Ctrl+C will no longer kill the agent. Because the listener is `once`, a second Ctrl+C still exits.
  - not affected: `apps/desktop/scripts/run-dev.mjs:44-45` also uses `process.once` but runs under plain `node`, not the tsx CLI.

## tsx 4.23.5

- **behavior change** — tsx now detects a Node inspector that was enabled through `NODE_OPTIONS`. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.5))
  - not used: `NODE_OPTIONS` only carries `--import=tsx` (`apps/desktop/scripts/run-dev.mjs:8,10,12`). The debug modes pass `--inspect` / `--inspect-brk` as Electron CLI flags, not through `NODE_OPTIONS`.

## tsx 4.23.6

- **behavior change** — Resolver URL metadata is composed and preserved, and Node resolution is preserved when `allowJs` is on. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.6))
  - not used: `tsconfig.base.json` sets `"allowJs": false`, and searching `"allowJs": true` found nothing. The URL-metadata fix is internal and has no config.

## tsx 4.23.7

- **behavior change** — `tsImport` cache collisions are prevented. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.7))
  - not used: searched `tsImport` with no hits.

## tsx 4.23.8

- **behavior change** — Package subpath resolution and typeless ESM dependency exports are preserved. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.8))
  - not used (no code change): these are fixes to how dependencies resolve under the hooks. They need no repo config, and the smoke tests listed under 4.23.1 and `pnpm dev` cover them.

## tsx 4.23.9

- **behavior change** — Node test runner locations are now source-mapped, and `tsImport` supports data URLs. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.9))
  - not used: searched `node --test` and `tsImport` with no hits. Tests run on Vitest.

## tsx 4.23.10

- **behavior change** — nyc coverage discovery is supported. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.10), [#710](https://github.com/privatenumber/tsx/issues/710))
  - not used: searched `nyc`. The only hit is `.nyc_output` in the generated `apps/desktop/release/builder-debug.yml` exclude list.

## tsx 4.23.11

- **behavior change** — The async ESM `require` fallback is preserved. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.11))
  - not used: searched `require(` and `createRequire` with no hits.

## tsx 4.23.12

- **behavior change** — `import.meta` is shimmed even when its tokens are split by comments or newlines. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.12), [#829](https://github.com/privatenumber/tsx/issues/829))
  - not used (no code change): every `import.meta` use is a contiguous token. The uses are `apps/desktop/src/backend/db/migrations.ts:20`, `apps/desktop/src/electron/main.ts:20`, `tools/photo-booth-agent/src/agent.ts:666`, `tools/photo-booth-agent/src/env.ts:37` and `tools/photo-booth-agent/src/config.ts:56`.

## tsx 4.23.13

- **behavior change** — The shared transform cache now has a memory bound. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.13), [#835](https://github.com/privatenumber/tsx/issues/835))
  - not used: there is no cache config. Searched `TSX_` (for example `TSX_DISABLE_CACHE`) with no hits.

## tsx 4.23.14

- **behavior change** — The CJS bridge namespace is restored for Node 24 require(esm) under `tsImport()`. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.14), [#802](https://github.com/privatenumber/tsx/issues/802))
  - not used: searched `tsImport` with no hits. The runtimes are Node 22.

## tsx 4.23.15

- **behavior change** — Bare builtins are excluded from namespace inheritance, `tsImport` CommonJS modules get `require.cache` and `require.extensions`, and the namespaced `register()` overloads are now portable for declaration emit. ([source](https://github.com/privatenumber/tsx/releases/tag/v4.23.15))
  - not used: searched `tsImport`, `tsx/esm`, `tsx/cjs`, `module.register` and `require(` with no hits. tsx is only used as a CLI and through `--import=tsx`, and the repo never imports its types.
