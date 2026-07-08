# Roller Rumble

A local-first Electron app for running live stationary-bike race events. One host machine runs the full stack; racers join from phones over a LAN or Cloudflare tunnel.

## Language

### Racer identity and sign-in

**racer account**: The persisted `Racer` row (id, display name, avatar) plus its `identity` rows. Carries race history/results, queue occurrences, push subscriptions, booth captures, and payment records. Distinct from an `accountless racer`, who has only an `anonymous` identity. Account takeover at a live event is a low-stakes threat (host is physically present; no stored card to spend) — the harm to avoid is PII exposure (email/phone), not fraud.
_Avoid_: user, profile (when the persisted racer identity is meant)

**identity**: A row in the `identities` table binding one `(type, value)` — `email`, `phone`, or `anonymous` — to exactly one `racer account`. Globally unique per `(type, value)`. A racer account is found by matching an identity, not by a column on the racer row; one account can hold several identities.
_Avoid_: login, credential (a `passkey` is a credential; an identity is not)

**passkey**: The device-bound credential (Face ID / Touch ID / fingerprint / device PIN, via WebAuthn) that authenticates a `racer account`. Does not sync across ecosystems (iPhone↔Android) unless backed up to a password manager, so a returning racer on a new device may have no usable passkey.
_Avoid_: credential, WebAuthn credential (in racer-facing copy)

**host-assist**: The recovery path where a physically-present host binds a racer's phone to an existing `racer account`, after which the phone signs in and can add a `passkey`. Mechanism: the host generates a single-use, short-TTL `attach QR` in the admin Racers tab; the racer scans it to receive a session for that account. The human backstop that lets self-serve recovery stay low-friction, and the offline fallback when `email one-time code` can't send.
_Avoid_: admin recovery, manual attach

**attach QR**: A single-use, short-TTL QR the host generates in the admin Racers tab that encodes a one-time claim token for a chosen `racer account`. Scanning it mints a racer session on the scanning phone (first-scan-wins). Renders only in the admin window — never on the public projector, since it grants account access.
_Avoid_: pairing code, login QR

**accountless racer**: A racer who signs in with a display name only — no email, no passkey. Enabled by an optional host setting. Their results are not linked to a `racer account` unless later reconciled.
_Avoid_: guest, anonymous (pick one canonical term — `accountless`)

**passkey recovery**: The set of paths offered when a returning racer's email is known but has no usable `passkey` on this device (new phone, switched ecosystem, lost device, different browser). v1 offers three: `email one-time code` (primary), `race under your name` (fast fallback), and `host-assist` (backstop when email can't send).
_Avoid_: account recovery, sign-in help

**email one-time code**: A short numeric code emailed to a racer's registered address to prove ownership, after which they attach a new `passkey` on the current device. Requires outbound internet, so it degrades to `host-assist` at LAN-only venues. Chosen over a magic link so the racer stays in the same page/session.
_Avoid_: magic link, OTP (in racer-facing copy), verification email

**race under your name**: The `passkey recovery` path where a locked-out racer proceeds as an `accountless racer` for the current event to race immediately, deferring account restoration. Produces a duplicate racer that `racer reconciliation` can later fold into the real `racer account`.
_Avoid_: guest mode, skip sign-in

**racer reconciliation**: The desk workflow that resolves a `race under your name` duplicate: the host runs a `racer merge` (absorbing the `accountless racer` into the real `racer account`) and, separately, issues an `attach QR` so the racer's phone signs into the survivor and adds a `passkey`. Realized by two independent admin tools, not one wizard.
_Avoid_: account linking (that's one part of it)

**racer merge**: The general admin operation that folds one `racer account` (the _absorbed_) into another (the _survivor_), reparenting every racer-referencing row — including non-FK/JSON references (`queue_entries.racerIdsJson`, `races.winnerRacerId`/participants/metrics, `bracket_nodes`, `group_matches`, tournament seeds) — then deleting the absorbed row. Host explicitly picks the survivor and its display name/avatar; identities, passkeys, payments, and push subscriptions all union (globally-unique keys, no loss). Hard-refuses when the two share a tournament/bracket or race or when a race is live (would corrupt standings); auto-resolves the two unique-index collisions (`event_racers` keeps `paid`; `notification_deliveries` keeps the read/most-progressed row). Destructive and not logically reversible — guarded by a confirm summary, an audit row, and a timestamped SQLite file snapshot taken immediately before.
_Avoid_: dedupe, link (alone)

### Race lifecycle

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

### Queue and events

**Event**: The top-level container for a race session — holds racers, queue entries, races, and tournament data. One event is active at a time.
_Avoid_: session, meet

**Queue**: The ordered list of upcoming open time trial races. Entries are slots that the app projects into visible race pairings. Distinct from a `Tournament`, which has its own match structure.
_Avoid_: lineup, race list

**AppSnapshot**: The complete derived state broadcast over WebSocket to all connected surfaces (admin, projector, racer). Assembled from SQLite on demand; not the source of truth itself.
_Avoid_: state, live state

### Snapshot assembly

**SnapshotAssembler**: The deep module that owns the full `AppSnapshot` shape end-to-end—assembling it from SQLite plus an injected runtime context, and projecting it per surface. Pure and read-only; the caller runs any DB writes (like queue reconciliation) before calling it.
_Avoid_: snapshot builder, snapshot service

**SnapshotContext**: The live runtime state only `RollerRumbleApp` knows at assemble time (tunnel state, OS2L diagnostics, photo-booth status, Stripe setup, result presentation, countdown duration lookup, and an injectable clock). Passed into `assemble` so the module stays a pure read.
_Avoid_: snapshot deps, runtime bag

**surface**: A snapshot streaming destination—`admin`, `projector`, or `racer`. `admin` and `projector` receive the full snapshot; `racer` receives a public-safe projection.
_Avoid_: client type, channel

**racer payload**: The public-safe projection of an `AppSnapshot` for racer phones—live metrics, result presentation, themes, ticker messages, and operator-only tunnel/OS2L/photo-booth/Stripe detail are stripped. One payload serves all racers (no per-racer identity).
_Avoid_: filtered snapshot, mobile snapshot

### Hardware sensing

**tick**: The atomic unit of progress the race hardware reports — one revolution of a bike's roller, sensed as one reed-switch pulse. The OpenSprints box streams a cumulative tick count per sensor position; the app turns each new tick into one rotation of distance. Distance per tick is the roller's **rollout**, not a bike-wheel circumference.
_Avoid_: pulse, count, rotation (when the hardware unit is meant)

**rollout**: The real-world distance a bike travels per one roller revolution — the calibration constant that converts ticks into meters. Hardware-specific; measured, not assumed.
_Avoid_: wheel circumference, roller diameter

**lane map**: The operator-configured mapping from a hardware sensor position (the box reports four, positionally) to a race lane. Not derivable from the protocol — it depends purely on which bike's cable is in which jack.
_Avoid_: sensor mapping, channel assignment

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

**advanced setting**: An env var the app reads but never writes, changed only by hand-editing the runtime env file (e.g. cloudflared path, ports, data dir, passkey RP id, debug flags). Validated on load, but never surfaced as an in-app field.
_Avoid_: raw env, power-user setting

**subsystem health**: The ready/degraded/failed readiness state of one configurable subsystem—tunnel, Stripe, web push, network, OS2L, photo booth—aggregated on the Settings status surface so an operator can answer "is anything broken?" at a glance.
_Avoid_: service status, system status

**known-error catalog**: The mapping from a recognized subsystem failure to plain-language operator guidance and a next action. Unrecognized failures fall back to surfacing the raw error plus "copy the diagnostics bundle and send it to the maintainer."
_Avoid_: error map, error table

**diagnostics bundle**: The redacted, shareable export of app status and logs a colleague sends to the maintainer when something fails—offered as a copyable summary and a saved zip of full logs. Secret values are never included; secrets appear only as set/unset or last-4.
_Avoid_: log export, debug dump
