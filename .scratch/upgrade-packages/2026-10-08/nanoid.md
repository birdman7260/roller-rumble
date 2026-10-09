# nanoid

| Package                                       | Installed | Target |
| --------------------------------------------- | --------- | ------ |
| nanoid (apps/desktop)                         | 5.1.9     | 6.0.2  |
| nanoid (tools/photo-booth-agent, own install) | 5.1.11    | 6.0.2  |

Repo usage (all call sites import only `nanoid` from `"nanoid"`, ESM, server/Node side only):

- `apps/desktop/src/backend/db/Database.ts:6` (calls at 522, 648, 737, 831, 890, 992, 1104, 1108, 1427, 1615, 1725, 1822), all `nanoid()`
- `apps/desktop/src/backend/services/app.ts:6` (calls at 1333/1391 `nanoid(8)`, 1334/1392 `nanoid(48)`, 1455, 1530, 1823, 2106-2108 `nanoid()`)
- `apps/desktop/src/backend/services/tournaments.ts:1` (call at 582)
- `apps/desktop/src/backend/services/competition.ts:1` (call at 452)
- `tools/photo-booth-agent/src/queue.ts:4` (call at 71)
- No renderer (`apps/desktop/src/renderer`), `packages/` or test-mock usage. Searched `nanoid` across `apps packages tools` (excluding node_modules/dist), plus `customAlphabet|customRandom|urlAlphabet|nanoid/non-secure|webcrypto|require('nanoid'`: no hits beyond the above.

Package-shape check (from `npm view nanoid@<v>` and the unpacked tarballs, 5.1.9 vs 6.0.2): `type: "module"`, the `exports` map (`.` with `types`/`browser`/`react-native`/`default`, `./non-secure`, `./package.json`), the `browser` field, and the export names (`nanoid`, `customAlphabet`, `customRandom`, `random`, `urlAlphabet`) are identical. ESM-only in both versions, so nothing changes for tsup (`format: ["esm"]`, `platform: "node"`, `target: "node22"`) or Vite. `index.d.ts` only renames the `customAlphabet` param `size` → `defaultSize` (docs-level, no type change for callers).

## nanoid 5.1.10

- **behavior change** — Fixed `nanoid` breaking when a big ID size is requested ([source](https://github.com/ai/nanoid/releases/tag/5.1.10))
  - not used: largest size in repo is `nanoid(48)` at `apps/desktop/src/backend/services/app.ts:1334,1392`; searched `nanoid(` across `apps packages tools`. No change needed. (photo-booth-agent is already past this, at 5.1.11.)

## nanoid 5.1.11

- **behavior change** — Same fix as 5.1.10 ("Fixed breaking Nano ID by requesting big ID") ([source](https://github.com/ai/nanoid/releases/tag/5.1.11))
  - not used: same as 5.1.10; no big sizes requested.

## nanoid 5.1.12

Nothing in scope. Publishing moved to npm Provenance and Staged Publishing (no runtime change). ([source](https://github.com/ai/nanoid/releases/tag/5.1.12))

## nanoid 5.1.13

Nothing in scope. Fixed npm package size regression. ([source](https://github.com/ai/nanoid/releases/tag/5.1.13))

## nanoid 5.1.14

Nothing in scope. Fixed npm package size regression. ([source](https://github.com/ai/nanoid/releases/tag/5.1.14))

## nanoid 5.1.15

- **behavior change** — Fixed random pool corruption on big ID sizes ([source](https://github.com/ai/nanoid/releases/tag/5.1.15))
  - not used: only `nanoid()`, `nanoid(8)` and `nanoid(48)` are called (searched `nanoid(`); the fix only improves randomness. No change needed.

## nanoid 5.1.16

- **behavior change** — Negative size no longer loops forever; in 6.0.2 the Node entry throws `RangeError('Wrong ID size')` for a negative size and truncates floats via `size |= 0` ([source](https://github.com/ai/nanoid/releases/tag/5.1.16))
  - not used: every size argument in the repo is a literal positive integer (8, 48) or omitted; searched `nanoid(` across `apps packages tools`.

## nanoid 6.0.0

- **requirement** — Removed Node.js 18 and 20 support; `engines.node` is now `^22 || ^24 || >=26` (was `^18 || >=20`) ([source](https://github.com/ai/nanoid/releases/tag/6.0.0), [changelog](https://github.com/ai/nanoid/blob/6.0.2/CHANGELOG.md))
  - not used / satisfied: the desktop backend runs in Electron 35 main (Node 22.16), going to Electron 44 (Node 24.21), and both are in range. tsup targets `node22` (`apps/desktop/tsup.electron.config.ts:7`). The photo-booth agent runs via `tsx` on the system Node (local Node is v22.22.3). Neither has an `engines` field to bump (checked root `package.json`, `apps/desktop/package.json`, `tools/photo-booth-agent/package.json`). Searched `node 18|20`, `nodesource`, `engines` in `tools/photo-booth-agent`, `README.md`, `docs`, `scripts`: nothing pins Node 18/20. Whatever machine runs the photo-booth agent needs Node ≥22.
- **behavior change** — `nanoid()` and `customAlphabet()` rewritten for about 4x speed ([source](https://github.com/ai/nanoid/releases/tag/6.0.0)). From the tarball diff: the Node entry no longer does `import { webcrypto as crypto } from 'node:crypto'` and uses the **global** `crypto.getRandomValues` and global `Buffer` instead. `nanoid` is now `export const nanoid = customAlphabet(urlAlphabet)` (the call signature `(size?: number) => string` and the 21-char URL-safe default are unchanged).
  - not used / satisfied: global `crypto` and `Buffer` exist in Electron main (Node 22/24) and in the photo-booth agent's Node. nanoid is not imported by the renderer (that would pick `index.browser.js`, also unchanged). No test mocks `nanoid` or `node:crypto` for it: searched `vi.mock("nanoid"`, `webcrypto`, `nanoid` in `*.test.ts`. No change needed.

## nanoid 6.0.1

Nothing in scope. Fixed docs. ([source](https://github.com/ai/nanoid/releases/tag/6.0.1))

## nanoid 6.0.2

- **behavior change** — `customRandom` now handles floats in size, and its performance when the size changes is fixed. JS bundle size reduced ([source](https://github.com/ai/nanoid/releases/tag/6.0.2))
  - not used: searched `customRandom`, `customAlphabet`, `nanoid/non-secure` across `apps packages tools`. No hits.

No migration guide is published for 6.0 (none in README or repo). The release notes and `CHANGELOG.md` at tag 6.0.2 are the primary sources.

**Summary: 0 affected items.** Bump `"nanoid": "^6.0.2"` in `apps/desktop/package.json:60` and `tools/photo-booth-agent/package.json:19` (separate `--ignore-workspace` install for the agent). No code changes needed.
