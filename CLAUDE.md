# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Roller Rumble is a local-first Electron app for running live stationary-bike race events. One desktop process embeds an Express backend and serves three surfaces: an admin window, a projector race display, and a mobile racer page (served over LAN or a Cloudflare tunnel).

## Commands

Scripts live in `package.json` — `pnpm dev` is the primary dev workflow. The non-obvious invocations:

```bash
# Run a single test file
pnpm --filter @roller-rumble/desktop test -- path/to/file.test.ts

pnpm dev:reset-data    # Delete .roller-rumble-dev/runtime (stop the app first)
pnpm rebuild:native    # Rebuild better-sqlite3 for Electron after ABI changes
```

**Quality gate before handing off work:**

```bash
pnpm format && pnpm quality && pnpm typecheck && pnpm test && pnpm build
```

**Always update `CHANGELOG.md` once an issue is implemented.** Add an entry under `## Unreleased` in the `Added`, `Changed`, or `Fixed` section that fits, phrased for end users (describe the user-visible behavior, not the internal implementation).

## Architecture

### Process model

- `apps/desktop/src/electron/main.ts` — Electron main process; opens admin and projector windows
- `apps/desktop/src/backend/server.ts` — embedded Express server; owns SQLite, REST routes, WebSocket broadcast, avatar uploads, and Vite proxy in dev
- `apps/desktop/src/renderer/` — React 19 app bundled by Vite; one bundle serves all routes

### Data flow

The backend holds all mutable state in SQLite and derives an `AppSnapshot` that it broadcasts over WebSockets. The renderer receives snapshots via a shared WebSocket hook and uses TanStack Query for REST calls. There is no separate state management library—TanStack Query caches are the renderer's data layer.

### Workspace packages

`pnpm-workspace.yaml` covers `apps/*` and `packages/*`. Everything under `tools/` is intentionally **outside** the workspace and installed with `--ignore-workspace` (see `scripts/run-db-studio.mjs`, `scripts/run-photo-booth-package.mjs`) so their Node-built native binaries never overwrite the Electron-built ones used by the desktop app.

### Renderer routing

TanStack Router with file-based routes in `apps/desktop/src/renderer/routes/`. The generated route tree is at `routeTree.gen.ts` — **never edit it manually**.

### Database

- SQLite via Drizzle ORM + `better-sqlite3`
- Schema lives in `apps/desktop/src/backend/db/schema.ts`
- Migrations are plain SQL files in `apps/desktop/src/backend/db/migrations/` — add new files numbered sequentially after the highest existing one (`NNNN_description.sql`), never edit existing ones after data exists
- The app runs pending migrations at startup by recording applied files in `schema_migrations`

### Theme system

Themes are manifest-driven (`packages/shared/src/themes.ts`). Each theme declares color tokens, font, race orientation, sprite sheet, and semantic style variants. Apply themes through `@roller-rumble/shared-ui/theme` helpers and CSS variables — branch on manifest attributes (`orientation`, `uiStyle`, `surfaceStyle`, `connectorStyle`, `raceGraphic.variant`), not on theme IDs. Import `@roller-rumble/shared-ui/styles.css` before surface-specific CSS. Add new shared UI variations to `packages/shared-ui`, not inline in surface stylesheets.

## Environment

`.env` (committed defaults) → `.env.local` (local overrides, never commit) → shell env (wins). In dev, runtime data lives in `.roller-rumble-dev/runtime`. Only `VITE_*` vars reach renderer code. See `README.md` for the full variable reference.

## ESLint Notes

`eslint-plugin-react-doctor` is enabled and its rules are configured as **errors**, not warnings (see `eslint.config.mjs`). `pnpm lint` must pass with zero problems.

**Never silence or work around a lint rule.** Do not add `eslint-disable` comments, tweak thresholds, or restructure code just to make the linter stop complaining. Every lint rule (react-doctor included) must be satisfied by the genuinely correct fix — decompose a giant component into real components, associate labels with their inputs, use the idiomatic pattern the rule points at. If a rule seems to demand something wrong, raise it rather than dodging it.

## Agent skills

### Issue tracker

GitHub Issues on `birdman7260/roller-rumble` via the `gh` CLI. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
