# testing-library-react

| Package                | Installed | Target |
| ---------------------- | --------- | ------ |
| @testing-library/react | 16.3.2    | 16.3.3 |

## @testing-library/react 16.3.3

The release notes list one bug fix and nothing breaking. The `peerDependencies` and `engines` fields are identical to 16.3.2 (`npm view @testing-library/react@16.3.2` / `@16.3.3`): react/react-dom/@types ^18 || ^19, `@testing-library/dom` ^10.0.0, node >=18.

- **behavior change**: the `eventWrapper` that RTL registers with DTL now tracks re-entrancy. When `fireEvent` (or any `getConfig().eventWrapper(...)` dispatch) runs while another event dispatch is already inside the wrapper, for example from inside an effect or handler that fires during an outer `fireEvent`, the inner callback now runs directly instead of opening a nested synchronous `act()`. Before, the nested `act()` could tear down the act queue too early and log "not wrapped in act(...)" warnings. Top-level `fireEvent` calls are still wrapped in `act()` as before, and explicit user `act()` calls are not tracked by the new flag. ([source](https://github.com/testing-library/react-testing-library/releases/tag/v16.3.3), [PR #1468 / `src/pure.js`](https://github.com/testing-library/react-testing-library/pull/1468))
  - not used: the repo never nests a dispatch inside the event wrapper. All 52 `fireEvent` calls in `apps/desktop/src/renderer/**/*.test.tsx` are top-level test statements. Searched `eventWrapper`, `asyncWrapper`, `getConfig` (the only hits are the unrelated `tools/photo-booth-agent/src/config.ts`), `configure(`, `dispatchEvent`, `user-event`/`userEvent` (none, and user-event is not installed). The explicit `act(` blocks in `apps/desktop/src/renderer/lib/snapshot-stream.test.tsx:80-113` and `apps/desktop/src/renderer/lib/use-height-css-variable.test.tsx:66` fire fake sockets, fake ResizeObservers and timers, and contain no `fireEvent`, so they are unaffected. No code change is needed. At most, a previously spurious act() warning would disappear.

### Peer requirement note: `@testing-library/dom`

- **requirement** (unchanged): `@testing-library/dom` ^10.0.0 is a required peer ([source](https://github.com/testing-library/react-testing-library/blob/v16.3.3/package.json)).
  - status: `apps/desktop/package.json` does **not** declare it, and neither does the root or any other workspace package.json. It is still installed: pnpm 9.15.9 auto-installs peers (default `auto-install-peers=true`, with no `.npmrc` override), and `pnpm-lock.yaml:1425,5378,5401` resolves `@testing-library/dom@10.4.1` as the auto-installed peer of `@testing-library/react@16.3.2`. `pnpm why @testing-library/dom` reports `@testing-library/react 16.3.2 └── @testing-library/dom 10.4.1 peer`. It is not linked into `apps/desktop/node_modules/@testing-library/` (only `jest-dom` and `react` are there), and no source file imports `@testing-library/dom` directly (searched `@testing-library/dom` in `apps`, `packages`, `tools`). The peer is satisfied, so the upgrade needs no action. Optionally, add `"@testing-library/dom": "^10.4.1"` to `apps/desktop` devDependencies to make the peer explicit. The latest on npm is 10.4.2.
