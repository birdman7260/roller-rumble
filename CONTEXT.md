# Roller Rumble

A local-first Electron app for running live stationary-bike race events. One host machine runs the full stack; racers join from phones over a LAN or Cloudflare tunnel.

## Language

### Race lifecycle

**ActiveRace**: The live, in-process owner of a single race from activation through finalization. Holds lane telemetry state for each participant, processes rotation samples into metrics, tracks the grace-period finalization timer, assigns the winner, and persists results. Exactly one `ActiveRace` exists at a time, or none.
_Avoid_: runtime, currentRuntime

**RaceRecord**: The persisted representation of a race in SQLite. Exists before, during, and after the race is live. Carries state (`staging`, `countdown`, `active`, `interrupted`, `finished`), participants, metrics snapshots, and result references.
_Avoid_: race (alone, when the persisted record is meant)

**LaneTelemetryState**: The in-memory rolling state for one participant's lane during an `ActiveRace`. Accumulates rotation samples into speed, distance, wattage, and elapsed time. Not persisted directly — its `snapshot` field is what gets written to the `RaceRecord`.
_Avoid_: lane state, racer state

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
