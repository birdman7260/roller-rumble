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
