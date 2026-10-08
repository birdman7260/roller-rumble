# Roller Rumble

A local-first Electron app for running live stationary-bike race events. One host machine runs the full stack; racers join from phones over a LAN or Cloudflare tunnel.

## Language

### Racer identity and registration

**racer account**: The persisted `Racer`, identified only by the racer id generated when it was registered. It carries the `display name`, avatar, `contact details`, race history and results, queue occurrences, push subscriptions, booth captures, and payment records. Account takeover at a live event is low-stakes, because the host is physically present and there is no stored card to spend. The harm to avoid is exposing `contact details`, not fraud.
_Avoid_: user, profile, accountless racer (every racer now registers the same way)

**display name**: The fun, self-chosen name a racer goes by in public: on the projector, `lane card`s, standings, and other racers' phones. It is chosen on its own `registration wizard` step, separate from the racer's real name, and it is not unique.
_Avoid_: nickname, handle, racer name

**contact details**: A racer's real name, phone, and email. They are required on the `registration wizard` and optional at the admin desk. They are operator-only: never in the `racer payload`, and a racer sees only their own. They are not unique, so two racers may share an email, and they are never used to find or match a `racer account`.
_Avoid_: identity, login, account email

**device login**: The proof, held in a phone's browser local storage, that this phone is a given `racer account`. It is a signed token naming the racer id. It is the only way a phone is ever signed in, and it never expires. There is no way to sign back in, so if the browser is cleared or the racer switches phones, they register again as a new racer. Signing out discards it irreversibly, so the racer page puts sign-out behind a strong warning.
_Avoid_: session (in racer-facing copy), passkey, sign-in, credential

**registration**: Creating a brand-new `racer account`, either on a racer's phone through the `registration wizard` or by the host at the admin desk. It always creates a new racer with a new id. It ignores any `device login` already on the phone and never looks up an existing racer by `contact details`, so no registration can overwrite another racer.
_Avoid_: sign-up, claim account, account recovery

**registration wizard**: The racer page's step-by-step `registration`, with a progress bar showing the current step. The steps are `contact details`, then `display name`, then photo, then payment (shown only when the event requires payment). It finishes on the race page. The `racer account` is created when the `display name` step is submitted, so the photo and payment steps add to an account that already exists. Going back from the photo step revisits the `contact details` and `display name` steps, which then correct that same account instead of creating another.
_Avoid_: onboarding, sign-up flow

**racer reconciliation**: Folding together the duplicate `racer account`s left when a racer re-registers after losing their `device login`. It is done with a `racer merge`. Not yet built.
_Avoid_: account linking, account recovery

**racer merge**: The general admin operation that folds one `racer account` (the _absorbed_) into another (the _survivor_), moving everything that references the absorbed racer onto the survivor and then deleting the absorbed account. The host picks the survivor's `display name` and avatar; the survivor keeps its own `contact details`. It refuses when the two share a tournament or race, or while a race is live, and it cannot be undone in the app. Not yet built; see ADR 0008.
_Avoid_: dedupe, link (alone)

### Race lifecycle

**RaceCountdown**: The live, in-process owner of a single race's countdown—from the manual or OS2L trigger that starts it through `GO`, at which point it hands off to an `ActiveRace`. Owns the app-owned visible countdown timer, the `pre-roll` that delays the box's `g`, and the music-locked `GO` at the end. Holds the countdown's timing in memory only—never persisted—and surfaces it to the `AppSnapshot` through `SnapshotContext`; the coordinator (`RollerRumbleApp`) still owns the persisted `state="countdown"` flip and, on the `onGo` signal, activation. Exactly one runs at a time, or none.
_Avoid_: countdown timer, GO sequencer (that names its role, not the module)

**ActiveRace**: The live, in-process owner of a single race from activation through finalization. Holds lane telemetry state for each participant, processes rotation samples into metrics, tracks the `finish budget` timer, assigns the winner, and persists results. Exactly one `ActiveRace` exists at a time, or none.
_Avoid_: runtime, currentRuntime

**RaceRecord**: The persisted representation of a race in SQLite. Exists before, during, and after the race is live. Carries state (`staging`, `countdown`, `active`, `interrupted`, `finished`), participants, metrics snapshots, and result references.
_Avoid_: race (alone, when the persisted record is meant)

**LaneTelemetryState**: The in-memory rolling state for one participant's lane during an `ActiveRace`. Accumulates rotation samples into speed, distance, wattage, and elapsed time. Not persisted directly — its `snapshot` field is what gets written to the `RaceRecord`.
_Avoid_: lane state, racer state

**trailing racer**: In a two-lane match, the participant who has not yet crossed the finish line at the moment the winner does. Keeps racing — and keeps updating live metrics — throughout the `finish budget`. If the budget expires before they finish, they are force-finished at their partial distance and placed second. Has no meaning in a solo race.
_Avoid_: loser, runner-up (until the race is finalized)

**finish budget**: The bounded window a `trailing racer` has to reach the line after the winner crosses, before the race force-finalizes on its own. Reckoned from race start as the winner's finishing elapsed time times a configured percentage, floored so it is never less than five seconds beyond the winner's finish. Only two-lane matches have a finish budget; a solo race finalizes on its lone finish, and force-finalizes immediately if the budget expires with the trailing racer still short of the line.
_Avoid_: grace period, overtime, sudden death

**finish freeze**: The rule that a lane stops reporting live metrics the instant it crosses the finish line — its speed, cadence, and wattage settle to zero and its clock stops at the finishing time, while its record stats (distance, top speed, average, max wattage) stand. Distinct from finalization: a frozen winner's lane holds still on the projector while the `trailing racer` is still moving during the `finish budget`.
_Avoid_: lane freeze, stat lock

### Race display

**leading-edge glow**: The light a lane emits at its rider marker's current position on the projector race display — a comet/wavefront trailing the marker in the direction of travel. Its brightness is driven by a relative, instantaneous speed signal; it is one-sided (only the ahead/accelerating lane lights, everything else reads dark). Uses the lane's own identity color, intensified. Projector-only — racer phones do not render it.
_Avoid_: lane glow, fill glow

**glow mode**: The operator-selected rule controlling what the `leading-edge glow` reacts to — `Surge` or `Rivalry`. Always on (no off state); switchable live mid-race. A solo race always uses `Surge` regardless of selection, since `Rivalry` needs an opponent.
_Avoid_: glow setting, glow style

**Surge glow**: The `glow mode` where a lane brightens with the rider's own _acceleration_ — pushing above their speed of a moment ago. A steady hard effort reads dark; the light flashes on the upswing of a surge. The fallback for solo races.
_Avoid_: effort glow, personal glow

**Rivalry glow**: The `glow mode` where a lane brightens when its rider is faster than the opponent _right now_ (instantaneous speed difference). Exactly one lane glows at a time — the slower lane reads dark. The default mode.
_Avoid_: duel glow, versus glow

**lead-change flash**: A discrete burst on a lane the instant it overtakes the other on _distance covered_ (the standings lead flips). A companion cue to the glow — it marks the event the continuous speed-glow cannot. Distinct from `Rivalry glow`, which tracks speed, not standings.
_Avoid_: overtake flash, pass flash

**top-speed flare**: A brief flare on a rider the moment they set a new personal top speed for the race. A companion cue celebrating an individual milestone, independent of standings.
_Avoid_: PB flare, record flare

**speed streaks**: Motion lines trailing a rider, scaled to _absolute_ speed (fast = long streaks, standstill = none). A companion cue encoding raw speed — the dimension the relative glow deliberately omits, so a steady-fast rider still looks fast.
_Avoid_: motion lines, speed lines

### Race display layout

**lane card**: The bordered plaque identifying a lane's racer — avatar (or `monogram`), display name, and `readout`. Sits above that lane's `course`. One per racer; a solo race renders a single card centered in the same geometry.
_Avoid_: details box, lane header

**course**: The horizontal band a `rider marker` travels along from start to finish — the `marker zone` and `track bar` together. One per lane on the horizontal display variants (track, ledger, wagon).
_Avoid_: track, lane strip

**marker zone**: The reserved clearance band above the `track bar` that the `rider marker` occupies. Exists so the marker — taller than the bar it rides — has room to overflow upward instead of colliding with the `lane card`.
_Avoid_: sprite zone, headroom

**track bar**: The thin progress pill along the bottom of a `course` that fills to show distance covered. The `rider marker` rides its bottom edge.
_Avoid_: progress bar

**rider marker**: The animated sprite at the racer's current position along the `course`. Bottom-anchored so its wheels sit flush with the `track bar`, and it carries the lane's cue overlays (see `leading-edge glow`).
_Avoid_: sprite, progress marker

**race meta header**: The distance/time strip above the lanes — the static race target on the left, the live clock on the right. One per race display, shared across both lanes.
_Avoid_: meta bar, stats header

**readout**: The live stats cluster shown on a `lane card` (RPM today). Belongs to one lane.
_Avoid_: stats box, metrics panel

**solo presentation**: The single-centered-`lane card` geometry a race gets when one rider raced. Derived from the participant count, never from a lane id — a solo racer is staged on a real `left`/`right` lane like anyone else, because `lane` names the roller their ticks come off. Races staged before the `lane swap` existed carry a third lane value, `solo`, which names no bike.
_Avoid_: solo lane (that names the retired lane id, not the layout)

**monogram**: The lane-colored disc showing a racer's initial, rendered on the `lane card` in place of an avatar when the racer has none.
_Avoid_: initial avatar, placeholder

### Queue and events

**Event**: The top-level container for a race session — holds racers, queue entries, races, and tournament data. One event is active at a time. Carries an `event kind` and a `race distance`, both chosen at creation, plus operator-authored display copy (a description plus `signup prompt` overrides). Editing the active event's fields is in-place and non-destructive; creating a _new_ event is destructive — it starts a fresh session, so racers must register again.
_Avoid_: session, meet

**event kind**: The discriminator on an `Event` naming which shape of session it is — `standard` or `walk-up`. Chosen when the event is created and immutable afterward, so an event's `event capability` set never shifts under the data already filed beneath it; changing shape means starting a new event. Orthogonal to competition format, which is `mode`.
_Avoid_: mode (that is competition format), event type, booth mode

**race distance**: The distance an `Event`'s races are run to, chosen when the event is created; each race keeps its own copy, so a race run before a mid-event change still carries the distance it was run at. Adjustable mid-event only at a `standard` event — a `walk-up event` never changes it, so its `top racers board` only ever ranks runs over one distance. See ADR 0023.
_Avoid_: target distance, walk-up distance, locked distance

**walk-up event**: An `Event` whose `event kind` is `walk-up` — the stripped-down shape for a public stall, where riders arrive on the spot with no phone and no `Queue`, the host composes each race directly on the `walk-up desk`, riders pick whichever bike they like, the `race distance` never changes once the event exists, and the projector shows the `top racers board` between races.
_Avoid_: booth event, booth mode (both collide with the `photo booth`), pop-up event

**walk-up desk**: The admin surface where the host composes each race at a `walk-up event` — the two bikes as `bike seat`s side by side, and one GO control beneath them. Granted by the `hostComposesRaces` `event capability`. With no `Queue` to add anyone to, seating a rider _is_ staging the race, which is what collapses the Racers-tab-then-Race-Desk round trip a queued event needs into one surface. Its own tab in the `admin tab rail` — not a re-skin of the Race Desk's slot — and the first one, so it is where a walk-up operator lands. See ADR 0020, ADR 0021.
_Avoid_: Race Desk (that is the queued-event tab), walk-up tab, booth desk

**admin tab rail**: The vertical list of sections down the side of the admin window, and the whole mechanism by which an `event kind` shapes that window. Each entry declares the `event capability` it needs — a capability that must be _true_, never a negation — and the rail renders only the entries the active event satisfies: a `standard` event shows Event, Race Desk, Racers, Tournaments, Settings; a `walk-up event` shows `walk-up desk`, Event, Racers, Settings. The operator lands on the first visible entry, so nothing stores a preferred tab, and the selected tab is clamped back to that entry whenever it leaves the visible set. See ADR 0021.
_Avoid_: admin nav, sidebar, tab bar

**bike seat**: One of the two slots on the `walk-up desk`. Each names a real bike (`left`/`right`), not a position in a lineup, so the host seats a rider on the roller they actually got on and the seating _is_ the binding — which demotes the `lane swap` from a step in every race to a repair. A race is solo when one seat is left empty; solo is never declared.
_Avoid_: lane card (that is the projector's plaque), lane slot, bike card

**event capability**: One entry in the closed set of behaviors an `event kind` grants or withholds — whether the event has a racer page, a `Queue`, tournaments, payments, host-composed races (`hostComposesRaces`, which grants the `walk-up desk`), lead capture, the `top racers board` (`hasTopRacersBoard`), or an adjustable `race distance` (`hasAdjustableRaceDistance`). Every capability is a boolean, because a surface declares the capability it `requires` and a requirement is always something that must be _true_ — so the idle projector is two capabilities rather than one with a value (`hasRacerPage` carries the `signup prompt`, `hasTopRacersBoard` the board). Derived from the kind rather than stored per event, and the thing every `surface` asks about: surfaces branch on capabilities, never on the kind's id. A part of a surface that a kind withholds declares the capability it needs at its own definition site and is filtered out by its container — the pattern the `admin tab rail` sets — and it then leaves no trace at all: no disabled control, no explanatory note, and no `subsystem health` row.
_Avoid_: event flag, event setting, feature flag

**top racers board**: The projector's idle card listing the evening's fastest riders over the event's `race distance`. A `walk-up event` shows it alone between races; a `standard` event shows it outside a tournament once someone has posted a time, beside the `Queue` — or, while the queue is empty, beside a compact `signup prompt` (ADR 0025). One row per racer holding their best qualifying run, never one row per run, so no rider can hold two slots. A run qualifies only if it belongs to the active event, was raced at the event's `race distance`, and covered that distance in full — which is what keeps a rider force-finished by the `finish budget` off the board, since a partial run still carries a plausible-looking finish time. Solo and head-to-head runs rank together with nothing marking which was which; ties order by the earlier run; a racer with no qualifying run is simply absent. Derived in the `SnapshotAssembler`, because the projector holds neither the event's results nor the `race distance` each run was raced at, which the filter needs, and sliced to an operator-set row count. Granted by the `hasTopRacersBoard` `event capability`. See ADR 0022 and ADR 0025.
_Avoid_: leaderboard, high scores, standings, top times

**Signup prompt**: The projector card that recruits racers into the queue — an eyebrow, a heading, a body line, and the join QR code. Shown while idle at an event that has a racer page to recruit into: filling the stage until anyone has queued or posted a time, then as a compact card (eyebrow, heading and QR, no body) beside whichever of the `Queue` and the `top racers board` has something on it. A `walk-up event` has no racer page and shows the `top racers board` instead. Its eyebrow/heading/body each fall back to built-in default copy, and the operator may override any of them per event (blank clears the override back to the default). The body override is the event `description`, which the racer page also shows; the eyebrow and heading appear on the projector only.
_Avoid_: signup card, join prompt, QR panel

**Queue**: The ordered list of upcoming open time trial races. Entries are slots that the app projects into visible race pairings. Distinct from a `Tournament`, which has its own match structure and its own `tournament queue`. Whether racers may add themselves is governed by the `closed queue` state.
_Avoid_: lineup, race list

**tournament queue**: The active `Tournament`'s matches still to be raced, in the order the bracket plays them: the group stage before the finals, round-robin races spaced so riders rest, and in double elimination each losers round right after the winners round that feeds it. Derived from the bracket on every snapshot, never stored. The one thing it keeps is the host's **up-next pin**: one ready match moved in front of the bracket's order, which `Stage Next Race` and auto-stage then take first. During a `tournament pause` it replaces the `Queue` on the racer's Rumble tab and is what the race tray stages from.
_Avoid_: tourney queue (UI copy only), bracket queue, match list

**closed queue**: The operator-controlled state (`queueOpen`, default open) that stops racers self-adding to the `Queue` — used to drain the queue before starting a `Tournament`. While closed, the racer page hides the three self-service entry points (join, solo, challenge) behind an operator-authored `queueClosedMessage` (blank falls back to a built-in default), and the racer self-service endpoint refuses new entries; the operator's manual add and everyone already queued are unaffected. Manual and operator-messaged — contrast the automatic `tournament pause`.
_Avoid_: queue lock, queue freeze, paused queue (the last is the `tournament pause`)

**tournament pause**: The automatic state where the `Queue` stops taking self-service signups because a `Tournament` is live — the racer page shows a built-in "open queue paused" card, not an operator message. System-driven; contrast the operator-driven `closed queue`. Also freezes `leave` — during a `tournament pause` the racer cannot self-remove; only the host can.
_Avoid_: closed queue (that is the operator-driven gate)

**queue occurrence**: One racer's single instance in the `Queue`. A racer may hold several at once (up to a configured max). Each carries an `intent` (`solo`, `auto-match`, or `challenge`) and a lifecycle status (`queued` → `staging` → `racing`, or `removed`). The app pairs `queued` occurrences into the visible race entries; `intent` decides how (a `challenge` locks two occurrences together, an `auto-match` waits to be paired with any other, a `solo` races alone).
_Avoid_: queue slot, queue entry (an entry is the projected pairing; an occurrence is one racer's membership)

**leave**: A racer's self-service withdrawal from the `Queue` — either one spot (a single `queue occurrence`) or every spot at once. Distinct from the host's `remove`, which is the operator doing it on a racer's behalf. `leave` only ever touches `queued` occurrences: a racer cannot leave a spot that is already `staging` or `racing` (the host handles those). Always available while the racer holds `queued` spots, even under a `closed queue`; blocked only by a `tournament pause`.
_Avoid_: remove (reserve for the host action), withdraw, quit, drop out

**challenge abandonment**: What happens to the opponent when a racer `leave`s a `challenge` occurrence. The opponent's fate depends on how they entered: if the challenge itself pulled them in fresh (they held no prior spot) they are removed entirely and told via their `queue-status notification`; if they already had a spot that the challenge upgraded, they fall back to their `prior intent` (`solo` or `auto-match`) and stay queued silently. Resolved by the occurrence's remembered `prior intent`, not guessed at leave time.
_Avoid_: challenge cancel, challenge decline (a `decline` would be the opponent's action; abandonment is the challenger's)

**AppSnapshot**: The complete derived state broadcast over WebSocket to all connected surfaces (admin, projector, racer). Assembled from SQLite on demand; not the source of truth itself.
_Avoid_: state, live state

### Notifications

**notification channel**: A keyed stream of notifications to one racer (`channelKey`, e.g. `queue-status:<eventId>:<racerId>`) of which only the latest, non-superseded record is ever shown — the push tray uses the `channelKey` as its notification `tag`, and the racer inbox/modal show one row per channel. Automatic notifications belong to a channel; a manual `admin message` is a discrete one-off.
_Avoid_: notification thread, notification group.

**queue-status notification**: The single live `notification channel` tracking one racer's standing in the `Queue` — it escalates (approaching → you're up) and winds down (raced, removed, queue closed) by `supersession`, never by stacking new tray entries. Only escalation re-alerts (buzzes); de-escalation and teardown update silently.
_Avoid_: race reminder, up-next alert (those name individual states, not the channel).

**supersession**: Retiring a notification by replacing it in place with the current truth rather than clearing it. The app essentially never truly clears a _backgrounded_ notification, because iOS forces a visible notification on every push — so "dismissal" of a background notification always means "show an accurate replacement."
_Avoid_: dismiss, clear (reserve those for the foreground `local clear`).

**local clear**: The one path that _truly removes_ a notification — when a racer acknowledges inside the open app, the foreground page calls `getNotifications({ tag }).close()` directly, with no push involved, so it works on every platform. Contrast `supersession`, the background/server-driven path.
_Avoid_: dismiss (ambiguous between the two paths).

### Snapshot assembly

**SnapshotAssembler**: The deep module that owns the full `AppSnapshot` shape end-to-end—assembling it from SQLite plus an injected runtime context, and projecting it per surface. Pure and read-only; the caller runs any DB writes (like queue reconciliation) before calling it.
_Avoid_: snapshot builder, snapshot service

**SnapshotContext**: The live runtime state only `RollerRumbleApp` knows at assemble time (tunnel state, OS2L diagnostics, photo-booth status, Stripe setup, result presentation, countdown duration lookup, and an injectable clock). Passed into `assemble` so the module stays a pure read.
_Avoid_: snapshot deps, runtime bag

**surface**: A snapshot streaming destination—`admin`, `projector`, or `racer`. `admin` and `projector` receive the full snapshot; `racer` receives a public-safe projection.
_Avoid_: client type, channel

**racer payload**: The public-safe projection of an `AppSnapshot` for racer phones—live metrics, result presentation, themes, ticker messages, and operator-only tunnel/OS2L/photo-booth/Stripe detail and every racer's `contact details` are stripped. One payload serves all racers (no per-racer identity).
_Avoid_: filtered snapshot, mobile snapshot

### Hardware sensing

**tick**: The atomic unit of progress the race hardware reports — one revolution of a bike's roller, sensed as one reed-switch pulse. The OpenSprints box streams a cumulative tick count per sensor position; the app turns each new tick into one rotation of distance. Distance per tick is the roller's **rollout**, not a bike-wheel circumference.
_Avoid_: pulse, count, rotation (when the hardware unit is meant)

**rollout**: The real-world distance a bike travels per one roller revolution — the calibration constant that converts ticks into meters. Hardware-specific; measured, not assumed.
_Avoid_: wheel circumference, roller diameter

**lane map**: The operator-configured mapping from a hardware sensor position (the box reports four, positionally) to a race lane. Not derivable from the protocol — it depends purely on which bike's cable is in which jack. When none is configured the app assumes the conventional wiring (port 0 is the left bike, port 1 the right) rather than mapping ports to racers in lineup order, so a `lane swap` reroutes the ticks with it.
_Avoid_: sensor mapping, channel assignment

**lane swap**: The host's correction to which physical bike each racer in a staged race is on — one keystroke (`S`) or a button in the race tray. Head-to-head exchanges the two racers; solo moves the lone rider to the other bike. Nobody is assigned a bike, riders mount whichever they like, and rotation ticks alone can never say who is who, so this is how the app learns who is where. Allowed while the race is `scheduled` or `staging` and refused once the countdown starts — past that the box may be armed against the old `lane map` and an active race has ticks banked per lane, so the host resets the race to staged first. Available in every `event kind`, not just a `walk-up event`. See ADR 0019.
_Avoid_: lane flip (that is `raceDisplayLaneColorsFlipped`, a display setting), bike assignment, rebind

**box countdown**: The fixed, **silent** interval the OpenSprints box runs after the `g` (GO) command before it starts streaming ticks — roughly four seconds on the `basic_msg` firmware, emitting no countdown steps. Not configurable and not observable mid-way, so the app treats it as a tuned constant rather than something it can mirror.
_Avoid_: hardware countdown, box timer

**GO**: The instant a race becomes live and pedaling starts counting — the zero of the countdown. On the cue path it is **music-locked**: it fires on the app's own clock at the end of the countdown duration, not on the box's first tick.
_Avoid_: start, race start (when the exact live instant is meant)

**pre-roll**: The app-owned wait at the head of a countdown before the `g` command is sent to the box, sized so the `box countdown` lands its stream on `GO`. Zero when the countdown duration is at or below the `box countdown`; on the simulator there is no pre-roll at all.
_Avoid_: lead-in, warm-up

**cue countdown duration**: The countdown length a VirtualDJ `OS2L cue` may carry (`countdownMs`), letting a DJ sync `GO` to a musical moment. When absent or invalid, the countdown falls back to the shared default, which is chosen to match the `box countdown`.
_Avoid_: cue time, countdown length

### Setup and diagnostics

**runtime env file**: The per-user, gitignored `.env.local` the app loads at startup; lives at the workspace root in dev and the platform userData folder in packaged builds. The app reads it for all settings and writes back to it for managed settings.
_Avoid_: dotenv file, config file

**managed setting**: A configuration value an operator edits through an in-app Settings field; the app persists it into the runtime env file on their behalf and re-applies it without a hand-edited file. The managed set is the small list of operator-facing keys (tunnel mode/token/name, Stripe keys and CA cert, LAN host, public racer URL, web push keys).
_Avoid_: env field, config field

**advanced setting**: An env var the app reads but never writes, changed only by hand-editing the runtime env file (e.g. cloudflared path, ports, data dir, debug flags). Validated on load, but never surfaced as an in-app field.
_Avoid_: raw env, power-user setting

**subsystem health**: The ready/degraded/failed readiness state of one configurable subsystem—tunnel, Stripe, web push, network, OS2L, photo booth—aggregated on the Settings status surface so an operator can answer "is anything broken?" at a glance. Reports only the subsystems the `event kind` actually keeps: one the kind withholds is omitted entirely rather than reported degraded, since "off by design" and "broken" read identically once a row goes amber. See ADR 0021.
_Avoid_: service status, system status

**known-error catalog**: The mapping from a recognized subsystem failure to plain-language operator guidance and a next action. Unrecognized failures fall back to surfacing the raw error plus "copy the diagnostics bundle and send it to the maintainer."
_Avoid_: error map, error table

**diagnostics bundle**: The redacted, shareable export of app status and logs a colleague sends to the maintainer when something fails—offered as a copyable summary and a saved zip of full logs. Secret values are never included; secrets appear only as set/unset or last-4.
_Avoid_: log export, debug dump
