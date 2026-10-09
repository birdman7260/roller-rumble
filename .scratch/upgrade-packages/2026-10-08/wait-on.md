# wait-on

| Package | Installed | Target |
| ------- | --------- | ------ |
| wait-on | 8.0.5     | 9.5.1  |

Repo usage, the only place wait-on is used: the CLI in `apps/desktop/scripts/run-dev.mjs:8`, `:10` and `:12`. Each runs `wait-on tcp:5173 && ...` with no flags. The resource has no host, so wait-on defaults it to `localhost`. Vite binds `127.0.0.1:5173` (`apps/desktop/vite.config.ts:36-37`). The declared range is in `apps/desktop/package.json:100` (`"wait-on": "^8.0.3"`). Nothing imports the JS API, and `@types/wait-on` is not installed. Repo Node: `mise.toml` pins `node = "22"`, CI uses `node-version: "22"` (`.github/workflows/release.yml:63`), and local `node -v` is v22.22.3.

Checked across the whole range: in the v9.5.1 `lib/wait-on.js`, the default host for a bare `tcp:<port>` is still `'localhost'` (`const host = ipv6 || hostMatched || 'localhost'`), and the call is still a plain `net.connect(port, host)` with no `family` or `autoSelectFamily` override. IPv4/IPv6 resolution of `localhost` is therefore unchanged from 8.0.5. On Node 22, `autoSelectFamily` tries both `::1` and `127.0.0.1`.

## wait-on 9.0.0

- **requirement** — Major bump only to drop unsupported Node versions. Engines go from `node >=12.0.0` (8.0.5) to `node >=20.0.0`. The release says there are no other breaking changes. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.0.0))
  - not used / satisfied: repo Node is 22 (`mise.toml`, `.github/workflows/release.yml:63`, local v22.22.3). The `engines` field in `package.json` / `apps/desktop/package.json` sets no lower Node floor. No change needed.

## wait-on 9.0.1

Nothing in scope. Minor dependency updates (axios, eslint). ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.0.1))

## wait-on 9.0.2

Nothing in scope. Test tooling swap from expect-legacy to chai. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.0.2))

## wait-on 9.0.3

Nothing in scope. JSDoc update and minor dependency updates. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.0.3))

## wait-on 9.0.4

Nothing in scope. Patch dependency updates (axios, lodash). ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.0.4))

## wait-on 9.0.5

Nothing in scope. Minor dependency updates and npm audit fixes. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.0.5))

## wait-on 9.0.6

Nothing in scope. Security dependency updates (axios/follow-redirects, joi). ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.0.6))

## wait-on 9.0.7

Nothing in scope. There is no GitHub release. The commits only add coverage tests and add `.fastembed_cache`/`.github` to `.npmignore`. ([source](https://github.com/jeffbski/wait-on/compare/v9.0.6...v9.0.10))

## wait-on 9.0.8

Nothing in scope. There is no GitHub release. The commits only exclude `.nyc_output`/`coverage` from the npm tarball. ([source](https://github.com/jeffbski/wait-on/compare/v9.0.6...v9.0.10))

## wait-on 9.0.9

Nothing in scope. There is no GitHub release. The commits only clean up more of the npm publish contents. ([source](https://github.com/jeffbski/wait-on/compare/v9.0.6...v9.0.10))

## wait-on 9.0.10

Nothing in scope. Removes repo tooling files from the published package and raises code coverage. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.0.10))

## wait-on 9.1.0

Nothing in scope. Dependency updates (axios, joi, mocha, eslint-plugin-chai-friendly). ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.1.0))

## wait-on 9.2.0

- **behavior change** — Malformed http/tcp resources now fail immediately with an error instead of polling until timeout. `tcp://host:port` is rejected (the form must be `tcp:host:port`). `http:host` without `//` is rejected. A tcp path must match `host:port`, a bare `port`, or `[ipv6]:port`. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.2.0), commit [02033ff](https://github.com/jeffbski/wait-on/commit/02033ff134010a6d28177e0160180974afbc101d))
  - not used: `tcp:5173` in `apps/desktop/scripts/run-dev.mjs:8,10,12` passes the new validation. I checked the v9.5.1 `HOST_PORT_RE` `/^(?:\[([^\]]+)\]:|([^:]*):)?(\d+)$/` against `"5173"` and it matches, with host defaulting to `localhost`. I grepped `apps packages scripts tools package.json` for `tcp://` and `wait-on <http|file|socket|command>` resources and found nothing.
- **behavior change** — tcp now supports IPv6 via `tcp:[::1]:port`. The default host for a bare port is still `localhost`, and `net.connect` is called without a family override, so localhost resolution is unchanged. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.2.0))
  - not used: there are no bracketed IPv6 resources. The default `localhost` → Vite on `127.0.0.1` behaves as it did on 8.0.5 (Node 22 `autoSelectFamily` tries both families). No change needed. Optional hardening, not required: change to `tcp:127.0.0.1:5173` to match `vite.config.ts:36`.
- **behavior change** — tcp and unix sockets are now destroyed after each check (`conn.destroy()` on connect/timeout). Before, the probe connection was left open. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.2.0), commit [9951f3c](https://github.com/jeffbski/wait-on/commit/9951f3ca2c44b4648642fa22dabec1123d9742e9))
  - not used: this only affects the probe socket to the Vite dev server, and no code depends on it. No change needed.
- **behavior change** — CLI parsing moved from `minimist` to Node `util.parseArgs` in non-strict mode. Unknown flags are still ignored, and `--no-<x>` is reproduced by hand. A new repeatable `-H/--header` flag was added. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.2.0), commit [9c6cc55](https://github.com/jeffbski/wait-on/commit/9c6cc5531f9fe50a6fdc07facc7f1af18ec0fe80))
  - not used: the CLI is always called with no flags (`run-dev.mjs:8,10,12`). I grepped `wait-on -`, `wait-on --`, `httpTimeout`, `tcpTimeout` and `minimist` and found nothing.
- **requirement** — The `minimist` runtime dependency was dropped. 9.5.1 deps are `joi ^18.2.9`, `rxjs ^7.8.2`, `axios ^1.20.0` and `lodash ^4.18.1`. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.2.0); `npm view wait-on@9.5.1 dependencies`)
  - not used: no repo code relies on wait-on bringing in `minimist` (grepped `minimist` and found nothing).

## wait-on 9.3.0

- **behavior change** — The package now ships its own TypeScript definitions (`index.d.ts`), and `waitOn()` accepts a string or string array as opts. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.3.0))
  - not used: I grepped `from "wait-on"`, `require("wait-on")` and `@types/wait-on` across `apps packages scripts tools` and found nothing. Only the CLI is used.

## wait-on 9.4.0

Nothing in scope. Adds a `command:` resource and a `commandTimeout` option, both additive. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.4.0))

## wait-on 9.4.1

Nothing in scope. Type-definition fixes for `@types/wait-on` compatibility and wider header types; the JS API is not used. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.4.1))

## wait-on 9.5.0

Nothing in scope. Adds the CLI flag `--status-codes`, which is additive. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.5.0))

## wait-on 9.5.1

Nothing in scope. Dependency upgrades for vulnerabilities. ([source](https://github.com/jeffbski/wait-on/releases/tag/v9.5.1))

## Required edits

- [ ] Bump `apps/desktop/package.json:100` from `"wait-on": "^8.0.3"` to `"wait-on": "^9.5.1"` and reinstall. No source changes are required.
