# Roller Rumble Project Handoff Summary

Last updated: June 3, 2026

This document summarizes the full product direction, major architectural decisions, implementation
choices, and pending work that came out of the project conversation so far. It is meant to sit
beside the detailed product requirements and give future implementation sessions a clear map of
where the project is headed and why.

## 1. Project Identity

The project began as `GoldSprints` and is moving to the new name `Roller Rumble`.

Current naming direction:

- User-facing product name: `Roller Rumble`
- Repository name: `roller-rumble`
- Package scope: `@roller-rumble/*`
- Primary environment variable prefix: `ROLLER_RUMBLE_*`
- Primary local dev data directory: `.roller-rumble-dev`
- Primary photo booth data directory: `.roller-rumble-booth`

The older `GoldSprints` and `GOLDSPRINTS_*` naming should be treated as retired unless a specific
migration or compatibility bridge is intentionally added later.

## 2. Product Goal

Roller Rumble is a local-first Electron application for running live stationary-bike race events.
The app coordinates two bike trainers with rotation sensors, crowd-facing race visuals, host-facing
admin controls, racer self-registration, tournaments, payments, notifications, and a dedicated
photo booth avatar appliance.

The product is designed for event environments where:

- the admin laptop owns the race runtime
- a projector shows the race display to the crowd
- racers use phones to register, pay, join the queue, view standings, and receive notifications
- a Raspberry Pi photo booth can capture racer avatars using real event hardware
- the system can continue operating locally even when internet access is unreliable

## 3. Main Surfaces

### Admin Display

The Admin Display is the host control surface on the laptop. It is tab-based, with a left-side tab
rail and independent scrolling for the rail versus main content.

It is responsible for:

- event creation and current event management
- active mode and tournament lifecycle management
- open time trial queue management
- racer registration and host-created racers
- payment status controls
- race staging, countdown, reset, unstage, and move-on controls
- tournament bracket interaction
- notification sending and notification debug settings
- theme selection and global display settings
- tunnel setup and diagnostics
- photo booth pairing and booth hardware status

Race controls should be available as a bottom tray when relevant, like persistent music-player
controls, so hosts do not have to leave their current tab to stage, start, unstage, reset, or move
on from a race.

### Race Display

The Race Display is the projector-facing surface. It is optimized for a likely 1080p display and
should favor big, audience-readable information over dense operational controls.

Current visual direction:

- remove admin-like status cards such as "Live race" and "Race in progress"
- remove separate racer stats cards
- make the race lanes fill the available display space
- show stats inline with distance and racer identity inside the lanes
- show racer image inline before the racer name if available
- top lane uses an orange family, bottom lane uses a purple family
- provide an admin setting to flip which physical lane receives which color
- lane thickness must stay balanced even when one racer has an image and the other does not
- when no race is staged, show a centered signup card with QR code and call-to-action text
- show only the next 3 upcoming races in the bottom ticker
- keep the ticker moving as a seamless loop with no snapping
- include admin-created ticker messages, including when there are no upcoming races

Horizontal race themes:

- show `Roller Rumble` centered at the top
- optionally show the active event name below the title
- show centered `Fiercely Local` branding in the footer with a real logo asset between the words
- keep the logo vertically centered with the text and leave breathing room above the footer

Vertical race themes:

- show `Roller Rumble` and optional event name in the top-left
- show `Fiercely Local` with the logo in the top-right
- keep the race indicator centered from top to bottom
- use the no-race QR signup state as a wide centered card rather than forcing the vertical race
  layout

### Racer Page

The Racer Page is served by the desktop backend and can be exposed over a local network or
Cloudflare Tunnel. It is the racer-facing phone page.

It is responsible for:

- required registration and sign-in
- passkey registration and sign-in
- optional accountless racer flow when enabled by admin
- displaying the current racer card after registration
- queue signup, solo signup, and challenge match signup
- Stripe Checkout handoff when event payment is required
- photo booth QR display
- avatar upload
- current tournament or most recent completed tournament display
- expandable full-screen bracket view
- racer notifications, push setup, and full-screen in-app notification modals

The registration card should become the "Your Race" card after the racer is signed in or registered.

## 4. Core Architecture

The app is a local-first Electron desktop app with an embedded Node backend and a shared web
renderer.

Core stack:

- Electron
- Vite
- TypeScript
- React
- TanStack Router
- TanStack Query
- SQLite
- Drizzle schema mirror and SQL migrations
- WebSockets for live updates
- pnpm workspaces
- isolated native-dependency tool packages for runtime ABI safety

The desktop app embeds the backend so the event can run locally from one machine without requiring
a separate cloud deployment.

## 5. Monorepo Layout

The repo was refactored into a pnpm monorepo for app and shared packages, while keeping native
runtime tools isolated.

Workspace packages:

- `apps/desktop` - Electron app, backend, renderer, desktop app config, Drizzle config
- `packages/shared` - shared constants, types, validation, themes, presets, utilities
- `packages/shared-ui` - shared React UI primitives, shared UI CSS, theme application helper

Intentionally isolated tools:

- `tools/photo-booth-agent` - Raspberry Pi booth agent with its own Node-native `better-sqlite3`
- `tools/db-studio` - isolated Drizzle Studio tooling with its own Node-native `better-sqlite3`

The isolation is deliberate. Electron and Node use different native module ABIs, so the desktop app,
photo booth agent, and db-studio helper must not share one rebuilt `better-sqlite3` binary.

## 6. Persistence And Data Model

SQLite is the source of truth for app state.

Key domain entities:

- `Racer`
- `Identity`
- `PasskeyCredential`
- `Event`
- `EventRacer`
- `Race`
- `RaceEntry`
- `RaceResult`
- `QueueEntry`
- `QueueOccurrence`
- `Tournament`
- `TournamentStage`
- `BracketNode`
- `RoundRobinMatch`
- `Payment`
- `ProcessedWebhookEvent`
- `PushSubscription`
- `Notification`
- `NotificationDelivery`
- `Theme`
- `AppSetting`
- `PhotoBoothCapture`

Important decisions:

- racer identity is global across events
- race stats are event-scoped by default
- admin can choose event-only or all-time race data for seeding/stat views
- payments are event-scoped
- multiple tournaments can belong to one event
- only one tournament should be active at a time
- pending operational state should persist continuously so app restart can recover cleanly

Schema management moved away from string-only schema blobs and into SQL migration files plus a typed
Drizzle schema mirror. This gives better SQLite formatting in editors while keeping TypeScript
types and migration discipline.

## 7. Race Engine

Race state follows:

- `scheduled`
- `staging`
- `countdown`
- `active`
- `finished`
- `interrupted`
- `cancelled`

Race behavior decisions:

- staging and starting are separate actions
- pressing start countdown must not implicitly stage a race
- admin can unstage a staged race
- unstage should work even when auto-stage is enabled
- if a race is active, admin can reset it back to staged so it can be rerun
- changing race distance affects future or staged races, but not active races
- if shutdown happens during countdown or active race, restore as interrupted
- winner modal is a state that holds the completed race behind it
- tournament advancement and queue move-on logic should happen only when the winner modal is
  dismissed by timeout or admin action

Metrics calculated from rotation input:

- current speed
- top speed
- average speed
- distance traveled
- estimated wattage
- puke factor for race result display

Sensor input is adapter-based. The simulator exists now, while the real USB sensor protocol remains
a pending hardware integration.

## 8. Race Start Triggers

Manual race start must always remain available.

OS2L / VirtualDJ support decisions:

- add a race trigger adapter layer
- support manual and OS2L trigger implementations
- OS2L cue starts only matter when a race is staged and cue listening is enabled
- OS2L cue messages can include `countdownMs` to control how many milliseconds elapse between the
  cue and race activation
- missing or invalid cue countdown values default to 3000 ms
- the projector countdown display remains whole-second based even when the cue duration is not an
  exact number of seconds
- include a script to simulate an OS2L cue in development
- the cue message changed with the rename to the Roller Rumble naming family

Real-world VirtualDJ validation is still pending.

## 9. Open Time Trial Queue

The queue model evolved substantially.

Final intended model:

- the queue is represented as ordered slots
- a slot can be a normal racer occurrence or a locked challenge match
- racers can appear in the queue multiple times
- the maximum number of simultaneous queue appearances is configurable, defaulting to 3
- the same limit applies to locked challenge appearances
- a racer cannot be matched with themselves
- open queue racers are automatically paired head-to-head by the visible queue view
- solo runs are explicit exceptions, not the default

Challenge behavior:

- a racer can challenge a specific racer
- the challenge creates a locked match slot
- if either racer is already queued, the locked challenge should be placed at the earliest existing
  slot position involving either racer
- whoever was originally paired with the challenging racer is bumped down into the next appropriate
  open position
- locked challenge slots are not split when gaps open ahead of them
- if a racer is removed from a locked challenge, the slot becomes a regular slot containing the
  remaining racer

Priority behavior:

- priority is considered when newly placing racers into the queue
- priority should not be permanently locked because bump count needs to keep changing
- new racers with no races today should generally be allowed to enter ahead of racers who have
  already raced
- racers who have been bumped too many times should eventually stop being skipped
- racers who have raced many times today are easier to bump down
- each queue occurrence has its own bump count and priority calculation
- locked challenge priority is the average of the two racers' calculated priorities
- the first three visible matches are protected and cannot be bumped

A queue lab exists to make this behavior testable through a UI without needing a full event flow.

## 10. Tournament System

Supported competition presets:

- Open Time Trial
- Single Elimination
- Double Elimination
- Round Robin Standings
- Groups to Single Elimination

Tournament lifecycle decisions:

- tournament start belongs in the tournament area, not a generic mode setting
- starting a tournament unstages any open-time-trial race first
- active tournament can be ended early, returning the app to open time trial
- admin chooses bracket size from a dropdown when creating a tournament
- tournament controls and bracket board are organized with active tournament full-width at the top
  and bracket board below it
- tournament history only appears when there is no active tournament
- when no tournament is active, tournament controls and history can sit side-by-side

Bracket rendering:

- `@g-loot/react-tournament-brackets` was tried and rejected as too limiting
- React Flow / `@xyflow/react` is the chosen bracket canvas engine
- bracket nodes are fully custom React components
- edges are custom and themeable
- layouts can be traditional or center-converging depending on bracket size
- bracket cards can expand to fill the admin panel or racer page, with surrounding cards sliding
  away
- racer page expansion should animate like admin expansion

Tournament race flow:

- tournament races can be staged directly from tournament context without sending the host to a
  separate race desk
- when a tournament stage finishes, the winner modal must show first
- after modal dismissal, the bracket comes back focused on the completed stage
- winner should be marked as advanced before the advancement path animation plays
- the winner name should not float to the next stage; the edge highlight is the desired visual
- advancement path should highlight in a theme-appropriate way
- when panning from completed match to next stage, the connector line should highlight along its
  length

Tournament interaction:

- clicking a bracket match should open a context-aware popup menu
- options must only appear when they make sense for that match
- remove racer should only show for racers who still have matches to complete
- undo completed match should only show when the tournament has not advanced too far
- fill BYE should only show when the BYE position can still be replaced without invalidating future
  completed matches
- replacement search input should start empty but show ranked candidates before typing
- admin can choose a replacement racer or choose BYE

Racer opt-out:

- racers can opt out of a tournament at any point
- automatic replacement is only allowed if the racer has not raced yet and it is still first-stage
  play
- otherwise the removal becomes a BYE unless admin chooses a valid replacement
- if no replacement exists, the slot becomes BYE
- if a BYE determines a match, the missing racer should display as `BYE`, not `TBD`

## 11. Winner Modal

The race-complete modal became a projector-facing state rather than a brief toast.

Requirements:

- full-screen modal
- centered title: `WINNER!`
- two vertical racer stat cards
- cards match lane position, left/right or top/bottom as appropriate
- winner card is highlighted and slightly larger
- loser card remains visible but less emphasized
- card color should match lane color, orange or purple
- omit avatar space when a racer has no image
- racer names wrap on spaces and hyphens, shrink to fit where possible, then truncate if needed
- stats include top speed, average speed, puke factor, wattage, races done today, races won today,
  and career races when applicable
- modal stays until admin dismisses it or 15 seconds elapse
- race and tournament progression wait until the modal is dismissed
- bracket lab includes a dummy winner modal test button
- Escape closes the lab winner modal

## 12. Themes And Shared UI

The theme system is manifest-driven.

Theme manifests define:

- id
- display name
- tokens
- fonts
- race graphic orientation
- race graphic component
- confetti effect
- sprite sheet configuration
- UI style attributes
- surface style attributes
- connector style attributes

Important decisions:

- code and CSS should not branch on concrete theme ids
- components should branch on theme attributes such as orientation or style metadata
- theme manifests are the source of truth
- shared UI primitives should come from `@roller-rumble/shared-ui`
- shared UI CSS owns common component styling
- desktop and kiosk should import the same shared UI CSS
- app-specific CSS should own only layout and surface-specific styling

Confetti:

- winner confetti uses a canvas-confetti style implementation
- confetti should cover the whole screen
- theme manifest controls which confetti animation is used
- current default confetti is reused for all existing themes until custom theme effects are added

Race sprites:

- each theme can provide a sprite sheet
- sprite sheets are build assets
- race avatars on the track use the theme sprite sheet rather than racer photos
- sprite sheet should support slower and faster animation rows
- racer speed selects the appropriate animation behavior

## 13. Photo Booth Appliance

The photo booth is a dedicated Raspberry Pi hardware appliance that pairs with the main desktop app.
It is not a second Electron app.

Reasoning:

- DSLR cabling stays local to the booth
- GPIO, serial, stepper, hall sensor, and WLED concerns stay on the Pi
- the admin laptop stays free for race operations
- Chromium kiosk mode is lighter and more appropriate on Raspberry Pi than Electron
- the Pi can queue accepted photos locally if the network drops

Purchased hardware direction:

- Raspberry Pi 5, 4GB RAM, 64GB SD card
- GPIO-connected 2D QR scanner
- ESP32 flashed with WLED over USB serial
- two 6-foot LED strips mounted at the booth ends
- Sony Alpha 7 DSLR over USB using gPhoto2
- HDMI/USB touchscreen
- TMC2209 stepper driver over GPIO
- stepper motor to spin the umbrella
- hall effect sensor to detect umbrella home position

Booth flow:

- racer opens their phone page and requests a photo booth QR
- racer holds QR to the mounted scanner
- Pi resolves the session with the main app
- booth enters photo mode
- LEDs turn on white by default
- umbrella starts slowly spinning
- touchscreen shows capture button, LED look picker, and umbrella panel picker
- user can select predetermined LED looks through an iOS-style infinite wheel picker
- user can spin/select umbrella panels through a half-circle image-slice picker
- pressing capture freezes umbrella movement, keeps selected LED look, counts down, and captures via
  DSLR
- review screen shows keep or retry
- retry returns to photo mode
- keep uploads or queues the original photo, resets lights to ambient/default, parks umbrella, and
  returns to idle scan mode
- cancel, timeout, process exit, or hardware error should always return hardware to a safe state

Photo booth architecture:

- `tools/photo-booth-agent` is an isolated Node package
- kiosk UI is React/Vite
- local booth queue uses package-local SQLite and package-local `better-sqlite3`
- booth server exposes local APIs and SSE to the kiosk
- camera, light, scanner, and umbrella adapters all support simulated mode
- umbrella control uses a Python stdio helper for GPIO timing

Booth config uses `ROLLER_RUMBLE_*` env variables and `.env.photo-booth`.

## 14. Photo Booth UI Components

LED picker:

- custom-built, not an npm package
- iOS-style wheel picker
- infinite scrolling
- smooth drag and scroll-wheel behavior
- captures scroll so the page does not move with it
- no arrow buttons
- items render only the visual LED look, not text
- labels remain in data for accessibility, diagnostics, and tests
- WLED payload is selected by `lookId` from a code manifest

Umbrella panel picker:

- custom component moved to its own file
- full circle, with only the left half visible against the right screen edge
- triangular pie slices converge at the circle center
- each slice is an image provided as a `.jpg`
- number of panels and image mapping are code-configurable
- supports dragging and mouse wheel
- momentum and snapping should feel similar to the LED wheel
- selected center triangle is highlighted
- stepper motor should move while the picker is being interacted with

## 15. Registration, Auth, And Sessions

Registration direction:

- force real registration by default
- email field plus `Sign in` button
- attempt passkey sign-in for existing passkey accounts
- if email is unknown, reveal an extensible registration field manifest
- display name is required now
- button becomes `Register {name}` when name is entered
- registration creates a passkey
- if email exists but has no passkey, show host-assisted claim instructions

Accountless direction:

- accountless is the preferred term, not anonymous
- accountless signup is disabled by default
- admin can enable accountless signup
- accountless racers must enter a display name
- accountless racers can later attach email plus passkey

Session direction:

- racer-owned endpoints use the signed-in session racer
- do not trust client-provided racer ids for racer-owned actions
- use HTTP-only session cookie when possible
- keep signed local-storage fallback so refresh works in dev/tunnel edge cases

Passkeys require HTTPS in production, which makes the Cloudflare Tunnel URL the supported event URL.

## 16. Payments

Stripe Checkout is the chosen v1 payment processor.

Reasons:

- supports Apple Pay, Google Pay, Link, and cards through Stripe-hosted Checkout
- avoids building custom wallet integrations
- keeps PCI-sensitive UI out of the app
- easier to test and operate than a fully custom payment flow
- more customizable and production-ready than ad hoc cash-only tracking

Payment behavior:

- payment requirement is tied to the current event
- admin can set payment amount and currency per event
- admin cannot enable payment requirement below Stripe minimum
- event racer records track `unpaid`, `paid`, or `waived`
- admins can mark paid, waive, or mark unpaid
- only show `Unpaid` when racer is currently paid
- only show `Mark paid` and `Waive` when racer is unpaid
- racer page queue actions start Checkout when payment is required and racer is unpaid
- successful Stripe webhook marks racer paid and auto-queues the original stored intent
- if auto-queue fails after payment, racer stays paid and sees a recoverable message
- admin queue actions can bypass payment requirement

Stripe environment variables:

- `ROLLER_RUMBLE_STRIPE_SECRET_KEY`
- `ROLLER_RUMBLE_STRIPE_WEBHOOK_SECRET`
- `ROLLER_RUMBLE_PUBLIC_RACER_URL`

Stripe Terminal is not part of v1.

## 17. Notifications

Notifications use true browser Web Push plus in-page fallback behavior.

Notification decisions:

- use VAPID keys for Web Push
- add script to generate VAPID keys
- store push subscriptions by racer and endpoint
- revoke dead subscriptions when push provider reports gone/invalid
- persist notification records and per-racer deliveries
- in-page notifications should show as full-screen dismissible modals
- notification list/inbox is behind an admin-controlled debug flag and defaults off
- remove "test this device" from racer page
- prompt for notification permission when the racer first tries to queue
- also prompt after successful queueing when appropriate

Automatic triggers:

- notify racers when their queued match first becomes the third visible upcoming match
- notify all involved racers when a tournament starts
- use trigger keys so automatic notifications are not repeatedly sent for the same state

Admin notification lab:

- provide a lab page to send any notification type
- target individual racers or groups
- test tournament notification modals and push behavior

Typed notifications:

- notification payloads can include a type
- the racer page can detect type and show different modal flows
- tournament invitations/confirmations can show buttons such as accept participation or opt out

Web Push subject:

- VAPID subject is a contact identifier for the push service operator
- it should be a `mailto:` or URL that identifies who is responsible for the push sender
- it is not displayed as the notification sender name to racers

## 18. Cloudflare Tunnel

Cloudflare Tunnel is used to expose the racer page publicly for phones.

Decisions:

- support quick tunnels for testing
- support token-based stable tunnels for production
- app can manage/download its own `cloudflared` binary on macOS and Windows
- admin UI shows tunnel mode, public URL, binary source, version, and diagnostics
- token must never be displayed in UI or logs
- stable public host must route the hostname root to the embedded backend, not only `/racer`
- assets, APIs, uploads, and WebSocket traffic all need to route through the same origin

Current naming transition:

- previous public domain was `goldsprints.birdsnest.family`
- new documentation points toward `roller-rumble.birdsnest.family`
- the actual Cloudflare tunnel and DNS must be updated externally if the public hostname changes

## 19. Debugging And Developer Experience

Key developer workflows:

- `pnpm dev` runs Vite plus Electron
- debug scripts open devtools and expose Electron inspector ports
- renderer console logs can mirror to terminal in debug mode
- `pnpm release:patch`, `pnpm release:minor`, and `pnpm release:major` turn committed
  `CHANGELOG.md -> Unreleased` notes into a dated release, bump package versions, commit the
  release metadata, create an annotated `v*.*.*` tag, and push the branch/tag
- pushed release tags trigger GitHub Actions to build macOS and Windows packages on native runners
  and publish the installers to GitHub Releases
- OS2L cue script can simulate countdown triggers
- dev database reset script clears local runtime state
- Drizzle Studio is isolated to avoid native ABI conflicts
- photo booth agent scripts bootstrap the isolated package as needed

Quality gates:

- Prettier is strict and should run before handoff
- ESLint is strict and should run before handoff
- TypeScript checks cover shared packages, desktop, and booth package
- tests cover queue logic, tournaments, payments, notifications, cloudflared utilities, metrics,
  shared validation, booth adapters, booth state, and booth queue
- production build should verify desktop bundling
- booth kiosk build should verify kiosk bundle

## 20. Important Implementation Lessons

The project has repeatedly benefited from making implicit state explicit.

Examples:

- staging is separate from countdown start
- winner modal is a real race-holding state
- tournament advancement waits for modal dismissal
- queue occurrence priority is per occurrence, not per racer
- locked challenge slots are different from regular open slots
- theme decisions come from manifest attributes, not hardcoded theme ids
- photo booth hardware state is owned by adapters and a booth state machine
- payments are event-scoped, not global
- notifications have persisted delivery records, not fire-and-forget UI effects

The general architecture pattern should continue to be:

- model state explicitly
- keep hardware behind adapters
- keep event-specific state event-scoped
- keep UI surfaces synced through shared snapshots and WebSockets
- keep theme behavior data-driven
- keep admin override paths available for event-day recovery

## 21. Pending Work

### Naming Transition

- Rename the GitHub repository to `roller-rumble`.
- Rename the local folder to `roller-rumble` if not already done in the active environment.
- Update any remaining local `.env.local` values from `GOLDSPRINTS_*` to `ROLLER_RUMBLE_*`.
- Decide whether the public domain should become `roller-rumble.birdsnest.family`.
- If the public domain changes, update Cloudflare DNS/public hostname and Stripe/web push allowed
  origins accordingly.

### Hardware Integrations

- Implement the real USB bike sensor adapter once the protocol is known.
- Validate OS2L cue behavior with VirtualDJ in a real event setup.
- Validate Sony Alpha 7 tethered capture on Raspberry Pi using gPhoto2.
- Validate QR scanner serial/GPIO behavior on the Pi.
- Validate WLED JSON-over-serial behavior with the ESP32.
- Validate TMC2209 current limit, stepper motor wiring, hall sensor homing, and panel indexing.
- Add event-day hardware doctor checks that clearly show pass/fail for every booth subsystem.

### Race Display Polish

- Finalize lane sizing across all themes and racer image combinations.
- Continue tuning the 1080p projector layout for real-world readability.
- Add final Fiercely Local logo asset and verify footer alignment in horizontal and vertical themes.
- Consider code splitting if the renderer chunk warning becomes a practical startup issue.

### Tournament Controls

- Continue validating match context-menu option rules across edge cases.
- Add more tests for undo, replacement, BYE filling, and opt-out after partial advancement.
- Polish bracket advancement animations on the projector display.
- Expand tournament lab coverage for full handoff/advancement flows.

### Queue System

- Continue validating the protected-first-three-matches rule.
- Add more stress tests for challenge insertion when both racers already have multiple queue
  occurrences.
- Tune the priority formula using actual event feedback.
- Consider exposing queue priority/bump debug info in the queue lab only.

### Payments

- Configure Stripe Dashboard payment methods and wallet domain verification.
- Add clearer admin Stripe setup health where needed.
- Decide how refunds should be represented if admin marks a Stripe-paid racer unpaid.
- Add Stripe CLI webhook-forwarding docs for local testing.

### Notifications

- Validate Web Push behavior on iOS Safari, Android Chrome, desktop Chrome, and closed/backgrounded
  browser states.
- Finish tournament invitation/accept/opt-out notification flows if they are not complete.
- Add admin controls for notification debug visibility and notification targeting polish.

### Photo Booth

- Field-test the full fake mode with simulated DSLR image and the real kiosk UI.
- Add the real umbrella panel image assets.
- Tune LED look presets to match the physical booth.
- Validate offline queue recovery from the Pi to the main app.
- Add safe shutdown and watchdog behavior tests around process exit and hardware errors.

### Documentation

- Keep `docs/product-requirements.md` updated as behavior changes.
- Keep this handoff summary updated after major architectural pivots.
- Add setup runbooks for:
  - event-day laptop startup
  - Cloudflare Tunnel startup
  - Stripe webhook setup
  - photo booth Pi startup
  - hardware diagnostics
  - emergency recovery during an event
