# jest-dom

| Package                   | Installed | Target |
| ------------------------- | --------- | ------ |
| @testing-library/jest-dom | 6.9.1     | 7.0.1  |

Sources: GitHub Releases on `testing-library/jest-dom` (the project uses semantic-release; it has no CHANGELOG.md and no migration guide, so the release notes and the linked PRs are the primary sources).

How the repo uses it: `apps/desktop/src/renderer/test/setup.ts:1` imports the main entry (`import "@testing-library/jest-dom";`). That entry calls the global `expect.extend`, which works because `apps/desktop/vitest.config.ts:22` sets `globals: true`. The matcher types reach Vitest through the `jest.Matchers` augmentation in `types/jest.d.ts`, which Vitest's `JestAssertion` extends. I diffed the 7.0.1 tarball against 6.9.1: `types/index.d.ts` and `types/jest.d.ts` are unchanged. `apps/desktop/tsconfig.json:8` (`"types": ["vite/client"]`) needs no change. The tests use the matchers `toBeInTheDocument` (69, 21 of them `.not.`), `toHaveTextContent` (14), `toHaveValue` (9), `toBeDisabled` (5), `toBeEnabled` (3), `toHaveAttribute` (2), `toHaveClass` (1) and `toHaveAccessibleDescription` (1). None of them changed in this range.

## @testing-library/jest-dom 6.10.0

- **requirement** — 6.10.0 already shipped the new `@testing-library/dom` `>=10 <11` peer and the `engines.node >=22` requirement, even though its release notes only list the feature. 7.0.0 re-released the same change with the `BREAKING CHANGES` footer ("Repaired release for #731"). The required action is under 7.0.0 below. ([source](https://github.com/testing-library/jest-dom/releases/tag/v7.0.0), [package.json at v6.10.0](https://github.com/testing-library/jest-dom/blob/v6.10.0/package.json))
  - Same verdict as the 7.0.0 items below.
- **behavior change (additive)** — Adds 16 `toContainAnyBy*` / `toContainOneBy*` query matchers (AltText, DisplayValue, LabelText, PlaceholderText, Role, TestId, Text, Title). The main entry and the `./vitest` entry now import `@testing-library/dom` at runtime. ([source](https://github.com/testing-library/jest-dom/releases/tag/v6.10.0), [PR #731](https://github.com/testing-library/jest-dom/pull/731))
  - not used: searched `toContainAnyBy`, `toContainOneBy`, `expect.extend` in `apps/`, `packages/`, `tools/`. No custom matchers have conflicting names. The runtime import of `@testing-library/dom` is covered by the peer item under 7.0.0.

## @testing-library/jest-dom 7.0.0

- [ ] **breaking / requirement** — `@testing-library/dom` is now a **required peer dependency** (`>=10 <11`). The main entry (`dist/index.mjs`) does `import '@testing-library/dom'`. ([source](https://github.com/testing-library/jest-dom/releases/tag/v7.0.0), [PR #731](https://github.com/testing-library/jest-dom/pull/731))
  - affected: `apps/desktop/package.json:70-74` (devDependencies). `@testing-library/dom` is not a direct dependency today. It is in the tree only as `10.4.1` (pnpm-lock.yaml:1425), auto-installed as a peer of `@testing-library/react@16.3.2`, and `apps/desktop/node_modules/@testing-library/` holds only `jest-dom` and `react`. Add `"@testing-library/dom": "^10.4.1"` to `apps/desktop` devDependencies, in alphabetical order before `@testing-library/jest-dom`, so the peer is satisfied explicitly and the version cannot drift outside `>=10 <11`. Then run `pnpm install`. The installed 10.4.1 already satisfies the range.
  - `apps/desktop/src/renderer/test/setup.ts:1` needs no code change: the same import now also loads `@testing-library/dom` at runtime.
- **requirement** — Minimum Node.js is now **22** (`engines.node: ">=22"`). ([source](https://github.com/testing-library/jest-dom/releases/tag/v7.0.0))
  - not used / already satisfied: the repo pins Node 22 in `mise.toml:5` (`node = "22"`), `.github/workflows/release.yml:63` (`node-version: "22"`) and README.md:346. The local runtime is v22.22.3. Tests run under Vitest on Node, not Electron. No change needed.
- **behavior change (additive)** — The same `toContainAnyBy*` / `toContainOneBy*` matchers are re-released under the major. ([source](https://github.com/testing-library/jest-dom/releases/tag/v7.0.0))
  - not used: searched `toContainAnyBy`, `toContainOneBy`.

## @testing-library/jest-dom 7.0.1

- **requirement** — `vitest` is now declared as an **optional** peer dependency (`>= 0.32`, `peerDependenciesMeta.vitest.optional: true`). This fixes `@testing-library/jest-dom/vitest` failing to resolve `vitest` under strict layouts (pnpm global virtual store). ([source](https://github.com/testing-library/jest-dom/releases/tag/v7.0.1), [PR #733](https://github.com/testing-library/jest-dom/pull/733))
  - not used / already satisfied: the repo imports the main entry, not `@testing-library/jest-dom/vitest` (searched `jest-dom/vitest` in `apps/`, `packages/`, `tools/`: no hits). `apps/desktop/package.json:99` has `vitest` `^3.1.3` (3.2.4 installed), which satisfies `>= 0.32`. No change needed.
