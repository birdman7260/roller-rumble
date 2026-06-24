# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Roller Rumble is a local-first Electron app for running live stationary-bike race events. One desktop process embeds an Express backend and serves three surfaces: an admin window, a projector race display, and a mobile racer page (served over LAN or a Cloudflare tunnel).

## Commands

```bash
pnpm dev               # Vite dev server + Electron (primary dev workflow)
pnpm dev:debug         # Same, with Node inspector on 9229 and Chromium debug on 9223
pnpm build             # Vite renderer + tsup Electron bundle + copy runtime assets
pnpm start             # Launch Electron against a built app (after pnpm build)

pnpm test              # Vitest once across all packages
pnpm test:watch        # Vitest in watch mode
pnpm typecheck         # tsc --noEmit for shared packages + desktop + photo booth agent
pnpm lint              # ESLint (TS, React Hooks, TanStack Query, React Doctor, unused imports)
pnpm lint:fix          # ESLint with auto-fix
pnpm format            # Prettier write
pnpm format:check      # Prettier check only
pnpm quality           # format:check + lint (pre-handoff gate)

# Run a single test file
pnpm --filter @roller-rumble/desktop test -- path/to/file.test.ts

pnpm dev:reset-data    # Delete .roller-rumble-dev/runtime (stop the app first)
pnpm db:studio         # Drizzle Studio against the dev database
pnpm rebuild:native    # Rebuild better-sqlite3 for Electron after ABI changes
```

**Quality gate before handing off work:**

```bash
pnpm format && pnpm quality && pnpm typecheck && pnpm test && pnpm build
```

## Architecture

### Process model

- `apps/desktop/src/electron/main.ts` — Electron main process; opens admin and projector windows
- `apps/desktop/src/backend/server.ts` — embedded Express server; owns SQLite, REST routes, WebSocket broadcast, avatar uploads, and Vite proxy in dev
- `apps/desktop/src/renderer/` — React 19 app bundled by Vite; one bundle serves all routes

### Data flow

The backend holds all mutable state in SQLite and derives an `AppSnapshot` that it broadcasts over WebSockets. The renderer receives snapshots via a shared WebSocket hook and uses TanStack Query for REST calls. There is no separate state management library—TanStack Query caches are the renderer's data layer.

### Workspace packages

| Package                    | Path                      | Role                                                                                                   |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `@roller-rumble/desktop`   | `apps/desktop`            | Electron shell, Express backend, React renderer, Drizzle config                                        |
| `@roller-rumble/shared`    | `packages/shared`         | Types, constants, validation, themes, presets — used by all packages                                   |
| `@roller-rumble/shared-ui` | `packages/shared-ui`      | React UI primitives, shared CSS contract, theme DOM helper                                             |
| _(isolated)_               | `tools/photo-booth-agent` | Raspberry Pi kiosk agent — own Node-built `better-sqlite3`, camera/light adapters, SQLite upload queue |
| _(isolated)_               | `tools/db-studio`         | Drizzle Studio with isolated Node-built sqlite dependency                                              |

The photo booth agent and db-studio are intentionally isolated (`--ignore-workspace`) so their Node-built native binaries never overwrite the Electron-built ones used by the desktop app.

### Backend services (`apps/desktop/src/backend/services/`)

Key services: `app.ts` (AppSnapshot assembly and broadcast), `competition.ts` (race lifecycle and metrics), `queue.ts` (open time trial queue logic), `tournaments.ts` (bracket generation and advancement), `notifications.ts` (Web Push), `photo-booth.ts`, `cloudflared.ts`, `stripe-payments.ts`, `network.ts`.

### Renderer routing

TanStack Router with file-based routes in `apps/desktop/src/renderer/routes/`. The generated route tree is at `routeTree.gen.ts` (do not edit manually). Main surfaces: `/admin`, `/race`, `/racer`, plus dev lab pages `/bracket-lab`, `/queue-lab`, `/notification-lab`.

### Database

- SQLite via Drizzle ORM + `better-sqlite3`
- Schema lives in `apps/desktop/src/backend/db/schema.ts`
- Migrations are plain SQL files in `apps/desktop/src/backend/db/migrations/` — add new files like `0008_description.sql`, never edit existing ones after data exists
- The app runs pending migrations at startup by recording applied files in `schema_migrations`

### Theme system

Themes are manifest-driven (`packages/shared/src/themes.ts`). Each theme declares color tokens, font, race orientation, sprite sheet, and semantic style variants. Apply themes through `@roller-rumble/shared-ui/theme` helpers and CSS variables — branch on manifest attributes (`orientation`, `uiStyle`, `surfaceStyle`, `connectorStyle`, `raceGraphic.variant`), not on theme IDs. Import `@roller-rumble/shared-ui/styles.css` before surface-specific CSS. Add new shared UI variations to `packages/shared-ui`, not inline in surface stylesheets.

### Hardware adapters

`apps/desktop/src/backend/adapters/` provides seams for the bike sensor (`sensor.ts`, `sensor-simulator.ts`) and race trigger (`trigger.ts`, `trigger-os2l.ts`, `trigger-manual.ts`). The simulator is the current working sensor path; real USB hardware protocol is not yet implemented.

## Key Files

- `apps/desktop/src/electron/main.ts` — Electron entry, window management
- `apps/desktop/src/backend/server.ts` — Express setup, WebSocket, route mounting
- `apps/desktop/src/backend/db/schema.ts` — Drizzle schema (typed mirror of SQL migrations)
- `apps/desktop/src/backend/services/app.ts` — AppSnapshot assembly and broadcast
- `apps/desktop/src/backend/services/competition.ts` — race staging, countdown, metrics, finalization
- `apps/desktop/src/renderer/router.tsx` — TanStack Router instance
- `packages/shared/src/themes.ts` — theme manifests and registry
- `tools/photo-booth-agent/src/agent.ts` — Raspberry Pi booth state machine

## Environment

`.env` (committed defaults) → `.env.local` (local overrides, never commit) → shell env (wins). In dev, runtime data lives in `.roller-rumble-dev/runtime`. Only `VITE_*` vars reach renderer code. See `README.md` for the full variable reference.

## ESLint Notes

`eslint-plugin-react-doctor` is enabled with a broad advisory baseline. New files should not introduce violations. Run `pnpm lint` to check; new baseline entries require intentional addition to the config.

## Agent skills

### Issue tracker

GitHub Issues on `birdman7260/roller-rumble` via the `gh` CLI. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
