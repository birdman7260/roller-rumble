# GoldSprints

GoldSprints is a local-first Electron app for running live stationary-bike race events. It ships one desktop shell with an embedded backend and three user-facing surfaces:

- `Admin Display` for hosts on the laptop
- `Race Display` for the projector or secondary screen
- `Racer Page` for phones over the local network or a `cloudflared` tunnel

The current codebase is aimed at the first working milestone: open time trial operation, live race
presentation, persistent event data, theme support, and live tournament operation.

## What The App Does

- Creates and persists events
- Registers racers by email, phone number, or anonymous local identity
- Turns the racer identity card into `Your Race Card` after signup instead of leaving a separate
  register card on screen
- Lets racers upload avatars
- Lets racers generate a short-lived kaleidoscope photo booth QR after registration so a paired
  Raspberry Pi booth can capture a DSLR avatar for them
- Manages an open time trial queue with solo and head-to-head entries
- Uses filter-as-you-type racer pickers when admins or racers choose matchup participants
- Reflows the racer-page queue and challenge controls for narrow phone screens so buttons and the
  opponent picker stay usable
- Stages, counts down, runs, and finalizes races
- Computes live and final race metrics:
  - current speed
  - top speed
  - average speed
  - distance traveled
  - estimated wattage
- Recovers interrupted races after an app restart
- Creates tournament data for:
  - `Open Time Trial`
  - `Single Elimination`
  - `Double Elimination`
  - `Round Robin Standings`
  - `Groups -> Single Elimination`
- Draws live elimination brackets in admin and racer tournament views, and updates them as matches
  are completed
- Highlights completed advancement paths through the bracket with theme-specific connector styling
- Lets admins choose bracket size and board layout for direct elimination starts, including an
  optional center-converging board for larger single-tree brackets
- Unstages a not-yet-started open time trial race when a tournament starts, returning that race's
  queue entry to the queue instead of layering the race and tournament displays
- Applies a selected theme across admin, race, and racer surfaces
- Uses theme-specific sprite sheets for the moving race avatars, with separate slow and fast
  animation rows selected from live speed
- Exposes the racer page through an optional `cloudflared` tunnel

## Architecture

The app is intentionally local-first. Everything important runs on the host machine.

- `Electron` owns the desktop lifecycle and opens the admin and projector windows.
- The embedded `Node/Express` server is the operational core:
  - owns SQLite persistence
  - exposes REST endpoints for admin and racer actions
  - publishes live snapshots over WebSockets
  - serves uploaded avatars
  - proxies Vite in development
  - serves the built renderer in production
- The `React` renderer is shared across all routes. Route-level shells make the same app behave like the admin console, projector display, or racer page.
- `TanStack Query` handles data fetching and caching.
- `TanStack Router` handles route-based surface composition.
- `Framer Motion` drives the live race-visualizer animation layer so rider markers and progress fills move smoothly with incoming telemetry.
- `React Flow` powers the custom elimination-bracket board so the app can own node styling, edge
  routing, and viewport camera behavior.
- `SQLite` is the source of truth for events, racers, queue entries, races, results, tournaments, and settings.
- `Drizzle ORM` provides the typed query layer over `better-sqlite3`, while checked-in SQL files remain the migration source of truth.
- A separate Raspberry Pi photo booth agent can run from this repo and pair back to the embedded
  backend for DSLR avatar capture, WLED light control, and offline upload queueing.

## Runtime Model

At startup the backend initializes the database, settings, trigger adapters, and the current sensor adapter. The app then broadcasts a shared `AppSnapshot` to every surface.

Operational flow looks like this:

1. Admin stages the next queue entry.
2. A race record is created in SQLite.
3. Countdown begins from manual control or the OS2L trigger seam.
4. The active sensor adapter feeds rotation samples into the race engine.
5. Live metrics are written back as snapshot-friendly race telemetry.
6. When a racer reaches the target distance, the race finalizes and results are persisted.
7. Updated snapshots fan out to admin, projector, and racer clients.

The current sensor path is a simulator. A real USB adapter seam exists, but the real device protocol is not implemented yet.

## Routes And Surfaces

- `/admin`
  - host controls
  - event creation
  - racer registration
  - queue management
  - persistent bottom race-control tray for stage/start/finalize/recovery actions
  - tournament creation
  - interactive elimination bracket / tournament board
  - bracket size and layout selection for direct elimination formats
  - side-by-side tournament setup and history when no tournament is active
  - full-width active tournament summary followed by the full-width bracket board while active
  - settings and tunnel controls
  - photo booth pairing/status controls
- `/race`
  - countdown
  - live race visualization
  - metrics
  - winner state
  - next-up teaser
  - tournament bracket takeover during active elimination events, including staged-match zoom, live
    race slide-away, and post-finish handoff choreography where only the advancement connector
    draws after the source matchup is marked advanced and before the bracket commits the winner
    into the next slot
- `/racer`
  - self-registration
  - avatar upload
  - short-lived photo booth QR for DSLR avatar capture after registration
  - queue signup
  - challenge signup
  - upcoming races
  - racer list and stats
  - the active tournament, or the most recent completed tournament when none is active
  - in-place live tournament brackets and standings
- `/bracket-lab`
  - developer test page for replaying tournament bracket camera and connector handoff animations
    against mocked bracket data

## Project Layout

- `src/electron`
  - Electron main-process entrypoint
- `src/backend`
  - embedded server, adapters, persistence, and race/tournament services
  - SQLite schema migrations live in `src/backend/db/migrations/*.sql`
  - the typed Drizzle schema mirror lives in `src/backend/db/schema.ts`
- `src/renderer`
  - React UI, file-based routes, API client, and theme-aware components
  - bundled webfont assets for period-specific themes live in `src/renderer/assets/fonts`
  - bundled race-avatar sprite sheets live in `src/renderer/assets/sprites`
  - generated TanStack route tree lives in `src/renderer/routeTree.gen.ts`
- `src/shared`
  - shared constants, types, validation, presets, and themes
- `tools/photo-booth-agent`
  - isolated Raspberry Pi kiosk agent package with its own Node-built native dependencies
  - camera/light adapters, local SQLite upload queue, and booth state machine

Important files:

- [src/electron/main.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/electron/main.ts)
- [src/backend/server.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/backend/server.ts)
- [src/backend/db/migrations/0001_initial-schema.sql](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/backend/db/migrations/0001_initial-schema.sql)
- [src/backend/db/schema.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/backend/db/schema.ts)
- [drizzle.config.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/drizzle.config.ts)
- [src/backend/services/app.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/backend/services/app.ts)
- [src/backend/services/competition.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/backend/services/competition.ts)
- [src/renderer/router.tsx](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/renderer/router.tsx)
- [src/renderer/components/elimination-bracket-view.tsx](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/renderer/components/elimination-bracket-view.tsx)
- [src/renderer/components/tournament-flow-layout.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/renderer/components/tournament-flow-layout.ts)
- [src/shared/themes.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/shared/themes.ts)
- [tools/photo-booth-agent/src/agent.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/tools/photo-booth-agent/src/agent.ts)

## Stack

- Electron
- Vite
- TypeScript
- React 19
- TanStack Router
- TanStack Query
- Framer Motion
- React Flow (`@xyflow/react`)
- Express
- WebSocket (`ws`)
- Drizzle ORM + `better-sqlite3`
- Vitest
- ESLint + Prettier

## Requirements

- Node.js 22 or newer is recommended
- macOS or Windows for the intended desktop runtime
- `cloudflared` installed and on `PATH` if you want public racer-page tunnels

## Getting Started

1. Install dependencies:

```bash
corepack pnpm install
```

2. Optional: copy the example environment file if you want persistent local defaults:

```bash
cp .env.example .env.local
```

3. Start the app in development:

```bash
corepack pnpm dev
```

4. Use the admin window to create an event and stage races.

Development mode starts:

- Vite on `http://127.0.0.1:5173`
- the embedded backend on `http://127.0.0.1:3187` by default
- an Electron admin window
- an Electron race display window
- dev runtime data inside `.goldsprints-dev/runtime`

The racer page is available through the backend route at `/racer`.

## Environment Configuration

The Electron main process and embedded backend load dotenv files at startup. The standard order is:

1. `.env`
2. `.env.local`

Shell-provided environment variables always win. Values from `.env.local` can override values from
`.env`, which keeps checked-in examples boring and local machine overrides easy.

The photo booth runner loads the same root files plus booth-specific files before launching the
isolated Raspberry Pi package:

1. `.env`
2. `.env.local`
3. `.env.photo-booth`
4. `.env.photo-booth.local`

Use `.env.example` for shared app defaults and `.env.photo-booth.example` for Pi-specific booth
setup. The booth agent also loads those files directly when started from
`tools/photo-booth-agent`, so Raspberry Pi deployments still work if you run the package script
without the root launcher.

Only variables prefixed with `VITE_` are exposed to browser renderer code by Vite. Keep secrets such
as `GOLDSPRINTS_BOOTH_SECRET` in backend/agent dotenv files, not in `VITE_*` variables.

## Scripts

- `pnpm dev`
  - Starts the Vite dev server and the Electron app together.
  - Electron points at the live Vite renderer while still using the embedded backend.
  - `--strictPort` keeps Vite pinned to `5173` so Electron always knows where to connect.
- `pnpm dev:debug`
  - Starts the app in dev mode with Electron's Node inspector on `9229` and Chromium remote debugging on `9223`.
  - Opens renderer DevTools automatically.
  - Mirrors renderer console output and backend request logs into the terminal so failed button clicks are easier to spot.
- `pnpm dev:debug:break`
  - Same as `dev:debug`, but pauses Electron on startup so you can attach a debugger before app bootstrap runs.
- `pnpm build`
  - Builds the renderer with Vite and bundles the Electron entry with `tsup`.
  - Copies runtime assets such as SQLite migration files into `dist/electron`.
  - This creates distributable app assets in `dist/`, but it does not create an installer.
- `pnpm dev:reset-data`
  - Deletes the repo-local dev runtime directory at `.goldsprints-dev/runtime`.
  - Use this when you want a fresh SQLite database, cleared uploads, and no leftover dev event data.
  - Stop the running dev app first so SQLite files are not in use.
- `pnpm db:studio`
  - Opens Drizzle Studio against the current SQLite database path from `drizzle.config.ts`.
  - Useful for inspecting the live dev database with the same typed schema the app code uses.
  - This helps with exploration only; runtime migrations still come from `src/backend/db/migrations/*.sql`.
  - Runs from the isolated `tools/db-studio` pnpm package, so its Node-built `better-sqlite3` never overwrites the Electron build used by the app itself.
  - The first run bootstraps that isolated tooling package automatically if it has not been installed yet.
- `pnpm start`
  - Launches Electron against the built app.
  - Use this after `pnpm build`.
- `pnpm preview`
  - Serves the built Vite renderer for inspection outside Electron.
  - Useful when checking static renderer output only.
- `pnpm format`
  - Runs Prettier in write mode across the repo.
- `pnpm format:check`
  - Verifies Prettier formatting without changing files.
- `pnpm lint`
  - Runs the strict ESLint ruleset, including TypeScript, React Hooks, TanStack Query, and unused import checks.
- `pnpm lint:fix`
  - Runs ESLint with automatic fixes where possible.
- `pnpm os2l:cue`
  - Sends a TCP payload to the local OS2L listener so you can simulate a VirtualDJ cue while the app is running.
  - The app must have `OS2L listening` enabled and a race must already be staged so the trigger is armed.
  - Optional overrides can be passed through npm, for example:
    - `pnpm os2l:cue -- --event play`
    - `pnpm os2l:cue -- --message '{"evt":"cue","action":"start","id":"race-start"}'`
- `pnpm photo-booth:agent`
  - Starts the Raspberry Pi photo booth kiosk server.
  - Builds and serves the package-local React touchscreen kiosk before starting the booth agent.
  - Defaults to simulator camera, scanner, lights, and umbrella hardware so the flow can be tested
    without the Raspberry Pi.
  - Runs from the isolated `tools/photo-booth-agent` pnpm package, so its Node-built
    `better-sqlite3` never collides with the Electron-built root app dependency.
  - Loads `.env`, `.env.local`, `.env.photo-booth`, and `.env.photo-booth.local` before launching
    the isolated package.
  - Stores accepted photos waiting to sync in `GOLDSPRINTS_BOOTH_DATA_DIR/photo-booth.sqlite`.
  - For local fake-token testing, open the kiosk and type `fake:Test Rider` into the manual QR
    input. Fake QR is enabled automatically when the booth camera is in simulator mode or the
    scanner is manual/simulated. Set `GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR=1` to force-enable it for
    hardware tests, or `GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR=0` to force-disable it.
  - To make simulator capture/review look real, put your sample image at
    `tools/photo-booth-agent/assets/simulated-dslr-photo.jpg`. Simulator camera captures copy that
    file into the temporary capture folder. Override with `GOLDSPRINTS_BOOTH_SIMULATOR_PHOTO_PATH`
    if you want a different location; relative paths are resolved from the repo root first and the
    booth package directory second.
  - Configure the real booth with environment variables:
    - `GOLDSPRINTS_BOOTH_SERVER_URL=http://<admin-laptop-ip>:3187`
    - `GOLDSPRINTS_BOOTH_ID=<value from admin settings>`
    - `GOLDSPRINTS_BOOTH_SECRET=<value from admin settings>`
    - `GOLDSPRINTS_BOOTH_CAMERA=gphoto2`
    - `GOLDSPRINTS_BOOTH_SCANNER_MODE=serial`
    - `GOLDSPRINTS_BOOTH_SCANNER_SERIAL_PORT=/dev/serial0`
    - `GOLDSPRINTS_WLED_SERIAL_PORT=/dev/ttyUSB0`
    - `GOLDSPRINTS_UMBRELLA_MODE=process`
    - `GOLDSPRINTS_UMBRELLA_STEP_PIN=17`
    - `GOLDSPRINTS_UMBRELLA_DIR_PIN=27`
    - `GOLDSPRINTS_UMBRELLA_ENABLE_PIN=22`
    - `GOLDSPRINTS_UMBRELLA_HALL_PIN=23`
    - `GOLDSPRINTS_BOOTH_DATA_DIR=/home/pi/goldsprints-booth`
- `pnpm photo-booth:doctor`
  - Runs booth hardware diagnostics without starting a racer session.
  - Checks the scanner, camera, WLED serial control, umbrella helper, hall sensor status, and local
    queue wiring using the same `.env.photo-booth` config as the agent.
- `pnpm quality`
  - Runs the formatting and lint gate used before handoff: `format:check` then `lint`.
- `pnpm typecheck`
  - Runs TypeScript in no-emit mode for the renderer config, backend/node config, and isolated
    photo booth agent package.
- `pnpm test`
  - Runs the Vitest suite once.
  - Current coverage focuses on race metrics, queue behavior, theme validation, tournament logic,
    and photo booth queue/state behavior.
- `pnpm test:watch`
  - Runs Vitest in watch mode for local development.
- `pnpm rebuild:native`
  - Rebuilds Electron-native dependencies such as `better-sqlite3` against the Electron runtime.
  - Use this if native module ABI issues appear after dependency or Electron version changes.
- `pnpm postinstall`
  - Automatically calls `rebuild:native` after dependency installation so the app is ready for Electron immediately.
  - Drizzle Studio no longer needs a matching rebuild because it runs from its own isolated pnpm package.

## Data And Persistence

Runtime data is stored under Electron's user-data directory in a `runtime` folder. That includes:

- `goldsprints.sqlite`
- uploaded racer avatars
- photo booth DSLR originals and generated avatar display assets

When running `pnpm dev`, runtime data defaults to `.goldsprints-dev/runtime` so local resets are easy
and safe. Set `GOLDSPRINTS_DATA_DIR` in `.env.local` if you need a different local database/upload
folder.

The app is designed to recover from restarts. If shutdown happens during countdown or an active race, that race is restored as interrupted and can be resumed, restarted, or finalized from the admin UI.

## Kaleidoscope Photo Booth

The photo booth is designed as a Raspberry Pi 5 appliance rather than as part of the admin laptop
UI. The Pi runs `pnpm photo-booth:agent`, serves a local React touchscreen kiosk page, reads the
mounted 2D QR scanner over serial/GPIO, controls the Sony Alpha 7 through `gphoto2`, sends WLED JSON
commands to the ESP32 over USB serial, and controls the umbrella stepper/hall sensor through a small
Python GPIO helper process.

Flow:

1. A racer registers on `/racer`.
2. Their `Your Race Card` shows a short-lived photo booth QR.
3. The booth scans the QR, turns WLED photo lights white, starts a slow umbrella spin, and shows the
   touchscreen photo controls.
4. The racer can choose a predetermined LED look from an iOS-style visual wheel picker and either
   keep the umbrella spinning or choose an umbrella panel from the right-edge wheel picker.
5. The capture button starts a countdown, freezes the umbrella for the DSLR shot, keeps the selected
   LED look active, captures with the Sony, and shows a preview.
6. The racer accepts, retakes, or cancels.
7. Accepted originals upload to the main GoldSprints backend. If the backend is unavailable, the Pi
   stores the accepted capture in a local SQLite queue and syncs it later.
8. The main backend stores the DSLR original separately from the app avatar URL and updates the
   racer avatar across admin, racer, and race displays.

Admin pairing/status lives in `Settings -> Kaleidoscope Photo Booth`. The pairing secret is shown
only on the admin settings API, not in the general live snapshot sent to racer phones. The same card
also shows hardware health for scanner, camera, lights, umbrella, hall sensor, and pending uploads.

The TMC2209 driver needs separate motor power and current limiting; the Raspberry Pi GPIO pins only
send STEP/DIR/ENABLE logic. Run `pnpm photo-booth:doctor` before events to verify `gphoto2
--auto-detect`, scanner serial reads, WLED serial JSON, hall sensor trigger, homing direction, and
panel indexing.

LED looks are defined in the booth package as a TypeScript manifest. The kiosk intentionally shows
visual-only picker items and supports infinite direct touch/mouse drag scrolling plus mousewheel or
trackpad input without visible recentering, while labels remain available for accessibility, status
messages, and tests. Use
`GOLDSPRINTS_WLED_DEFAULT_LOOK=<look-id>` if a booth should idle back to a non-white default look.
Built-in look ids are `solid-white`, `solid-red`, `solid-blue`, `kaleidoscope-rainbow`,
`chasing-rainbow`, `sparkle`, and `pride`.

Umbrella panel selection uses a custom right-edge wheel picker. The picker renders a full circular
umbrella wheel, clips it so only the left half is visible, and rotates the full wheel with
touch/mouse drag plus mousewheel or trackpad input. Each panel is a pie-shaped slice whose point
converges at the wheel center and whose artwork comes from a JPG manifest in
`tools/photo-booth-agent/src/umbrella-panels.ts`. Put the matching image files in
`tools/photo-booth-agent/public/umbrella-panels/`; by default the expected files are
`panel-01.jpg` through `panel-08.jpg`. As the selected slice changes, the booth sends panel commands
through the existing stepper endpoint so the motor follows the picker.

Manual fake QR testing is supported for development only. Type `fake:Your Name` into the kiosk's
manual QR input to enter photo mode without a signed racer QR or running main app resolver. Fake QR
is enabled automatically for simulator/manual booth runs; use `GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR=1`
to force-enable it with real hardware, or `GOLDSPRINTS_BOOTH_ALLOW_FAKE_QR=0` to force-disable it.
This lets you test lights, umbrella controls, capture, retry, and keep with simulator or real booth
hardware.

For full fake-mode photo review, add a sample image named `simulated-dslr-photo.jpg` in
`tools/photo-booth-agent/assets`. The simulator DSLR adapter copies that file for each fake capture
instead of showing a transparent placeholder. If you configure
`GOLDSPRINTS_BOOTH_SIMULATOR_PHOTO_PATH`, relative paths are resolved from the repo root first and
the booth package directory second.

The booth agent intentionally lives in `tools/photo-booth-agent` instead of the root runtime. That
gives the Pi process its own Node-flavored `better-sqlite3` build while Electron keeps using the
root Electron-flavored native build.

## Database Schema

SQLite schema changes are managed as ordered SQL migrations in `src/backend/db/migrations`.

- This keeps the schema editable as real SQL instead of a TypeScript string.
- VS Code SQLite and SQL-formatting extensions can work directly with the migration files.
- The app records applied migrations in `schema_migrations` and only runs pending files at startup.
- Add future schema changes as new files such as `0002_add-foo.sql` rather than editing older migrations after data already exists.

## Testing Scope

Current automated tests cover:

- speed, distance, and wattage calculations
- queue removal and shifting rules
- theme registry validation
- tournament seed generation
- single-elimination advancement
- double-elimination advancement
- round-robin standings
- groups-to-single-elimination structure

Manual visual testing:

- Open `/bracket-lab` while the dev app is running to replay bracket animation scenarios without
  changing real event data.
- The lab supports theme switching, standard vs center-converging layouts, individual choreography
  phases, and a full projector-style handoff playback.

## Debugging

For day-to-day debugging, the fastest path is:

```bash
pnpm dev:debug
```

That gives you three places to look:

- The terminal where you started the app
  - Electron main-process logs show here.
  - Embedded backend request logs show here in debug mode.
  - Renderer `console.error` output is mirrored here, which is especially useful for failed button actions.
- Electron DevTools
  - DevTools open automatically in `dev:debug`.
  - This is where renderer `console.log`, network requests, and React-side exceptions appear.
- VS Code debugger
  - A ready-made attach config lives in `.vscode/launch.json`.
  - Start `pnpm dev:debug`, then run the `Attach Electron + Renderer` compound launch config.
  - `Attach Electron Main` lets you step through `src/electron` and the embedded backend in `src/backend`.
  - `Attach Electron Renderer` lets you step through React code in `src/renderer`.

Useful notes:

- `pnpm dev:debug:break` is best when you need to catch startup issues before windows open.
- Keyboard shortcuts still work if you want DevTools manually:
  - macOS: `Cmd+Opt+I`
  - Windows/Linux: `Ctrl+Shift+I`
- The main process and backend share the Electron process in development, so breakpoints in both `src/electron/main.ts` and backend service files will hit in the same Node debugger session.
- If a button appears to do nothing, check the terminal first. In debug mode, failed API calls and unhandled renderer action errors should show up there.

## Themes

Themes are manifest-driven. Each theme defines:

- color tokens
- font family
- race orientation
- semantic surface, UI, connector, and race-graphic variants
- optional race-graphic labels and map markers
- a bundled race-avatar sprite sheet, including separate slow and fast animation rows

The selected theme is applied globally through CSS variables and semantic DOM attributes. Renderer
components and CSS should branch on manifest attributes such as `orientation`, `uiStyle`,
`surfaceStyle`, `connectorStyle`, and `raceGraphic.variant`, not on concrete theme IDs.

Moving race avatars are resolved in the renderer from the theme's sprite-sheet id. To replace a
theme sprite, keep the declared frame grid in [src/shared/themes.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/shared/themes.ts) aligned with the asset in [src/renderer/assets/sprites](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/goldSprints/src/renderer/assets/sprites): row `0` is the slower animation and row `1` is the faster animation by default.

The DOS-inspired `Oregon Trail '90` theme also bundles an IBM VGA bitmap recreation so the intended projector typography does not depend on fonts installed on the host machine.

## Tournament Bracket Layouts

Elimination tournaments use a custom React Flow board rather than a fixed third-party bracket
widget. That gives the app control over:

- theme-aware matchup cards
- winners, losers, and reset connector styling
- completed advancement path highlights and projector-side connector draw animations
- interactive staging from the admin board
- viewport controls like `Fit Board`, `Focus Current`, and `Expand View`
- an admin workspace mode where the bracket card can take over the tournament tab while the other
  cards animate out of the way
- a racer-page takeover mode where the same bracket can expand with the same coordinated resize
  animation while the other racer cards animate out of the way

Direct elimination starts can choose a board layout:

- `Auto`
  - Uses the standard left-to-right bracket for small single-tree fields.
  - Switches to a center-converging layout for larger single-elimination boards.
- `Standard`
  - Uses the traditional bracket columns flowing in one direction.
- `Center-converging`
  - Available for single-tree brackets.
  - Splits the early rounds to both sides and brings the finals together in the center.

Double elimination currently stays on the standard winners/losers board layout even when `Auto` is
selected.

## Third-Party Assets

- `src/renderer/assets/fonts/oldschool-pc-fonts/WebPlus_IBM_VGA_8x16.woff`
  - from The Ultimate Oldschool PC Font Pack by VileR
  - source: [int10h.org/oldschool-pc-fonts](https://int10h.org/oldschool-pc-fonts/)
  - license: CC BY-SA 4.0
  - bundled attribution and license text live alongside the font asset in `src/renderer/assets/fonts/oldschool-pc-fonts`

## Current Limitations

- The real USB bike sensor adapter is still a placeholder seam.
- OS2L wiring is scaffolded, but real VirtualDJ cue integration is not validated end-to-end yet.
- `cloudflared` integration depends on the binary being installed locally.
- Tournament replacement / bye-management workflows for removing racers mid-tournament are still
  partial in the admin UI.

## Quality Gate

Before handing work back, the expected repo gate is:

```bash
pnpm quality
```

For code changes that touch TypeScript behavior, it is also worth running:

```bash
pnpm typecheck
```
