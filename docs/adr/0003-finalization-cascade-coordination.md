# RollerRumbleApp stays the cross-domain coordinator; extracted services are leaf modules with narrow db ports

When splitting the `RollerRumbleApp` god class (architecture review June 2026, Candidate 3),
we decided **not** to reduce it to a thin pass-through coordinator. Instead it remains the
owner of the **finalization cascade** — the cross-domain side-effect chain that `handleRaceFinalized`
fans out: tournament outcome (`applyTournamentRaceOutcome`) → result presentation → auto-stage
(`maybeAutoStageNextRace`) → queue reconciliation (`reconcileQueueRaceStatuses`) → queue
notification triggers → `emitSnapshot`. Extracted services are **leaf modules**: each takes a
narrow `Pick<AppDatabase, …>` port, owns its own domain writes, returns plain domain results
(never `AppSnapshot`), and never emits snapshots or runs cross-domain orchestration.

Pass 1 therefore extracts only the three services that sit **outside** the cascade —
`AuthService`, `PaymentService`, `NotificationService` (the "how to send" half only; triggers
stay in the app). `QueueService` and `TournamentService` are deferred to pass 2 because the
cascade welds them together, and moving them requires first deciding how the coordinator hands
off `applyTournamentRaceOutcome`, `maybeAutoStageNextRace`, and `reconcileQueueRaceStatuses`
without scattering the cascade across modules. The cascade itself stays coordinator-owned in
both passes.

## Considered options

- **Full five-way split into a thin coordinator** (the review's diagram). Rejected: the cascade
  is genuinely cross-domain, so a "thin" coordinator would still need an intent/event bus to
  re-assemble the same chain, trading one coupling for a less legible one. The app is the
  natural home for orchestration that no single domain owns.
- **Narrow `Pick<>` ports vs. hand-authored store interfaces vs. passing the whole `db`.** Chose
  `Pick<AppDatabase, …>` aliases: zero runtime cost, near-zero boilerplate, and they break at
  compile time if a db method is renamed, documenting exactly which tables each service touches
  without duplicating signatures (the in-tree `ActiveRace` precedent passes the whole `db`; the
  port is a deliberate tightening for the leaf services).

## Consequences

- `app.ts` shrinks from ~3177 to ~2300–2400 lines after pass 1 but stays the largest module and
  the orchestrator — by design, not as unfinished work.
- Services never depend on the `AppSnapshot` shape, preserving the SnapshotAssembler boundary
  (ADR 0002). Snapshot emission stays in the app's thin wrapper methods.
- Leaf services return **plain domain results** instead of mirroring the app's old shapes — e.g.
  `AuthService.finishPasskey*` returns `Racer` (the app wrapper adds the snapshot) and
  `PaymentService` exposes `applyCheckoutCompleted` / `createCheckoutForQueue` rather than the
  app's `{ …, snapshot }` responses. This is a deliberate signature reshape, not a verbatim move.
- `AppHttpError` moved to `services/http-error.ts` to break the app↔services import cycle (the app
  imports services; services need the error type). `app.ts` re-exports it so `server.ts` imports
  stay byte-stable; leaf services import it from `./http-error`. Pass 2 services follow the same
  rule.
- Pass 1 is complete: AuthService + PaymentService landed together (they shared a test boundary),
  then NotificationService. `app.ts` went 3177 → 2466 lines. NotificationService's async push
  dispatch updates delivery state and then calls an **injected `onPushDelivered` callback**
  (wired to `emitSnapshot`) rather than emitting itself — the same leaf-signals-coordinator
  pattern the sensor/OS2L adapters already use, preserving the "leaf never emits" rule.
- Pass 2 (Queue/Tournament) starts from this contract: the cascade does not move, only the
  domain CRUD around it does.
