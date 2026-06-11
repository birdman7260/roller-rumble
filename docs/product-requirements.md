# Roller Rumble Product Requirements

This document supersedes the original chat requirements and reflects the product decisions and
implementation direction established through the current build.

Status legend:

- `Implemented` means the current app already supports it.
- `Partial` means the requirement exists in product direction and has some support, but is not fully
  complete or field-validated yet.
- `Planned` means it remains a requirement but is not yet implemented.

## Product Goal

Roller Rumble is a local-first Electron application for running live stationary-bike race events with:

- an `Admin Display` for hosts on the laptop
- a `Race Display` for the projector or crowd screen
- a `Racer Page` for phones over the local network or a `cloudflared` tunnel

The app must support both open time trial operation and tournament play while preserving event data,
race results, and racer identities across restarts.

## Core Domain

The app manages:

- `Racers`
- `Identities` for email, phone, and optional accountless local identities
- `Passkey credentials`
- `Events`
- `Event-specific racer registrations`
- `Event-specific payment config and status`
- `Stripe payment records`
- `Push subscriptions`
- `Notification records and per-racer deliveries`
- `Queue entries`
- `Races`
- `Race results`
- `Tournaments`
- `Tournament stages`
- `Bracket nodes`
- `Round-robin / group matches`
- `Photo booth captures`
- `Themes`
- `Admin settings`

Requirements:

- Racer identity is global across events. `Implemented`
- Race history is event-scoped by default for seeding and stats. `Implemented`
- Admin can toggle between event-only race data and all-time race data for seeding/stat views.
  `Implemented`
- More than one tournament can exist for a single event, but only one can be active at a time.
  `Implemented`
- Racer self-registration must use email plus a passkey, with passkey credentials stored locally
  and a signed session used for racer-owned actions. The session should prefer an HTTP-only cookie
  and also keep a signed local-storage fallback so refreshes remain logged in across dev/tunnel
  origin edge cases. `Implemented`
- Accountless racer signup must only be available when admins enable it, must require a display
  name, and accountless racers must be able to attach an email/passkey later without losing their
  profile. `Implemented`
- Entrance-fee requirement, amount, currency, and racer status must be tracked per active event.
  `Implemented`
- Stripe Checkout must be available for racer-page self-service payment, with Stripe webhooks
  marking the event racer `paid` and auto-queueing the stored join/challenge intent. `Implemented`
- Browser Web Push must be available for racer notifications when VAPID keys are configured, with
  full-screen in-app notification modals while the racer page is open. `Implemented`

## Race Input And Metrics

Requirements:

- The app must read bike rotation data through an adapter boundary instead of coupling directly to a
  device implementation. `Partial`
- The app must calculate:
  - current speed
  - top speed
  - average speed
  - distance traveled
  - estimated wattage
    `Implemented`
- Race state must follow:
  - `scheduled`
  - `staging`
  - `countdown`
  - `active`
  - `finished`
  - `interrupted`
  - `cancelled`
    `Implemented`
- The system must recover from shutdowns by restoring unfinished races as `interrupted`. `Implemented`
- Admin race-distance changes must affect future or not-yet-active races, but must not change an
  already active race. `Implemented`

Current delivery notes:

- A simulator sensor adapter is the live input path today. `Implemented`
- A real USB adapter seam exists, but the actual production sensor protocol is still not
  implemented. `Planned`

## Race Start Triggers

Requirements:

- Manual countdown/start control must always exist. `Implemented`
- Countdown start must never implicitly stage a race; staging and starting are separate actions.
  `Implemented`
- The app must support OS2L / VirtualDJ cue-based race starts behind an admin toggle. `Implemented`
- OS2L listening must only matter when a race is staged and cue starts are enabled. `Implemented`
- The desktop app must advertise itself as an `_os2l._tcp` service over DNS-SD/Bonjour so VirtualDJ
  can auto-discover it as an OS2L receiver. `Implemented`
- The admin Settings UI must expose OS2L diagnostics, including listener state, discovery
  advertising state, armed-race state, beat message count, last raw non-beat message, last accepted
  cue, and last ignored message/reason. `Implemented`
- If OS2L is enabled after a race has already been staged, the staged race must be armed for the
  next valid cue without requiring the race to be re-staged. `Implemented`
- OS2L cue payloads may include a `countdownMs` attribute that controls how many milliseconds to
  count down before activating the race. If the attribute is missing or invalid, the countdown must
  default to `3000` milliseconds, and the race display must continue to show whole-second countdown
  values. `Implemented`

Current delivery notes:

- The cue-start seam, admin toggle, default countdown, cue-provided countdown duration, and local
  simulator script exist. `Implemented`
- The local OS2L simulator supports `pnpm`'s forwarded `--` separator and has a `--dryRun` mode for
  confirming the outgoing payload without contacting the app. `Implemented`
- Real-world VirtualDJ cue behavior still needs field validation with an installed Windows app and a
  real track action POI. `Partial`

## Admin Display

Requirements:

- The admin surface must be shown on the laptop and remain the operational control center.
  `Implemented`
- The admin page must use a left-edge vertical tab layout instead of route-switch buttons.
  `Implemented`
- The left tab rail must have its own scroll area, separate from the main content area.
  `Implemented`
- Race controls must appear in a shared bottom tray when there is an active or actionable race
  workflow, regardless of which admin tab is open. `Implemented`
- The main admin tabs are:
  - `Event`
  - `Race Desk`
  - `Racers`
  - `Tournaments`
  - `Settings`
    `Implemented`
- Standard admin content cards should size to their own content and align toward the top of their
  grid area instead of stretching inner spacing to match taller neighboring cards. Views that
  intentionally need full-height cards, such as expanded bracket boards, may opt back into stretch
  behavior. `Implemented`

### Event Tab

Requirements:

- Create and activate a new event. `Implemented`
- Show current event snapshot information such as active event, racer count, queue count, current
  competition label, selected theme, and tunnel state. `Implemented`

### Race Desk Tab

Requirements:

- Stage the next open-time-trial race when no race is currently staged. `Implemented`
- Start countdown only for an already staged race. `Implemented`
- Unstage a scheduled/staged current race. If open-time-trial auto-stage is enabled, an explicit
  unstage pauses auto-staging until the host presses `Stage Next Race` again. `Implemented`
- In the staged-race action row, `Unstage Race` must sit to the left of `Start Countdown`, with
  `Start Countdown` as the far-right primary action. `Implemented`
- Reset a countdown/active race back to staged so it can be started again without completing the
  race or its queue entry. `Implemented`
- Finalize current race. `Implemented`
- Resume, restart, or finalize interrupted races. `Implemented`
- Open-time-trial race controls no longer need to live inside the `Race Desk` content panel; the
  shared bottom tray is the primary control surface for stage/start/finalize/recovery actions.
  `Implemented`
- Configure race distance. `Implemented`
- Add racers to the queue directly from admin controls. `Implemented`
- Default admin queueing behavior must be head-to-head auto-match, with explicit solo as an option.
  `Implemented`
- When a queued open-time-trial match is staged, the matching row in the admin queue list must be
  visually highlighted. `Implemented`
- Admin racer/opponent matchup pickers must support typing to filter the available racer list.
  `Implemented`
- Show queue contents and allow racer removal from specific queue entries. `Implemented`

### Racers Tab

Requirements:

- Quick-add racers from admin. `Implemented`
- Search registered racers. `Implemented`
- Add a racer directly to the queue from the racer list. `Implemented`
- Add a racer as an explicit solo run from the racer list. `Implemented`
- Remove a racer from all upcoming races. `Implemented`
- When payment requirement is enabled, show each racer's active-event payment status and allow
  admins to mark racers `paid`, `waived`, or `unpaid`. `Implemented`
- Admins must be able to set the active event's required entrance-fee amount and see Stripe setup
  health from the Event tab. `Implemented`

### Tournaments Tab

Requirements:

- Starting a tournament must happen from the `Tournaments` tab, not from a global mode toggle.
  `Implemented`
- The admin must choose the tournament format when starting a tournament. `Implemented`
- For direct elimination formats, the admin must choose bracket size from a dropdown when starting
  the tournament. `Implemented`
- For bracket-based tournaments, the admin must be able to choose a board layout mode when
  starting the tournament. `Implemented`
- The `Tournaments` tab should place the `Active Tournament` card full-width at the top of the
  panel when a tournament is active. `Implemented`
- When no tournament is active, the tournament setup controls and tournament history should be
  displayed side-by-side on desktop-width admin screens. `Implemented`
- When a bracket exists, the `Bracket Board` card should be full-width directly below the active
  tournament summary. `Implemented`
- Tournament history should only be displayed when there is no currently active tournament.
  `Implemented`
- Single-tree elimination brackets must support `standard`, `center-converging`, and `auto`
  layout choices. `Implemented`
- `Auto` bracket layout must prefer a compact standard board for smaller fields and a
  center-converging board for larger single-tree brackets. `Implemented`
- Double elimination must stay on a standard winners/losers board layout for now, even when the
  layout selector is available elsewhere. `Implemented`
- Starting a tournament pauses open time trial as the active competition flow. `Implemented`
- Starting a tournament must unstage a not-yet-started open-time-trial race first, canceling the
  staged race record and returning its queue entry to `queued` so the projector cannot show both an
  open race and the tournament bracket. `Implemented`
- Starting a tournament must not silently cancel an open-time-trial race that is already in
  countdown, active, or interrupted recovery. `Implemented`
- The admin must be able to end the active tournament early and return to open time trial.
  `Implemented`
- The admin must be able to interact with the actual bracket or tournament match board on screen.
  `Implemented`
- Direct elimination tournaments must render as a real drawn bracket in the admin and update as
  matches are completed. The current implementation uses a custom React Flow board rather than a
  fixed bracket widget so nodes, theming, and camera behavior can evolve with the product.
  `Implemented`
- In elimination tournaments, the drawn bracket itself should be the primary admin interaction
  surface: clicking a matchup opens a context menu with only the actions valid for that match, such
  as staging, undoing a safe result, removing a racer, or filling a BYE slot. Separate always-visible
  removal/fill controls and completed-match action lists should not be shown around the board.
  `Implemented`
- Bracket context menus must hide stale actions once the match context has moved on: completed
  matches should only show `Undo Result` while no downstream winner/loser result depends on them,
  `Remove` should only appear for racers in unfinished matches, and `Fill BYE Slot` should only
  appear while the advanced racer has no downstream completed result. `Implemented`
- Bracket matchup cards should not display any footer text below the matchup body. `Implemented`
- As racers advance through elimination brackets, their completed advancement paths should remain
  visually highlighted using theme-appropriate line styling. `Implemented`
- The admin must be able to stage tournament matches directly from the tournament board.
  `Implemented`
- The admin must be able to start and finalize a staged tournament race from the `Tournaments` tab
  without switching to `Race Desk`. `Implemented`
- Once a tournament matchup is staged, countdown/finalize/recovery controls must stay available in
  the shared bottom tray even when the admin moves to a different tab. `Implemented`
- When a tournament matchup is staged but countdown has not started, the shared bottom tray must
  show an `Unstage Match` action so the admin can clear that selection and choose a different
  matchup. `Implemented`
- Tournament race controls must not use countdown start as an implicit staging shortcut.
  `Implemented`

### Settings Tab

Requirements:

- Theme selection. `Implemented`
- Cue-start toggle. `Implemented`
- Auto-stage-next-race toggle for open time trial. `Implemented`
- Event-only vs all-time race-data toggle. `Implemented`
- Allow-accountless-racer-signup toggle, disabled by default. `Implemented`
- Show-public-racer-info-before-sign-in toggle, disabled by default. When enabled, unauthenticated
  QR visitors may browse read-only race, queue, tournament, and racer information before signing in.
  `Implemented`
- Tunnel start/stop controls. `Implemented`
- Web Push setup health must show whether public notification configuration is present without
  exposing private VAPID keys. `Implemented`
- Admins must be able to turn on a racer notification debug list for troubleshooting, and it must
  be off by default. `Implemented`
- Admins must be able to send notification messages to all active-event racers, queued racers,
  active tournament racers, or selected racers. `Implemented`
- Admin/test tooling must be able to send any supported notification type to those same targets so
  type-specific racer modal behavior can be validated before an event. `Implemented`
- Kaleidoscope photo booth pairing/status controls. `Implemented`

Requirement removed by product decision:

- A global admin `mode` picker is no longer the primary control for open time trial vs tournament.
  Active tournament state now defines tournament mode behavior. `Implemented`

## Race Display

Requirements:

- The race display must be suitable for full-screen projector use. `Implemented`
- The display must show solo and two-rider races. `Implemented`
- The race visualization must support horizontal or vertical layouts depending on theme.
  `Implemented`
- Projector layout must be optimized for a likely `1080p` display with large audience-readable
  text and minimal non-race chrome. `Implemented`
- Horizontal race themes must show `Roller Rumble` centered at the top, optionally show the active
  event name underneath, let the race lanes fill the main middle area, and show a centered
  `Fiercely Local` footer with a real logo asset between the words. The logo should be loaded from
  the desktop public brand asset directory with SVG preferred and raster fallbacks supported.
  `Implemented`
- Vertical race themes must show `Roller Rumble` and the optional event name in the top-left,
  `Fiercely Local` with the same logo asset in the top-right, keep the race indicator centered
  from top to bottom, and keep racer identity and stats inside each lane rather than in separate
  bottom cards. `Implemented`
- Admin must be able to toggle whether the event name appears on the projector race display.
  `Implemented`
- Projector race lanes must use audience-readable fixed lane color roles: the first/top lane is
  orange and the second lane is purple by default, regardless of theme. Admins must be able to flip
  those lane color assignments. `Implemented`
- A bottom-edge ticker must run continuously across the full projector display without visible
  snapping. It should show only the next three upcoming races, labeled `Up next`, `After that`, and
  `Later`, and may mix admin-configured announcement messages between those races. If there are no
  upcoming races, it must show `Sign up to race!` while still rotating through admin-configured
  announcement messages. The ticker should behave like a measured endless loop and must not reset
  to a visible starting position during normal operation. `Implemented`
- Admin must be able to control projector ticker scroll speed with a slider in projector display
  settings. `Implemented`
- When no race is staged and no tournament bracket is being shown, the projector display should
  show a large racer-page QR code with audience messaging that encourages people to scan, register,
  and sign up, even if there are already upcoming queue entries. This prompt should be centered in
  a wide full-stage layout even when the selected theme normally uses a vertical race
  visualization. `Implemented`
- Projector/admin racer QR codes must include non-secret event context as
  `/racer?eventId=<activeEventId>&source=projector`, while authoritative state still comes from the
  snapshot API. `Implemented`
- The race visualizer components must animate live racer progress with Framer Motion rather than
  only snapping through layout/CSS updates. `Implemented`
- The display must show:
  - large racer avatars inline before racer names when present, without fallback placeholder icons
  - racer names that shrink to fit until a minimum readable size, then truncate with an ellipsis
  - equal-thickness animated race lanes even when only one racer has an avatar
  - current speed
  - top speed
  - current/top speed next to distance traveled and target race distance in the race graphic
  - winner state
  - upcoming races in the bottom ticker
  - countdown
  - theme-specific animated race avatars moving along the track
    `Implemented`
- Winner confetti must cover the full screen. `Implemented`
- Confetti behavior must be theme-controlled so future themes can choose different celebration
  effects. `Implemented`
- When a race result is shown on the projector, the result overlay should be a full modal with a
  centered `WINNER!` title and lane-ordered vertical racer cards instead of a simple winner banner.
  Each card should show the racer name, avatar only when present, top speed, average speed, puke
  factor, wattage, races today, wins today, and career race count when the racer has history in more
  than one event. Missing avatars should not render placeholder imagery or reserve avatar space. The
  cards should use the same orange/purple lane color roles as the race lanes, including the admin
  flip-lane-colors setting. The winning card should be highlighted and slightly larger. The modal
  should remain up for 15 seconds by default, and the admin should be able to choose `Move On` to
  dismiss it early.
  While the modal is active, the completed race should remain frozen behind it and the app should
  not transition to the next race or tournament bracket handoff until the modal clears.
  If open-time-trial auto-stage is enabled, the next race should stage when this modal clears, not
  when the previous race first finalizes. Clearing the modal should also ensure the completed race's
  queue entry is marked complete before choosing the next auto-staged race. If a queue entry is left
  in a stale `staging` or `racing` status after its linked race is already finished, the backend
  should reconcile that entry to `completed` before showing or staging more queue items.
  `Implemented`
- The race display should stay focused on the active race rather than showing a generic tournament
  summary panel. `Implemented`
- When an elimination tournament is active and no race is currently live, the projector should
  show the tournament bracket as the primary full-stage display. `Implemented`
- When a tournament matchup is staged, the projector bracket should zoom in on that matchup before
  the race begins. `Implemented`
- When tournament race countdown or live racing begins, the bracket should slide out of the main
  projector view so the race presentation takes over. `Implemented`
- After a tournament race finishes, the projector should wait for the confetti beat to end, bring
  the bracket back focused on the finished matchup, draw the advancement connector toward the next
  bracket slot, hold that state briefly, and then zoom back out. `Implemented`
- The projector must not flash the already-updated bracket between race completion and the
  post-race bracket choreography. The bracket should stay hidden until the handoff sequence owns
  the display. `Implemented`
- The bracket animation lab should include a dummy winner modal trigger so the result overlay,
  fullscreen modal placement, typography wrapping, and post-race handoff timing can be tested
  without live race data. Pressing `Esc` while the dummy winner modal is displayed should close it.
  `Implemented`
- During the projector advancement handoff, only the advancement connector should draw/highlight
  along its length while the bracket camera pans toward the next matchup. The winner name/avatar
  should not float to the next stage; the source matchup should already be marked as advanced and
  the destination slot should not commit until that movement completes. `Implemented`

## Themes

Requirements:

- A theme must define:
  - colors/tokens
  - font family
  - orientation
  - surface style
  - UI style
  - connector style
  - race graphic variant and optional race-graphic labels / markers
  - confetti effect choice
  - race-avatar sprite sheet with separate slow and fast animation rows
    `Implemented`
- Theme selection must apply across the entire app, not just the projector view. `Implemented`
- Renderer code and CSS must not branch on concrete theme IDs for visual behavior. They should use
  manifest-provided attributes such as orientation, surface style, UI style, connector style, and
  race graphic variant. `Implemented`
- Shared UI primitives must have one shared CSS contract for panels, buttons, inputs, searchable
  selects, stat pills, empty states, focus states, hover states, press states, disabled states, and
  pixel-style variants. `Implemented`
- Desktop and kiosk surfaces must import the shared UI stylesheet, then reserve their own CSS for
  layout, page-specific visuals, and hardware/screen-specific controls. `Implemented`
- Theme DOM application must be centralized so every renderer surface applies the same `--theme-*`
  variables and semantic `data-theme-*` attributes from the selected `ThemeDefinition`.
  `Implemented`
- It must be straightforward to add theme-specific race graphics behind a shared component contract.
  `Implemented`
- Each theme must be able to provide a bundled sprite sheet asset for the moving race avatars, and
  the race graphic must switch between slow and fast animation rows based on live racer speed.
  `Implemented`

Current built-in themes:

- `Neon Night`
- `Summit Sprint`
- `Frontier Trail`
- `Oregon Trail '90`

Theme-specific product decisions:

- `Oregon Trail '90` is intentionally based on the late-80s/early-90s DOS-era black-screen
  classroom presentation instead of the later illustrated versions. `Implemented`

## Interaction Feedback

Requirements:

- Button-like controls across admin, racer, and navigation surfaces must provide explicit hover and
  press states instead of feeling visually static. `Implemented`

## Racer Page

Requirements:

- Racers must register with email plus a passkey by default. `Implemented`
- The initial racer identity flow must show only email and `Sign in`; if no account exists for the
  email, the remaining registration fields appear and the primary action becomes `Register {name}`.
  `Implemented`
- Registration fields must be manifest-like/extensible so additional fields can be added later
  without rewriting the flow. `Implemented`
- If an existing email has no passkey credential, the racer page must show host-assisted recovery
  guidance instead of allowing an unsafe self-claim. `Implemented`
- Accountless local identity remains available only when an admin setting enables it. `Implemented`
- The racer page's primary identity card must show registration controls before signup and then
  change into the racer's own race card after registration instead of keeping a separate register
  card visible. `Implemented`
- Accountless identity must be stored locally for reuse. `Implemented`
- Accountless racers must be able to attach email plus a passkey later and keep the same racer
  profile. `Implemented`
- The racer page must use mobile-first bottom tabs for `Race`, `Queue`, `Tournament`, `Racers`, and
  `Me`, with `Race` as the default flow and an optional `tab` query param for direct focus.
  `Implemented`
- Racer bottom-tab switches must reset the tab content to the top without visible slide-up motion,
  and the currently active tab button must be inert. `Implemented`
- When public racer info is disabled, signed-out racers should only see event context plus the
  sign-in/register flow. When enabled, signed-out racers may browse read-only race state, queue,
  tournament, and racer stats. Racer-owned actions must always require sign-in. `Implemented`
- Racers must be able to upload an avatar. `Implemented`
- Uploaded avatar images must resolve through the backend asset origin so they display correctly
  from local Vite dev, packaged desktop, local-network racer pages, and Cloudflare tunnel URLs.
  `Implemented`
- After registration, racers must see a short-lived photo booth QR that can be scanned by the
  kaleidoscope booth to capture or retake their avatar with the event DSLR. `Implemented`
- Racers must be able to:
  - join the default head-to-head queue
  - queue an explicit solo run
  - challenge a specific opponent
    `Implemented`
- When the active event requires payment, racer-page queue attempts must redirect unpaid racers to
  Stripe Checkout, then mark them `paid` and auto-queue them after webhook confirmation.
  `Implemented`
- If a racer challenges an unpaid opponent, checkout must not start and the racer should see that
  the opponent needs to pay first. `Implemented`
- If a racer attempts to queue after already reaching the configured maximum active queue entries,
  the racer page must show a modal prompt from whichever tab triggered the action instead of
  failing silently or moving the racer to a different tab. `Implemented`
- Admin queue actions must be allowed to add racers even when they are unpaid. `Implemented`
- Racer-facing opponent selection must support typing to filter the available racer list.
  `Implemented`
- The racer-facing Racers tab must allow signed-in racers to challenge another racer directly from
  each racer row when open queueing is available. `Implemented`
- Tapping a racer name area in the racer-facing Racers tab must expand that row inline with event
  record, career record, best finish, speed, power, queue status, tournament status, and available
  actions, while collapsing any other expanded racer row. Expanded stats must not show payment
  status. `Implemented`
- The racer page queue and challenge controls must reflow cleanly on narrow mobile screens so
  buttons stay legible and the opponent picker remains usable at phone widths. `Implemented`
- The Queue tab must show the queue list first, then signed-in queue controls below it for
  convenience. `Implemented`
- While tournament mode is active, the Queue tab must show a tournament-mode notice above the queue
  and grey out the open queue list to make clear that open queueing is paused. `Implemented`
- In open queue mode, the Race tab must preview the next three queued matches and link to the Queue
  tab when more matches exist, with that preview shown as its own card. `Implemented`
- In tournament mode, the Race tab must hide open queue controls and open queue previews, show
  current-stage tournament match cards styled like bracket nodes, including completed matches and
  BYEs from the currently actionable round, and link to the Tournament tab. Tournament opt-out
  controls for seeded racers should appear near the top of the Race tab. `Implemented`
- The Me tab must hide the race-notification setup card once notifications are enabled on the
  current device. `Implemented`
- The Me tab must show the racer's full stats in a dedicated card, keep the identity card free of
  duplicate race/win summary text, and present the racer's avatar at a larger profile size.
  `Implemented`
- When a racer already has an avatar, replacement upload must be available from a small pencil icon
  control on the avatar image. The standalone `Upload avatar` control should only appear for racers
  who do not yet have an avatar. `Implemented`
- The racer photo booth QR must live in its own `Me` tab card. Racers without an avatar should see
  that card directly below `Your Race Card`; racers who already have an avatar should see it at the
  bottom of the tab. `Implemented`
- Racers must be able to view:
  - upcoming races
  - registered racers
  - racer stats
  - tournament standings / brackets
    `Implemented`
- Racer-facing tournament viewing should happen in-place on the racer page rather than depending on
  a separate `Open` button flow. `Implemented`
- Mobile racer-facing elimination brackets must hide embedded fit, expand, and React Flow zoom
  controls, with `Focus Current` exposed above the bracket next to the tournament title instead.
  `Implemented`
- The racer page should show only the active tournament for the current event, or the most recent
  completed tournament when no tournament is currently active. `Implemented`
- Racers must be prompted to enable notifications the first time they try to queue or challenge,
  before the queue/payment request continues, with a persistent enable button available on
  `Your Race Card` when they are queued or returning from a payment redirect. `Implemented`
- Racer notifications must use browser Web Push when available and must still appear in a full-screen
  dismissible in-app modal while the racer page is open when push is denied, unsupported, or
  unconfigured. `Implemented`
- Clicking a browser/system notification must open the racer page and show the matching unread
  notification in the full-screen modal instead of silently landing on the page. `Implemented`
- The racer-page notification history list must be hidden by default behind an admin-controlled
  notification debug setting. `Implemented`
- Notification records must include a notification type so the racer page can render type-specific
  modal treatments and actions, such as tournament check-in messaging. `Implemented`
- Automatic racer notifications must include a get-ready alert when a queue entry first becomes the
  third visible upcoming match and a tournament-start alert for racers involved in a newly active
  tournament. `Implemented`

## Open Time Trial Queue Behavior

Requirements:

- Open time trial is the default operating mode when no tournament is active. `Implemented`
- Racers may appear in the queue multiple times. `Implemented`
- Default queue signup behavior is head-to-head auto-match, not solo. `Implemented`
- Explicit solo runs remain supported. `Implemented`
- A waiting auto-match signup with only one rider must not be staged until paired. `Implemented`
- A racer must never be auto-matched against another active occurrence of themselves. If no
  different opponent is available, that occurrence remains waiting. `Implemented`
- Specific head-to-head challenges must remain intact and not be broken apart automatically.
  `Implemented`
- The queue must be modeled as stable ordered slots: single-racer slots and locked challenge slots.
  The current race queue is derived from those slots by pairing flexible single-racer slots while
  preserving locked challenge slots. `Implemented`
- Queue slots are represented by per-racer queue occurrences so repeated signups still have
  independent wait/bump history. `Implemented`
- A racer can have a configurable maximum number of active queue occurrences at once, defaulting to
  `3`. `Implemented`
- When a racer who is already in a flexible queue occurrence creates a challenge, that occurrence is
  converted into the locked challenge anchor and their former auto-match partner returns to the
  flexible queue pool. `Implemented`
- When either or both racers in a new challenge already have flexible queued occurrences, the
  challenge must reuse the existing occurrence that is soonest to race and place the locked match at
  that spot. If both racers are already queued, both existing occurrences are reused. `Implemented`
- Priority must be used when a new single slot or new locked challenge slot enters the queue, not to
  continuously re-sort the whole queue. New-racer priority can insert ahead of lower-priority slots,
  but slots bumped too often gain priority and eventually stop being skipped. `Implemented`
- Locked challenge insertion priority is the average priority of both racers. `Implemented`
- The first three derived race entries are protected and cannot be bumped by newly inserted slots.
  `Implemented`
- When the admin enables auto-stage-next-race and no race is currently staged, the next ready
  open-time-trial queue entry should automatically be staged. `Implemented`
- Auto-stage-next-race applies only to open time trial and must not auto-stage tournament matches.
  `Implemented`
- If a racer is removed from one queued open-time-trial race, later flexible auto-match occurrences
  must compact upward to fill the gap while locked challenge matches remain intact. `Implemented`
- If a racer is removed from a locked challenge, that locked slot becomes a regular flexible slot
  with the remaining racer. `Implemented`

Clarified compaction behavior:

- Auto-match riders may be pulled forward around locked matches to fill earlier open auto-match
  slots.
- Locked challenge entries are atomic blocks, not hard queue boundaries.

## Tournament Formats And Behavior

Requirements:

- Supported presets:
  - `Single Elimination`
  - `Double Elimination`
  - `Round Robin`
  - `Groups -> Single Elimination`
    `Implemented`
- Tournaments seed from current-event race data by default. `Implemented`
- Admin may opt into all-time race data for seeding. `Implemented`
- Racers with no prior data must still be placeable in the field. `Implemented`
- Elimination formats must support admin-selected bracket size. `Implemented`
- If the chosen bracket size is smaller than the event field, only the top seeded racers are
  included. `Implemented`
- If the chosen bracket size is larger than the seeded field, open slots become byes. `Implemented`
- Bracket and group/round-robin boards must be viewable and interactive in admin. `Implemented`
- Elimination tournaments must render as a live visual bracket in admin and racer-facing tournament
  views, with completed stages reflected on the board as results are finalized. `Implemented`
- Elimination bracket views must support projector-friendly camera controls such as fitting the
  whole board and focusing the current matchup. `Implemented`
- In the admin tournament tools, the bracket board must support expanding to take over the
  available workspace while surrounding cards slide out, then collapsing back to the regular
  multi-card layout. `Implemented`
- On racer-facing tournament views, the same elimination bracket must support expanding to take
  over the current page view while the other racer cards slide away, then collapsing back to the
  regular card layout with the same coordinated resize/takeover animation style used in admin.
  `Implemented`
- Tournament progression must record completed later-round matches correctly. `Implemented`
- When a tournament finishes naturally, the app returns to open time trial. `Implemented`
- Active tournament racers must be able to opt out from the Racer Page at any point, except while
  their own tournament race is already starting or active. `Implemented`
- Tournament self opt-out may automatically replace the racer with the next eligible active-event
  racer only if the opting-out racer has not raced yet and is still in an unplayed
  first-stage/first-round match. Replacement candidates use the same seeding order and exclude
  racers already in the tournament or previously opted out. `Implemented`
- If a tournament self opt-out cannot use an automatic racer replacement, the app must preserve
  completed tournament history and remove the racer from future participation. In elimination play,
  future slots become BYEs and remaining opponents advance where applicable; in round-robin/group
  play, future matches involving that racer become no-contests. `Implemented`
- Admins must be able to remove a selected racer from an active elimination tournament by clicking
  a match containing that racer and choosing `Remove`. The app must then open a modal where the
  admin explicitly chooses an eligible replacement from a searchable, seed-ordered list, makes the
  future slot a BYE/no-contest, or cancels. Replacement selectors must start empty while still
  showing the ranked candidate list before the admin types. `Implemented`
- If an elimination match was resolved as a BYE and the advanced racer has not completed a later
  match that depends on that BYE, admins must be able to click that BYE match and choose `Fill BYE
Slot`, then pick an eligible seed-ordered replacement racer from a modal. Filling the BYE clears
  the automatic advance and makes the original match stageable. `Implemented`
- Admins must be able to undo a completed tournament match result and stage that match again while
  the result is still safe to roll back: either the tournament is still at that match, or the
  bracket has only just advanced and no downstream match depending on that result has completed.
  Undo must be launched from that completed match's bracket context menu, reopen the original race
  as staged, and remove that race's persisted result rows. `Implemented`
- Bracket views must label the missing opponent in a BYE-resolved match as `BYE`, while still using
  `TBD` for future slots that are not known yet. `Implemented`

Current delivery notes:

- Round robin and group-stage interaction is match-list based rather than a literal bracket.
  `Implemented`
- Group-stage finals recalculation after undo is intentionally conservative and should be manually
  validated before relying on complicated group-to-finals reversals at an event. `Partial`

## Persistence, Networking, And Recovery

Requirements:

- Persistent storage must use SQLite. `Implemented`
- Type-safe SQLite access must use Drizzle ORM on top of `better-sqlite3` while keeping checked-in
  SQL files as the migration source of truth. `Implemented`
- SQLite schema must be managed as real SQL migrations rather than a TypeScript string.
  `Implemented`
- The app must be able to resume from prior state after restart. `Implemented`
- The racer page must be available from the host app itself. `Implemented`
- `cloudflared` support must exist so the racer page can be exposed to external devices, including
  quick temporary URLs and stable token-backed Cloudflare Tunnel URLs. `Implemented`
- The admin must be able to start/stop the tunnel and see the resulting URL and QR code.
  `Implemented`
- The app must be able to install and use an app-managed `cloudflared` binary on macOS and Windows
  without requiring Homebrew, winget, or a globally installed binary. `Implemented`

## Kaleidoscope Photo Booth

Requirements:

- The photo booth should be a dedicated Raspberry Pi appliance so the admin laptop can remain free
  for race operations. `Implemented`
- The Raspberry Pi booth agent must pair with the main Roller Rumble backend using a booth id and
  shared secret from admin settings. `Implemented`
- Photo booth pairing must advertise a LAN-reachable desktop backend URL, not `localhost` or
  `127.0.0.1`, so the Raspberry Pi can connect over the event network. The LAN host should
  auto-detect Wi-Fi/Ethernet with an environment override for multi-adapter laptops. `Implemented`
- The booth should use a mounted USB 2D scanner to read racer photo booth QR codes. `Implemented`
- Racer photo booth QR codes must be signed and short-lived, containing racer/event/session data
  without exposing the booth pairing secret. `Implemented`
- The Pi booth agent must expose a touchscreen kiosk flow:
  - scan QR
  - turn lights on
  - start umbrella spin
  - choose a predetermined LED look from a visual-only iOS-style wheel picker
  - choose an umbrella panel from the right-edge wheel picker or resume spin
  - take photo
  - review
  - accept
  - retake
  - cancel
    `Implemented`
- The booth kiosk must be a package-local React/Vite touchscreen UI rather than inline HTML so
  diagnostics, wheels, and preview interactions can evolve independently. `Implemented`
- DSLR capture must happen behind a `CameraAdapter`, with a `gphoto2` implementation and simulator
  implementation. `Implemented`
- The simulator camera must be able to copy a local sample image for realistic fake-mode review;
  configured relative sample paths should resolve from the repo root first and the isolated booth
  package directory second. `Implemented`
- QR scanning must happen behind a `ScannerAdapter`, with serial and simulator/manual
  implementations. `Implemented`
- LED control must happen behind a `LightAdapter`, with WLED-over-USB-serial and simulator
  implementations. The adapter must support ambient idle, photo white, selected look, success,
  error, and off states. `Implemented`
- Booth LED choices must come from a code-defined preset manifest. Picker items must render the
  look itself, such as solid color, animated gradient, sparkle, or chasing rainbow, without visible
  text inside the selection items. The picker must feel infinite, support direct touch/mouse drag
  scrolling and mousewheel/trackpad input, and snap to the centered look without separate arrow
  buttons or visible recentering. `Implemented`
- The booth kiosk must follow the same selected app theme as the admin, racer, and race displays by
  receiving the active `ThemeDefinition` from the main app through the booth agent and applying the
  same shared theme helper, CSS variables, semantic theme data attributes, and shared UI component
  stylesheet. `Implemented`
- Shared React UI primitives must live outside any single screen package and be used by the admin,
  racer, race, and booth kiosk surfaces for common panels, buttons, inputs, and stat/status pills.
  `Implemented`
- Umbrella control must happen behind an `UmbrellaAdapter`, with a Python GPIO helper process and
  simulator implementation. The helper owns STEP/DIR/ENABLE timing and hall-sensor homing.
  `Implemented`
- Booth umbrella panel choices must use a custom right-edge wheel picker that renders a full
  circular umbrella wheel while clipping the UI so only the left half is visible. Panel slices must
  be pie-shaped triangles with points converging at the wheel center, use JPG artwork from a
  code-defined manifest, keep hidden accessibility labels, support touch/mouse drag plus
  mousewheel/trackpad input, highlight the centered slice, snap to panel positions, and send panel
  commands while interaction changes the centered panel. `Implemented`
- The booth must expose local diagnostics for scanner, camera, lights, umbrella, hall sensor, and
  queue status. `Implemented`
- The booth must support an explicit development-only fake QR path so a host can type
  `fake:Test Rider` into the kiosk manual QR input and test photo mode without a signed racer QR.
  Fake QR testing is automatically enabled for simulator/manual booth configurations and can be
  forced on or off with `ROLLER_RUMBLE_BOOTH_ALLOW_FAKE_QR`. Fake sessions must not upload or leave
  invalid captures in the sync queue. `Implemented`
- The admin photo booth card must show richer hardware health for the scanner, camera, lights,
  umbrella, and hall sensor. `Implemented`
- Accepted photo originals must upload to the main backend and update the racer's avatar across all
  app surfaces. `Implemented`
- If the main backend is unavailable, accepted booth photos must be queued locally on the Pi in a
  SQLite queue at `ROLLER_RUMBLE_BOOTH_DATA_DIR/photo-booth.sqlite` and synced later. `Implemented`
- The main backend must store full DSLR originals separately from the avatar display asset so
  originals can be exported later. `Implemented`
- Avatar display assets are currently generated as original-backed derivative copies; true
  crop/resize variants remain a future processing upgrade. `Partial`

Current delivery notes:

- The real DSLR path depends on the event camera being validated with `gphoto2` on Raspberry
  Pi/Linux. `Partial`
- WLED serial commands are isolated behind an adapter because the exact serial behavior must still
  be field-validated with the chosen WLED firmware/configuration. `Partial`
- Stepper homing, hall sensor polarity, panel count, TMC2209 current limit, and motor power must be
  field-validated on the physical umbrella rig. `Partial`
- The booth agent must run from an isolated pnpm package with its own Node-built `better-sqlite3`
  dependency so it can use SQLite without colliding with the root Electron-native build.
  `Implemented`

Current delivery notes:

- Stable tunnel mode is configured with backend-only dotenv variables such as
  `ROLLER_RUMBLE_TUNNEL_MODE=token`, `ROLLER_RUMBLE_TUNNEL_NAME=Roller Rumble`,
  `ROLLER_RUMBLE_PUBLIC_RACER_URL=https://roller-rumble.birdsnest.family/racer`, and
  `ROLLER_RUMBLE_TUNNEL_TOKEN`. Tokens must stay in ignored local env files. `Implemented`
- Cloudflared lookup prefers `ROLLER_RUMBLE_CLOUDFLARED_PATH`, then the app-managed runtime install,
  then a system `PATH` binary. Admin diagnostics and scripts expose the active source/version.
  `Implemented`
- Vite dev mode must allow the stable racer-page hostname through host protection so tunneled dev
  testing works at `roller-rumble.birdsnest.family`; additional hosts can be configured with
  `ROLLER_RUMBLE_VITE_ALLOWED_HOSTS`. `Implemented`
- Stable Cloudflare Public Hostnames must route the hostname root to the embedded backend port
  (`http://127.0.0.1:3187` by default), with no `/racer` path restriction, so assets, APIs, uploads,
  and WebSocket traffic are all reachable. `Implemented`
- Tunnel diagnostics must check the backend health endpoint, racer page HTML, and `/ws` WebSocket
  upgrade separately so partial Cloudflare path routing is obvious during setup. `Implemented`
- Browser API/WebSocket routing must ignore localhost `VITE_API_BASE` overrides when loaded from a
  public tunnel hostname, so racer phones connect to the Cloudflare origin rather than
  `127.0.0.1` on their own device. `Implemented`
- Passkey registration and sign-in require a secure browser origin, so production racer phones
  should use the stable HTTPS Cloudflare tunnel; localhost remains acceptable for development.
  `Implemented`
- In dev mode, the embedded backend must proxy Vite hot-reload websocket upgrades while still owning
  the app snapshot websocket at `/ws`, so public tunnel testing does not show misleading websocket
  failures. `Implemented`

## Technical Requirements

Requirements:

- Desktop runtime must be Electron. `Implemented`
- Source must be TypeScript. `Implemented`
- The repo's package manager and lockfile must use pnpm. `Implemented`
- The repo must use a hybrid pnpm workspace with `apps/*` and `packages/*` managed by the
  workspace, while native-runtime tools under `tools/*` remain isolated when needed. `Implemented`
- Renderer routing must use TanStack Router. `Implemented`
- Renderer data fetching must use TanStack Query. `Implemented`
- Dev/build toolchain must use Vite. `Implemented`
- Backend must run in Node. `Implemented`
- The app must run on macOS or Windows in intended production use. `Implemented`
- The codebase must use strict formatting and linting. `Implemented`
- Developers must have an easy dev-data reset path. `Implemented`
- Developers must have a supported debug flow for Electron main, backend, and renderer code.
  `Implemented`
- The local dev runner must treat an intentional terminal `Ctrl+C` as a clean shutdown while
  preserving non-zero exits for real Vite or Electron startup/runtime failures. `Implemented`
- Developers must have manual visual test pages for tournament bracket camera/connector handoff
  animations and open time trial queue projection without needing to mutate real event data.
  `Implemented`

Current tooling requirements now include:

- SQL migration files in `apps/desktop/src/backend/db/migrations`
- a typed Drizzle schema mirror in `apps/desktop/src/backend/db/schema.ts`
- `@roller-rumble/desktop` as the workspace package that owns Electron, the embedded backend, and the
  renderer app
- `@roller-rumble/shared` for shared constants, types, validation, presets, themes, and utility code
- `@roller-rumble/shared-ui` for React UI primitives shared by the desktop renderer and the booth
  kiosk
- shared base TypeScript configs that package/app tsconfigs extend instead of duplicating common
  compiler settings
- an isolated pnpm package for Node-based Drizzle Studio tooling so it does not share a native
  `better-sqlite3` build with the Electron app
- an isolated pnpm package for the Raspberry Pi photo booth agent so its local SQLite queue uses a
  Node-built `better-sqlite3` instead of the Electron-built desktop dependency
- dotenv-based configuration for the Electron/backend runtime and the isolated photo booth agent,
  including booth-specific `.env.photo-booth` overrides while keeping shell variables highest
  priority
- installed desktop builds must load per-user app config dotenv files, including `.env.local`, from
  the platform app data folder so Windows and macOS users can configure secrets without launching
  from a project checkout
- the admin Settings UI must expose the runtime env file path and provide a way to create/open a
  starter `.env.local` file when it does not exist
- the generated `.env.local` file must contain plain-language setup comments suitable for
  non-technical users, and the admin Settings UI must be able to generate Web Push VAPID keys and
  write them into that file automatically
- a root `pnpm db:studio` launcher that bootstraps the isolated Studio package on demand
- root `pnpm cloudflared:install`, `pnpm cloudflared:doctor`, and `pnpm cloudflared:version`
  scripts for app-managed tunnel binary setup and diagnostics
- the Electron production build must bundle workspace shared TypeScript packages into the main
  process output so the built app can run with `pnpm start` without a TypeScript loader
- root packaging scripts must exist for unpacked smoke builds and platform packages:
  `pnpm package:dir`, `pnpm package:app`, `pnpm package:mac`, and `pnpm package:win`
- root release scripts must exist for semver increments: `pnpm release:patch`,
  `pnpm release:minor`, and `pnpm release:major`
- release scripts must require useful `CHANGELOG.md -> Unreleased` notes, bump matching root and
  desktop package versions, create a dated changelog section, commit the release metadata, create an
  annotated `v*.*.*` tag, and push the branch and tag
- pushing a `v*.*.*` tag must trigger GitHub Actions to build macOS and Windows packages on native
  GitHub-hosted runners and publish those artifacts to GitHub Releases with changelog-derived
  release notes
- strict ESLint + Prettier
- `pnpm dev:reset-data`
- `pnpm dev:debug`
- `pnpm dev:debug:break`
- `/bracket-lab` for manual bracket animation testing
- `/queue-lab` for manual open time trial queue behavior testing
- `/notification-lab` for manual Web Push and in-app notification type/target testing
- `pnpm notifications:keys` for generating VAPID keys used by racer Web Push notifications
- `pnpm photo-booth:agent` for running the Raspberry Pi booth kiosk/agent
- `pnpm photo-booth:doctor` for booth hardware diagnostics

## Current Major Gaps

These are still part of the broader product direction, but are not complete in the current build:

- real USB bike sensor implementation
- field-validated OS2L / VirtualDJ start integration
- full tournament racer-replacement workflow
- field validation of the stable Cloudflare Tunnel at an event venue network
- field validation of Web Push notification behavior on the actual event phone mix
- field-validated DSLR camera model and WLED serial setup for the kaleidoscope booth
- true avatar crop/resize derivative generation from booth DSLR originals
