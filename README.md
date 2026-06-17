# Roller Rumble

Roller Rumble is a local-first Electron app for running live stationary-bike race events. It ships one desktop shell with an embedded backend and three user-facing surfaces:

- `Admin Display` for hosts on the laptop
- `Race Display` for the projector or secondary screen
- `Racer Page` for phones over the local network or a `cloudflared` tunnel

The current codebase supports open time trial operation, live race presentation, persistent event
data, passkey registration, event-scoped payments, Web Push notifications, theme support, live
tournament operation, and the Raspberry Pi photo booth workflow.

## What The App Does

- Creates and persists events
- Requires racer self-registration through email plus a passkey, with host-assisted recovery when
  an older email identity does not have a passkey yet
- Keeps accountless racer signup available only when admins explicitly enable it, requires a
  display name, and lets accountless racers later attach an email/passkey to preserve the same
  profile
- Tracks event-scoped entrance-fee amount/status and can require Stripe Checkout payment before
  racers add themselves to the queue; host/admin queue actions can still bypass payment
- Sends racer notifications through browser Web Push when configured, with full-screen in-app
  modals while the racer page is open and a debug-only notification history list
- Turns the racer identity card into `Your Race Card` after signup instead of leaving a separate
  register card on screen
- Lets racers upload avatars
- Lets racers generate a short-lived kaleidoscope photo booth QR after registration so a paired
  Raspberry Pi booth can capture a DSLR avatar for them
- Manages an open time trial queue with solo, auto-matched head-to-head, and locked challenge
  entries
- Treats the open time trial queue as stable ordered slots and derives the visible race list from
  those slots, pairing flexible racers while keeping locked challenges in place
- Tracks each queue signup as its own occurrence so repeated signups have separate bump/wait
  priority and per-racer active queue limits; priority is used when new slots enter instead of
  constantly re-sorting the lineup
- Places challenge matches at the soonest existing flexible queue spot when either racer is already
  waiting, reusing both racers' existing queue occurrences when both are already queued
- Lets a max-queued racer who is only in locked challenge matches pick which queued challenge to
  replace when they challenge someone else; the former opponent stays in the flexible queue, and
  racers who are fully challenge-locked cannot be challenged by others until they have room
- Protects the first three derived races from being bumped by new queue insertions
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
- Lets admins click bracket matches to stage races, undo safe results, remove active racers, or
  fill editable BYE slots from context-aware menus
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
- `SQLite` is the source of truth for events, racers, passkey credentials, event payment config/status,
  queue entries, races, results, tournaments, push subscriptions, notification deliveries, and
  settings.
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

## Racer Auth And Payments

The Racer Page uses real WebAuthn/passkeys for self-registration and sign-in. Passkeys require a
secure browser origin, so phones should use the Cloudflare HTTPS tunnel in production; localhost is
acceptable for development. The backend stores passkey credentials in SQLite and issues a signed
HTTP-only racer session cookie after a successful passkey ceremony. The browser also keeps the same
signed session token in local storage as a fallback for dev/tunnel cases where cookie handling is
inconsistent across origins, so refreshing the racer page should keep the racer signed in.

If an email exists but has no passkey credential yet, the racer page tells the racer to see the
host instead of allowing an unsafe self-claim. Admins can still create racers from the admin
console.

Payment enforcement is event-scoped. The Event tab lets hosts set the current event's entrance fee
and whether payment is required before racer-page queue signup. If payment is required and the racer
has not been marked `paid` or `waived` for that event, the Racer Page starts Stripe Checkout and
returns to `/racer` after payment. Stripe webhooks mark the event racer `paid` and automatically
queue the stored join/challenge intent. Admin queue controls intentionally bypass the gate so hosts
can resolve cash, comp, or edge-case desk flows.

Stripe is enabled with:

- `ROLLER_RUMBLE_STRIPE_SECRET_KEY`
- `ROLLER_RUMBLE_STRIPE_WEBHOOK_SECRET`
- `ROLLER_RUMBLE_PUBLIC_RACER_URL`

Apple Pay, Google Pay, Link, and cards are handled by Stripe-hosted Checkout and the payment methods
enabled in the Stripe Dashboard. In local development, use the Stripe CLI to forward webhooks to
`/api/webhooks/stripe`.

The Stripe CLI does not create Checkout sessions for the app; it only forwards completed/expired
webhook events back to Roller Rumble after Stripe Checkout runs. The desktop app must still be able
to make outbound HTTPS requests to Stripe when an unpaid racer queues. Use `Event -> Event Payments
-> Test Stripe Connection` to confirm that Roller Rumble can authenticate with Stripe and reach the
Stripe API from the machine running the app. If that test fails, check the secret key, internet/VPN
access, firewall/proxy settings, and whether the app was restarted after changing `.env.local`.

Some networks use HTTPS inspection tools such as Zscaler. In that case, `curl` or Safari may trust
Stripe because macOS/Windows trusts the company certificate, while Node/Electron still rejects it
with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` or a generic Stripe connection failure. Export the trusted
company root/intermediate certificate as a PEM file, then add it to `.env.local`:

```bash
ROLLER_RUMBLE_STRIPE_EXTRA_CA_CERT_FILE=/absolute/path/to/company-ca.pem
```

On macOS, a common way to export a Zscaler certificate is:

```bash
security find-certificate -a -c "Zscaler" -p > ~/Documents/zscaler-ca.pem
```

Then set:

```bash
ROLLER_RUMBLE_STRIPE_EXTRA_CA_CERT_FILE=/Users/your-name/Documents/zscaler-ca.pem
```

Fully quit and reopen Roller Rumble after changing the env file, then run `Test Stripe Connection`
again. Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0`; it disables TLS verification entirely.

## Racer Notifications

The Racer Page supports true browser Web Push plus an in-page full-screen modal. Web Push requires HTTPS on
phones, so use the Cloudflare tunnel URL for event use. Racers are prompted to enable notifications
the first time they press a queue/challenge button, and admin-queued racers see the same enable
button when they open their race card.

The easiest setup path is inside the admin app:

1. Open `Settings -> Environment`.
2. Click `Create & Open Env File` if the file does not exist yet.
3. Click `Generate Push Keys`.
4. Fully quit and reopen Roller Rumble.

That button writes these values into `.env.local` for you:

- `ROLLER_RUMBLE_WEB_PUSH_PUBLIC_KEY`
- `ROLLER_RUMBLE_WEB_PUSH_PRIVATE_KEY`
- `ROLLER_RUMBLE_WEB_PUSH_SUBJECT`

The command-line fallback is still available with `pnpm notifications:keys`, but installed-app users
should use the Settings button.

Automatic notifications currently include the “3rd match coming up” queue alert and tournament-start
alerts for racers seeded into an active tournament. Admins can also send messages from the Settings
tab to all event racers, queued racers, active tournament racers, or a selected racer list. If Web
Push is unavailable or not configured, incoming notification records still appear as dismissible
in-app modals while the racer page is open. A racer-page notification history list is available only
when the Admin Settings notification debug toggle is enabled. Clicking a system notification opens
the racer page with that notification selected so the matching in-app modal appears after load.

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
  - Web Push setup health, admin-sent racer notifications, and racer notification debug-list toggle
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
  - mobile-first bottom tabs for `Race`, `Queue`, `Tournament`, `Racers`, and `Me`
  - email/passkey sign-in and registration
  - optional admin-enabled accountless registration with a required display name
  - accountless-to-passkey account upgrade
  - avatar upload
  - short-lived photo booth QR for DSLR avatar capture after registration
  - payment-aware queue signup
  - Web Push opt-in plus full-screen in-page notification modals
  - challenge signup from Race controls or the Racers tab
  - a challenge replacement picker when every active queue spot is already a locked challenge
  - upcoming races, with the Race tab previewing the next three open queue matches and linking to
    the full Queue tab when more are waiting
  - racer list with inline expanded stats for each event racer
  - full personal stats in the `Me` tab alongside account, avatar, and notification tools, with
    existing-avatar replacement available from a small image edit control and the photo booth QR in
    its own card
  - the active tournament, or the most recent completed tournament when none is active; while a
    tournament is active, the Race tab previews current-stage tournament matches instead of open
    queue controls
  - in-place live tournament brackets and standings, with racer-facing mobile bracket controls kept
    outside the canvas
  - optional admin-enabled read-only public browsing before sign-in; queueing, challenges,
    notifications, avatars, photo booth QR, account upgrades, sign-out, and tournament opt-out still
    require a signed-in racer
- `/bracket-lab`
  - developer test page for replaying tournament bracket camera and connector handoff animations
    against mocked bracket data
- `/queue-lab`
  - developer test page for exercising open time trial queue projection, repeated signups,
    challenges, removals, race completion, bump counts, and active-entry limits
- `/notification-lab`
  - developer test page for sending any supported racer notification type to event groups or
    selected registered racers through the real Web Push/in-app notification pipeline

Installed desktop builds can also open these pages from `Settings -> Lab Pages`, which launches the
selected lab in the system default browser.

## Project Layout

- `apps/desktop`
  - workspace package `@roller-rumble/desktop`
  - owns the Electron shell, embedded backend, Vite renderer, Drizzle config, and desktop build
- `apps/desktop/src/electron`
  - Electron main-process entrypoint
- `apps/desktop/src/backend`
  - embedded server, adapters, persistence, and race/tournament services
  - SQLite schema migrations live in `apps/desktop/src/backend/db/migrations/*.sql`
  - the typed Drizzle schema mirror lives in `apps/desktop/src/backend/db/schema.ts`
- `apps/desktop/src/renderer`
  - React UI, file-based routes, API client, and theme-aware components
  - bundled webfont assets for period-specific themes live in `apps/desktop/src/renderer/assets/fonts`
  - bundled race-avatar sprite sheets live in `apps/desktop/src/renderer/assets/sprites`
  - generated TanStack route tree lives in `apps/desktop/src/renderer/routeTree.gen.ts`
- `packages/shared/src`
  - workspace package `@roller-rumble/shared`
  - shared constants, types, validation, presets, and themes imported through package subpaths
- `packages/shared-ui/src`
  - workspace package `@roller-rumble/shared-ui`
  - React UI primitives, shared component CSS, and theme DOM helpers used by the desktop renderer
    and Raspberry Pi booth kiosk
- `tools/photo-booth-agent`
  - isolated Raspberry Pi kiosk agent package with its own Node-built native dependencies
  - camera/light adapters, local SQLite upload queue, and booth state machine
- `tools/db-studio`
  - isolated Drizzle Studio package with its own Node-built SQLite dependency

Important files:

- [apps/desktop/src/electron/main.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/electron/main.ts)
- [apps/desktop/src/backend/server.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/backend/server.ts)
- [apps/desktop/src/backend/db/migrations/0001_initial-schema.sql](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/backend/db/migrations/0001_initial-schema.sql)
- [apps/desktop/src/backend/db/schema.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/backend/db/schema.ts)
- [apps/desktop/drizzle.config.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/drizzle.config.ts)
- [apps/desktop/src/backend/services/app.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/backend/services/app.ts)
- [apps/desktop/src/backend/services/competition.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/backend/services/competition.ts)
- [apps/desktop/src/backend/services/notifications.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/backend/services/notifications.ts)
- [apps/desktop/src/renderer/router.tsx](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/renderer/router.tsx)
- [apps/desktop/src/renderer/components/elimination-bracket-view.tsx](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/renderer/components/elimination-bracket-view.tsx)
- [apps/desktop/src/renderer/components/tournament-flow-layout.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/renderer/components/tournament-flow-layout.ts)
- [packages/shared/src/themes.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/packages/shared/src/themes.ts)
- [tools/photo-booth-agent/src/agent.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/tools/photo-booth-agent/src/agent.ts)

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

- Node.js 22 is the project runtime version
- pnpm 9.15.9 is the project package-manager version
- `mise` is recommended for automatically installing and selecting the right Node/pnpm versions
- macOS or Windows for the intended desktop runtime
- `cloudflared` is optional at first run: Roller Rumble can use an existing binary, or install an
  app-managed macOS/Windows binary into its runtime tools folder.

## Tool Versions With mise

Roller Rumble includes a committed `mise.toml` that pins the local development tools:

- `node@22`
- `pnpm@9.15.9`

After installing mise globally and activating it in your shell, run this once from the repo root:

```bash
mise trust
mise install
```

Then the normal project commands can be run through mise:

```bash
mise run install
mise run dev
```

You can also run `pnpm dev` directly after mise is active. mise will put the pinned Node and pnpm
versions on your `PATH` whenever your shell is inside this repo.

If mise is not installed yet, the Corepack fallback still works:

```bash
corepack pnpm install
corepack pnpm dev
```

## Getting Started

1. Install dependencies:

```bash
mise run install
```

2. Optional: copy the example environment file if you want persistent local defaults:

```bash
cp .env.example .env.local
```

3. Start the app in development:

```bash
mise run dev
```

4. Use the admin window to create an event and stage races.

Development mode starts:

- Vite on `http://127.0.0.1:5173`
- the embedded backend on `http://127.0.0.1:3187` by default
- an Electron admin window
- an Electron race display window
- dev runtime data inside `.roller-rumble-dev/runtime`

The racer page is available through the backend route at `/racer`. Projector/admin racer QR codes
point to `/racer?eventId=<activeEventId>&source=projector` so phones can carry non-secret event
context from the scan. The live event state still comes from `/api/snapshot`; the query params are
advisory context, not authorization.

Admin QR codes and photo booth pairing use the machine's LAN address when one can be detected, for
example `http://192.168.1.42:3187/racer?eventId=event_123&source=projector`, so phones and the
Raspberry Pi can reach the host app over the event network. If the laptop has multiple adapters and
the auto-detected address is wrong, set `ROLLER_RUMBLE_LOCAL_SERVER_HOST=<laptop LAN IP>` in
`.env.local`.

## Environment Configuration

The Electron main process and embedded backend load dotenv files at startup. The standard order is:

1. `.env`
2. `.env.local`

Shell-provided environment variables always win. Values from `.env.local` can override values from
`.env`, which keeps checked-in examples boring and local machine overrides easy.

Installed desktop builds also read `.env` and `.env.local` from the app's per-user config folder.
Those installed-app files are the easiest place to keep secrets and machine-specific values:

- Windows: `%APPDATA%\Roller Rumble\.env.local`
- macOS: `~/Library/Application Support/Roller Rumble/.env.local`

In the installed app, open `Settings -> Environment` and use `Create & Open Env File` if the file
does not exist yet. Roller Rumble creates a starter `.env.local` with common commented settings.
Edit the file, save it, then restart Roller Rumble. Runtime environment values are read at startup,
so changes do not take effect until the app restarts.

The generated file includes plain-language instructions and examples. Use `Generate Push Keys` in
that same Environment card to automatically fill in the Web Push notification keys.

When both the launch folder and app config folder contain dotenv files, Roller Rumble reads the
launch folder first and the app config folder second. That means installed-app `.env.local` values
can override a plain `.env` file, while shell-provided environment variables still have final
priority.

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

`ROLLER_RUMBLE_LOCAL_SERVER_HOST` optionally overrides the LAN host advertised by the desktop app in
local QR codes and Raspberry Pi photo booth pairing. Leave it unset for Wi-Fi/Ethernet auto-detect;
set it when macOS/Windows chooses a VPN, virtual adapter, or other address the Pi cannot reach.

Only variables prefixed with `VITE_` are exposed to browser renderer code by Vite. Keep secrets such
as `ROLLER_RUMBLE_BOOTH_SECRET` in backend/agent dotenv files, not in `VITE_*` variables.
`VITE_API_BASE` is only honored for loopback pages such as the local Vite dev server; public tunnel
visitors use the current `https://...` origin so REST and WebSocket requests route through
Cloudflare instead of trying to connect to `127.0.0.1` on the visitor's device.

Stable Cloudflare tunnels are configured through backend-only variables. For the Birdsnest event
domain, keep the token in `.env.local` and never commit it:

```bash
ROLLER_RUMBLE_TUNNEL_MODE=token
ROLLER_RUMBLE_TUNNEL_NAME=Roller Rumble
ROLLER_RUMBLE_PUBLIC_RACER_URL=https://roller-rumble.birdsnest.family/racer
ROLLER_RUMBLE_TUNNEL_TOKEN=<token from Cloudflare>
```

Quick tunnel mode remains available with `ROLLER_RUMBLE_TUNNEL_MODE=quick`. Binary lookup prefers
`ROLLER_RUMBLE_CLOUDFLARED_PATH`, then the app-managed install, then a `cloudflared` found on `PATH`.
Dev mode allows `roller-rumble.birdsnest.family` through Vite's host protection; add more
comma-separated hosts with `ROLLER_RUMBLE_VITE_ALLOWED_HOSTS` if a future event uses another public
domain while pointed at the Vite dev server.

In Cloudflare Zero Trust, the `Roller Rumble` Public Hostname should be configured with:

- Hostname: `roller-rumble.birdsnest.family`
- Path: empty
- Service type: `HTTP`
- Service URL: `127.0.0.1:3187`

Do not point the public hostname at Vite's `5173` dev server and do not set the Public Hostname path
to `/racer`. The racer page itself lives at `/racer`, but the tunnel must expose the app root so
assets, `/api/*`, `/uploads/*`, and WebSocket traffic can all load.
In dev mode, the embedded backend also proxies Vite's hot-reload websocket so tunneled browser
testing does not produce unrelated Vite websocket failures.

## Scripts

- `pnpm dev`
  - Starts the Vite dev server and the Electron app together.
  - Electron points at the live Vite renderer while still using the embedded backend.
  - `--strictPort` keeps Vite pinned to `5173` so Electron always knows where to connect.
  - Intentional shutdown with `Ctrl+C` exits cleanly without reporting a pnpm lifecycle failure,
    while real child-process failures still exit non-zero.
- `pnpm dev:debug`
  - Starts the app in dev mode with Electron's Node inspector on `9229` and Chromium remote debugging on `9223`.
  - Opens renderer DevTools automatically.
  - Mirrors renderer console output and backend request logs into the terminal so failed button clicks are easier to spot.
- `pnpm dev:debug:break`
  - Same as `dev:debug`, but pauses Electron on startup so you can attach a debugger before app bootstrap runs.
- `pnpm build`
  - Builds the renderer with Vite and bundles the Electron entry with `tsup`.
  - The Electron bundle inlines workspace shared TypeScript packages so `pnpm start` does not try
    to load raw `.ts` files from `packages/shared`.
  - Copies runtime assets such as SQLite migration files into `apps/desktop/dist/electron`.
  - This creates distributable app assets in `apps/desktop/dist/`, but it does not create an installer.
- `pnpm cloudflared:install`
  - Downloads the official `cloudflared` release for macOS arm64, macOS x64, or Windows x64 into
    the Roller Rumble runtime tools folder.
  - Verifies the binary with `cloudflared --version`.
  - Does not use Homebrew, winget, or admin-level system installs.
- `pnpm cloudflared:doctor`
  - Prints tunnel mode, public URL, tunnel name, binary source, version, install path, and any
    current setup error.
  - When a public URL is configured, checks `<public-origin>/api/health`, `/racer`, and the `/ws`
    WebSocket upgrade to catch Cloudflare routes that only match part of the app.
  - If `/api/health` works but `/racer` or `/ws` fails, the Public Hostname is probably path-scoped
    instead of routing the empty root path to `http://127.0.0.1:3187`.
  - Exits non-zero when no usable `cloudflared` binary is available.
- `pnpm cloudflared:version`
  - Prints the resolved `cloudflared --version` output using the same lookup order as the app.
- `pnpm notifications:keys`
  - Generates VAPID keys for browser Web Push and prints the `.env.local` variables to add.
  - The admin `Settings -> Environment -> Generate Push Keys` button is easier for installed-app
    users because it writes the values into the correct `.env.local` file automatically.
  - The private key should stay local and must not be committed.
- `pnpm dev:reset-data`
  - Deletes the repo-local dev runtime directory at `.roller-rumble-dev/runtime`.
  - Use this when you want a fresh SQLite database, cleared uploads, and no leftover dev event data.
  - Stop the running dev app first so SQLite files are not in use.
- `pnpm db:studio`
  - Opens Drizzle Studio against the current SQLite database path from `apps/desktop/drizzle.config.ts`.
  - Useful for inspecting the live dev database with the same typed schema the app code uses.
  - This helps with exploration only; runtime migrations still come from `apps/desktop/src/backend/db/migrations/*.sql`.
  - Runs from the isolated `tools/db-studio` pnpm package, so its Node-built `better-sqlite3` never overwrites the Electron build used by the app itself.
  - The first run bootstraps that isolated tooling package automatically if it has not been installed yet.
- `pnpm start`
  - Launches Electron against the built app.
  - Use this after `pnpm build`.
- `pnpm package:dir`
  - Builds the app and creates an unpacked Electron app in `apps/desktop/release`.
  - This is the fastest packaging smoke test because it skips installer creation.
- `pnpm package:app`
  - Builds the app and runs Electron Builder for the current platform.
  - Installer/package output is written to `apps/desktop/release`.
- `pnpm package:mac`
  - Builds a macOS package from macOS.
  - Current builds are unsigned unless signing/notarization credentials are configured.
- `pnpm package:win`
  - Builds a Windows package from Windows for the most reliable result.
  - Current builds are unsigned unless code-signing credentials are configured.
- `pnpm release:patch`
  - Requires a clean git worktree and at least one bullet under `CHANGELOG.md -> Unreleased`.
  - Bumps `0.0.x`, commits `package.json`, `apps/desktop/package.json`, and `CHANGELOG.md`, creates
    a `v*.*.*` git tag, and pushes the branch and tag.
  - Pushing the tag starts the GitHub Actions release workflow, which builds macOS and Windows
    packages on native runners and publishes them to GitHub Releases.
- `pnpm release:minor`
  - Same as `release:patch`, but bumps `0.x.0` for feature releases.
- `pnpm release:major`
  - Same as `release:patch`, but bumps `x.0.0` for breaking releases or large compatibility shifts.
- `pnpm preview`
  - Serves the built Vite renderer for inspection outside Electron.
  - Useful when checking static renderer output only.
- `pnpm format`
  - Runs Prettier in write mode across the repo.
- `pnpm format:check`
  - Verifies Prettier formatting without changing files.
- `pnpm lint`
  - Runs the strict ESLint ruleset, including TypeScript, React Hooks, TanStack Query, React Doctor,
    and unused import checks.
  - React Doctor is enabled with an explicit baseline override for broad advisory refactors so the
    lint gate stays clean while future non-baselined React issues still surface.
- `pnpm lint:fix`
  - Runs ESLint with automatic fixes where possible.
- `pnpm os2l:cue`
  - Sends a TCP payload to the local OS2L listener so you can simulate a VirtualDJ cue while the app is running.
  - The app must have `OS2L listening` enabled and a race must already be staged so the trigger is armed.
  - If the payload includes `countdownMs`, Roller Rumble counts down for that many milliseconds
    before the race starts. If it is omitted, the countdown defaults to `3000` milliseconds.
  - Optional overrides can be passed through npm, for example:
    - `pnpm os2l:cue -- --dryRun --countdownMs 5000`
    - `pnpm os2l:cue -- --event play`
    - `pnpm os2l:cue -- --countdownMs 5000`
    - `pnpm os2l:cue -- --message '{"evt":"cue","action":"start","id":"race-start","countdownMs":2500}'`
  - `--dryRun` prints the payload without connecting to Roller Rumble.
- `pnpm photo-booth:agent`
  - Starts the Raspberry Pi photo booth kiosk server.
  - Builds and serves the package-local React touchscreen kiosk before starting the booth agent.
  - Defaults to simulator camera, scanner, lights, and umbrella hardware so the flow can be tested
    without the Raspberry Pi.
  - Runs from the isolated `tools/photo-booth-agent` pnpm package, so its Node-built
    `better-sqlite3` never collides with the Electron-built desktop app dependency.
  - Loads `.env`, `.env.local`, `.env.photo-booth`, and `.env.photo-booth.local` before launching
    the isolated package.
  - Stores accepted photos waiting to sync in `ROLLER_RUMBLE_BOOTH_DATA_DIR/photo-booth.sqlite`.
  - For local fake-token testing, open the kiosk and type `fake:Test Rider` into the manual QR
    input. Fake QR is enabled automatically when the booth camera is in simulator mode or the
    scanner is manual/simulated. Set `ROLLER_RUMBLE_BOOTH_ALLOW_FAKE_QR=1` to force-enable it for
    hardware tests, or `ROLLER_RUMBLE_BOOTH_ALLOW_FAKE_QR=0` to force-disable it.
  - To make simulator capture/review look real, put your sample image at
    `tools/photo-booth-agent/assets/simulated-dslr-photo.jpg`. Simulator camera captures copy that
    file into the temporary capture folder. Override with `ROLLER_RUMBLE_BOOTH_SIMULATOR_PHOTO_PATH`
    if you want a different location; relative paths are resolved from the repo root first and the
    booth package directory second.
  - Configure the real booth with environment variables:
    - `ROLLER_RUMBLE_BOOTH_SERVER_URL=http://<admin-laptop-ip>:3187`
    - `ROLLER_RUMBLE_BOOTH_ID=<value from admin settings>`
    - `ROLLER_RUMBLE_BOOTH_SECRET=<value from admin settings>`
    - `ROLLER_RUMBLE_BOOTH_CAMERA=gphoto2`
    - `ROLLER_RUMBLE_BOOTH_SCANNER_MODE=serial`
    - `ROLLER_RUMBLE_BOOTH_SCANNER_SERIAL_PORT=/dev/serial0`
    - `ROLLER_RUMBLE_WLED_SERIAL_PORT=/dev/ttyUSB0`
    - `ROLLER_RUMBLE_UMBRELLA_MODE=process`
    - `ROLLER_RUMBLE_UMBRELLA_STEP_PIN=17`
    - `ROLLER_RUMBLE_UMBRELLA_DIR_PIN=27`
    - `ROLLER_RUMBLE_UMBRELLA_ENABLE_PIN=22`
    - `ROLLER_RUMBLE_UMBRELLA_HALL_PIN=23`
    - `ROLLER_RUMBLE_BOOTH_DATA_DIR=/home/pi/roller-rumble-booth`
- `pnpm photo-booth:doctor`
  - Runs booth hardware diagnostics without starting a racer session.
  - Checks the scanner, camera, WLED serial control, umbrella helper, hall sensor status, and local
    queue wiring using the same `.env.photo-booth` config as the agent.
- `pnpm photo-booth:test`
  - Runs the isolated Raspberry Pi booth agent Vitest suite.
  - Useful when working only on kiosk, adapter, queue, or booth state-machine code.
- `pnpm photo-booth:typecheck`
  - Runs TypeScript in no-emit mode for the isolated booth agent package.
  - This is the booth-only version of the root `pnpm typecheck` booth step.
- `pnpm quality`
  - Runs the formatting and lint gate used before handoff: `format:check` then `lint`.
- `pnpm typecheck`
  - Runs TypeScript in no-emit mode for shared packages, the desktop renderer/node configs, and
    the isolated photo booth agent package.
- `pnpm test`
  - Runs the Vitest suite once.
  - Current coverage focuses on race metrics, queue behavior, theme validation, tournament logic,
    and photo booth queue/state behavior.
- `pnpm test:watch`
  - Runs Vitest in watch mode for local development.
- `pnpm rebuild:native`
  - Rebuilds Electron-native dependencies such as `better-sqlite3` against the Electron runtime.
  - Use this if native module ABI issues appear after dependency or Electron version changes.
  - Drizzle Studio and the photo booth agent do not use this rebuild because they run from isolated
    pnpm packages with Node-built native dependencies.

## Data And Persistence

Runtime data is stored under Electron's user-data directory in a `runtime` folder. That includes:

- `roller-rumble.sqlite`
- uploaded racer avatars
- photo booth DSLR originals and generated avatar display assets

When running `pnpm dev`, runtime data defaults to `.roller-rumble-dev/runtime` so local resets are easy
and safe. Set `ROLLER_RUMBLE_DATA_DIR` in `.env.local` if you need a different local database/upload
folder.

The app is designed to recover from restarts. If shutdown happens during countdown or an active race, that race is restored as interrupted and can be resumed, restarted, or finalized from the admin UI.

## Release Process

Roller Rumble releases are built by GitHub Actions and published to GitHub Releases. The release
workflow builds macOS on a macOS runner and Windows on a Windows runner so Electron and native
dependencies are packaged on their target operating systems.

Use semantic versioning:

- `patch` for bug fixes and small polish, such as `0.1.2` to `0.1.3`
- `minor` for new features or meaningful workflow changes, such as `0.1.3` to `0.2.0`
- `major` for breaking changes, migrations, or large compatibility shifts, such as `1.4.2` to
  `2.0.0`

Before releasing:

1. Commit the code changes that should be included in the release.
2. Add useful notes under `CHANGELOG.md -> Unreleased`.
3. Use bullets that teammates can understand, not just internal commit messages.
4. Make sure the worktree is clean with `git status`.

Release from your Mac with one command:

```bash
pnpm release:patch
```

Use `pnpm release:minor` for feature releases and `pnpm release:major` for breaking releases.

The release command:

1. verifies the worktree is clean
2. verifies `CHANGELOG.md -> Unreleased` has at least one bullet
3. bumps the root and desktop package versions
4. moves the unreleased changelog notes into a dated version section
5. commits the version and changelog changes
6. creates an annotated tag such as `v0.2.0`
7. pushes the branch and tag to GitHub

When the tag reaches GitHub, `.github/workflows/release.yml` builds the macOS and Windows packages,
creates a GitHub Release, attaches the installers, and uses the matching changelog section as the
release notes. The generated GitHub Release also adds download guidance and unsigned-install notes.

To test the GitHub Actions packaging flow without creating a new tag or GitHub Release, open
`Actions -> Release Builds -> Run workflow` in GitHub. Manual workflow runs build the same macOS and
Windows packages and leave them in that run's `Artifacts` section. Only tag-triggered runs publish a
GitHub Release.

Teammates should download from GitHub Releases:

- Windows users should download the `.exe` installer.
- Mac users should download the `.dmg`.

Current builds are unsigned. Windows may show a SmartScreen warning, and macOS may require
right-clicking the app and choosing `Open`. Removing those warnings requires paid code-signing and
notarization setup.

Release builds do not need event runtime secrets in GitHub Actions. Do not put Stripe keys, Web Push
private keys, Cloudflare Tunnel tokens, passkey RP settings, or photo booth pairing secrets into the
release workflow. The packaged app reads those `ROLLER_RUMBLE_*` values at runtime from the host
machine's environment or local dotenv files.

Build-time environment used by the release workflow:

- `CSC_IDENTITY_AUTO_DISCOVERY=false`
  - disables automatic macOS code-signing identity discovery so unsigned CI builds do not fail while
    signing is not configured
- `GITHUB_TOKEN`
  - provided automatically by GitHub Actions and used only by the publish job to create the GitHub
    Release and upload assets

Optional build-time variables:

- `ROLLER_RUMBLE_VITE_ALLOWED_HOSTS`
  - only needed if CI should bake extra Vite dev-server allowed hosts into the renderer build; the
    normal release build does not need this
- `VITE_API_BASE`
  - should normally be omitted for release builds; packaged Electron should use the current app
    origin and embedded backend instead of a hard-coded development API URL

## VirtualDJ Cue Starts

Roller Rumble can start a staged race from a VirtualDJ OS2L cue. Use this when a song has a specific
moment where the race countdown should begin and you want the race to start exactly after that
countdown.

Plain-language version:

- VirtualDJ sends a tiny OS2L message when the song reaches an action cue.
- Roller Rumble listens for that message only on the same computer, on `127.0.0.1:9996` by default.
- Roller Rumble only reacts when `Enable VirtualDJ cue start` is on and a race is already staged.
- The OS2L message must include `roller-rumble-start`.
- Add `countdownMs=<number>` when you want a custom countdown length.
- The number is milliseconds, so `3000` means 3 seconds, `5000` means 5 seconds, and `2500` means
  2.5 seconds.
- If `countdownMs` is missing, Roller Rumble uses `3000`.
- The projector countdown display stays in whole seconds. For example, `2500` milliseconds displays
  `3`, then `2`, then `1`, then starts.

Roller Rumble accepts these VirtualDJ actions:

```text
os2l_button "roller-rumble-start" on
```

```text
os2l_button "roller-rumble-start countdownMs=5000" on
```

Use the first one for the normal 3-second countdown. Use the second one for a 5-second countdown.
Change only the number after `countdownMs=` when you need a different length.

Before editing songs:

1. Start Roller Rumble with `pnpm dev`.
2. In the admin window, create or select the event.
3. Stage a race. The race must be staged before VirtualDJ can start it.
4. Open `Settings`.
5. Turn on `Enable VirtualDJ cue start`.
6. Optional quick test from Terminal. First confirm the simulator command can build the payload:

```bash
pnpm os2l:cue -- --dryRun --countdownMs 5000
```

That should print JSON containing `"id":"roller-rumble-start"` and `"countdownMs":5000`.
Then send the cue to Roller Rumble:

```bash
pnpm os2l:cue -- --countdownMs 5000
```

If a race is staged and the setting is enabled, the projector should show a 5-second countdown and
then start the race. This confirms Roller Rumble is listening before you involve VirtualDJ.

To add a race-start cue to a song in VirtualDJ:

1. Open VirtualDJ on the same computer as Roller Rumble.
2. Find the song in the VirtualDJ browser.
3. Right-click the song and open `POI Editor`.
4. Click `New`.
5. Move the new marker to the exact point where the Roller Rumble countdown should begin.
6. Set `Type` to `Action`.
7. For `Cue Option`, choose the cue behavior you want:
   - Choose an invisible/action-only cue if this should trigger automatically while the song plays.
   - Choose a visible cue/hot cue if the DJ should be able to see or trigger it manually.
8. In `Macro Action`, paste one of these:

```text
os2l_button "roller-rumble-start" on
```

or:

```text
os2l_button "roller-rumble-start countdownMs=5000" on
```

9. Close the POI Editor so VirtualDJ saves the cue.
10. Test the song from a little before the cue marker. When playback reaches the marker, Roller
    Rumble should start the countdown.

Placement tip: put the VirtualDJ action cue where you want the countdown to appear, not where you
want the race to begin. If the race should start on a big downbeat and you use
`countdownMs=3000`, place the cue 3 seconds before that downbeat. If you use `countdownMs=5000`,
place it 5 seconds before that downbeat.

Common examples:

- Normal 3-second countdown:

```text
os2l_button "roller-rumble-start" on
```

- Explicit 3-second countdown:

```text
os2l_button "roller-rumble-start countdownMs=3000" on
```

- 5-second countdown:

```text
os2l_button "roller-rumble-start countdownMs=5000" on
```

- 2.5-second countdown:

```text
os2l_button "roller-rumble-start countdownMs=2500" on
```

Troubleshooting:

- If nothing happens, confirm the race is staged in Roller Rumble.
- Confirm `Settings -> Enable VirtualDJ cue start` is turned on.
- Open `Settings -> VirtualDJ Diagnostics` in Roller Rumble:
  - `TCP Listener` should say `Listening`.
  - `Discovery` should say `Advertising`. If Windows asks about network access, allow Roller
    Rumble on the private/event network.
  - `Armed Race` should say `Ready` after a race is staged.
  - `Beats Seen` increasing means VirtualDJ discovered Roller Rumble and connected over OS2L.
  - `Last raw OS2L message` shows the last non-beat message Roller Rumble received from VirtualDJ.
  - `Last accepted cue` shows the last message that actually matched `roller-rumble-start`.
  - `Last ignored message` explains why a received OS2L message did not start the countdown.
- If you turned the setting on after staging the race, that is supported. If it still does not work,
  restart `pnpm dev`, stage the race again, and retest with `pnpm os2l:cue -- --countdownMs 5000`.
- Confirm VirtualDJ is running on the same computer as Roller Rumble.
- Confirm the action contains `roller-rumble-start`.
- To test VirtualDJ without the track cue, make a temporary VirtualDJ custom button or pad with:

```text
os2l_button "roller-rumble-start countdownMs=5000" on
```

If the custom button starts Roller Rumble but the song cue does not, the issue is the POI/cue
setup on the track.

- Confirm `countdownMs` has no comma, decimal unit, or `ms` suffix. Use `5000`, not `5,000`,
  `5s`, or `5000ms`.
- If the simulator fails with `Unexpected argument`, update your local code and try again. The
  simulator supports the extra `--` separator that `pnpm` forwards to scripts.
- If you changed the listener port with `ROLLER_RUMBLE_OS2L_PORT`, make sure any external OS2L
  sender is using the same port. The normal VirtualDJ same-computer setup should use the default.

VirtualDJ's own OS2L documentation describes `os2l_button` actions and action POIs in the
[VirtualDJ OS2L guide](https://www.virtualdj.com/wiki/os2l). The VirtualDJ script manual also lists
`os2l_button` in the [VDJScript verbs reference](https://virtualdj.com/manuals/virtualdj/appendix/vdjscriptverbs.html).

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
7. Accepted originals upload to the main Roller Rumble backend. If the backend is unavailable, the Pi
   stores the accepted capture in a local SQLite queue and syncs it later.
8. The main backend stores the DSLR original separately from the app avatar URL and updates the
   racer avatar across admin, racer, and race displays.

Admin pairing/status lives in `Settings -> Kaleidoscope Photo Booth`. The pairing server URL uses
the laptop's LAN address, not `localhost`, because the Raspberry Pi must connect from another
device. The pairing secret is shown only on the admin settings API, not in the general live snapshot
sent to racer phones. The same card also shows hardware health for scanner, camera, lights,
umbrella, hall sensor, and pending uploads.

The TMC2209 driver needs separate motor power and current limiting; the Raspberry Pi GPIO pins only
send STEP/DIR/ENABLE logic. Run `pnpm photo-booth:doctor` before events to verify `gphoto2
--auto-detect`, scanner serial reads, WLED serial JSON, hall sensor trigger, homing direction, and
panel indexing.

LED looks are defined in the booth package as a TypeScript manifest. The kiosk intentionally shows
visual-only picker items and supports infinite direct touch/mouse drag scrolling plus mousewheel or
trackpad input without visible recentering, while labels remain available for accessibility, status
messages, and tests. Use
`ROLLER_RUMBLE_WLED_DEFAULT_LOOK=<look-id>` if a booth should idle back to a non-white default look.
Built-in look ids are `solid-white`, `solid-red`, `solid-blue`, `kaleidoscope-rainbow`,
`chasing-rainbow`, `sparkle`, and `pride`.

The booth kiosk follows the same selected app theme as the admin, racer, and race displays. The
booth agent polls the main app snapshot, publishes the active `ThemeDefinition` through its local
state/SSE feed, and the kiosk uses the same shared theme helper as the desktop renderer to apply
`--theme-*` CSS variables plus semantic theme data attributes. Shared UI primitives and their CSS
contract live in `packages/shared-ui/src` and are imported by both the Electron renderer and the
booth kiosk so panels, buttons, text inputs, selects, and stat pills stay visually aligned.

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
is enabled automatically for simulator/manual booth runs; use `ROLLER_RUMBLE_BOOTH_ALLOW_FAKE_QR=1`
to force-enable it with real hardware, or `ROLLER_RUMBLE_BOOTH_ALLOW_FAKE_QR=0` to force-disable it.
This lets you test lights, umbrella controls, capture, retry, and keep with simulator or real booth
hardware.

For full fake-mode photo review, add a sample image named `simulated-dslr-photo.jpg` in
`tools/photo-booth-agent/assets`. The simulator DSLR adapter copies that file for each fake capture
instead of showing a transparent placeholder. If you configure
`ROLLER_RUMBLE_BOOTH_SIMULATOR_PHOTO_PATH`, relative paths are resolved from the repo root first and
the booth package directory second.

The booth agent intentionally lives in `tools/photo-booth-agent` instead of the root runtime. That
gives the Pi process its own Node-flavored `better-sqlite3` build while Electron keeps using the
desktop app's Electron-flavored native build.
The root launchers pass `--ignore-workspace` for isolated tool installs/runs; if you manually
bootstrap a tool package, use `corepack pnpm --ignore-workspace --dir tools/photo-booth-agent install`.

## Database Schema

SQLite schema changes are managed as ordered SQL migrations in `apps/desktop/src/backend/db/migrations`.

- This keeps the schema editable as real SQL instead of a TypeScript string.
- VS Code SQLite and SQL-formatting extensions can work directly with the migration files.
- The app records applied migrations in `schema_migrations` and only runs pending files at startup.
- Add future schema changes as new files such as `0002_add-foo.sql` rather than editing older migrations after data already exists.

## Testing Scope

Current automated tests cover:

- speed, distance, and wattage calculations
- queue insertion, challenge placement, bumping, removal, and shifting rules
- passkey/auth and event-scoped payment gating
- Stripe Checkout session and webhook handling
- Web Push notification targeting and queue/tournament triggers
- theme registry validation
- tournament seed generation
- single-elimination advancement
- double-elimination advancement
- round-robin standings
- groups-to-single-elimination structure
- tournament opt-out, admin replacement, BYE filling, safe result undo, and bracket-menu action
  eligibility
- photo booth queue/state behavior and adapter payloads

Manual visual testing:

- Open `/bracket-lab` while the dev app is running to replay bracket animation scenarios without
  changing real event data.
- The lab supports theme switching, standard vs center-converging layouts, individual choreography
  phases, and a full projector-style handoff playback.
- Open `/queue-lab` while the dev app is running to test queue behavior against disposable mocked
  racers without touching the active event database.

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
  - `Attach Electron Main` lets you step through `apps/desktop/src/electron` and the embedded backend in `apps/desktop/src/backend`.
  - `Attach Electron Renderer` lets you step through React code in `apps/desktop/src/renderer`.

Useful notes:

- `pnpm dev:debug:break` is best when you need to catch startup issues before windows open.
- Keyboard shortcuts still work if you want DevTools manually:
  - macOS: `Cmd+Opt+I`
  - Windows/Linux: `Ctrl+Shift+I`
- The main process and backend share the Electron process in development, so breakpoints in both `apps/desktop/src/electron/main.ts` and backend service files will hit in the same Node debugger session.
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

The shared UI package owns the base component style contract and DOM theme helper. Import
`@roller-rumble/shared-ui/styles.css` before surface-specific CSS, use
`@roller-rumble/shared-ui/theme` to apply a selected `ThemeDefinition`, then keep each surface
stylesheet focused on layout, page choreography, and screen-specific controls. If a shared
primitive needs a new visual variation, add a shared modifier or CSS variable in
`@roller-rumble/shared-ui` instead of redefining `.button`, `.panel`, `.search-select`, `.stat-pill`,
or `.empty-state` locally.

Moving race avatars are resolved in the renderer from the theme's sprite-sheet id. To replace a
theme sprite, keep the declared frame grid in [packages/shared/src/themes.ts](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/packages/shared/src/themes.ts) aligned with the asset in [apps/desktop/src/renderer/assets/sprites](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/src/renderer/assets/sprites): row `0` is the slower animation and row `1` is the faster animation by default.

The projector `Fiercely Local` mark is loaded from [apps/desktop/public/brand/fiercely-local-logo.svg](/Users/BIRDMX5/go/src/bitbucket.org/newyuinc/roller-rumble/apps/desktop/public/brand/fiercely-local-logo.svg). Replace that placeholder with the real logo when ready. If the asset is not SVG, use the same basename with `.png`, `.webp`, or `.jpg`; the race display checks those fallbacks automatically.

Projector layouts are designed to fit both common `1280x720` and `1920x1080` outputs. At 720p, the
race display reduces non-race chrome, lane-header spacing, live sprite size, and track proportions
so the horizontal `Fiercely Local` footer/logo, ticker, and complete race lanes remain visible.
Use the `720p` and `1080p` buttons in `Settings` -> `Projector Display` to resize the projector
window quickly while checking layouts.

For horizontal projector themes, use these layout terms when tuning the race screen: the
`projector screen` is the full `/race` viewport, the `title` is the top Roller Rumble/event header,
the `main stage` is the middle region that contains the QR card, race card, or bracket card, the
`footer mark` is the centered Fiercely Local logo lockup, and the `ticker` is the bottom scrolling
bar. In a staged race, the `race card` is split into equal-height `race lanes`; each lane contains
a full-width `racer details card` followed by a full-width `race indicator`. The winner overlay may
cover the title, footer mark, and main stage, but it must keep the bottom ticker visible.

The DOS-inspired `Oregon Trail '90` theme also bundles an IBM VGA bitmap recreation so the intended projector typography does not depend on fonts installed on the host machine.

## Tournament Bracket Layouts

Elimination tournaments use a custom React Flow board rather than a fixed third-party bracket
widget. That gives the app control over:

- theme-aware matchup cards
- winners, losers, and reset connector styling
- completed advancement path highlights and projector-side connector draw animations
- click-to-open admin match menus for staging, safe undo, racer removal, and BYE filling
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

- `apps/desktop/src/renderer/assets/fonts/oldschool-pc-fonts/WebPlus_IBM_VGA_8x16.woff`
  - from The Ultimate Oldschool PC Font Pack by VileR
  - source: [int10h.org/oldschool-pc-fonts](https://int10h.org/oldschool-pc-fonts/)
  - license: CC BY-SA 4.0
  - bundled attribution and license text live alongside the font asset in `apps/desktop/src/renderer/assets/fonts/oldschool-pc-fonts`

## Current Limitations

- The real USB bike sensor adapter is still a placeholder seam. The simulator is the working path
  until the hardware protocol is finalized.
- OS2L wiring is scaffolded, but real VirtualDJ cue integration still needs end-to-end validation
  with the event music setup.
- Photo booth hardware support is implemented behind adapters, but the full Raspberry Pi, Sony,
  WLED, stepper, and hall-sensor stack still needs physical event-rig validation.
- Packaged desktop builds are unsigned unless macOS notarization or Windows code-signing
  credentials are configured.
- Stripe Terminal / in-person reader payments are not implemented; v1 self-service payments use
  Stripe-hosted Checkout.

## Quality Gate

Before handing work back, run the same repo gate used during Codex work:

```bash
pnpm format
pnpm quality
pnpm typecheck
pnpm test
pnpm build
pnpm --dir tools/photo-booth-agent kiosk:build
```
