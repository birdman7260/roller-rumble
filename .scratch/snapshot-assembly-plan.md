# SnapshotAssembler — Execution Plan

Candidate 2 from `docs/architecture-review-2026-06-23.html`: _"Deepen snapshot
assembly — one module owns the full snapshot."_ Extracted from a grilling session.
See `CONTEXT.md` for term definitions and `docs/adr/0002-snapshot-assembler-boundary.md`
for the boundary decision recorded as part of this work.

Base: branch off `main` at `c80d5ff` (clean, pushed, ActiveRace already landed).

## Problem (from the review)

Snapshot-shape knowledge leaks across the server seam. `server.ts` re-filters the
snapshot for racer clients (`createRacerSnapshotPayload`, lines 85–149) and the full
shape is assembled inside the `RollerRumbleApp` god class (`getSnapshot`, app.ts:684).
Changing the snapshot shape means touching two files; the racer-vs-admin payload
difference is invisible and untested.

## What we're building

A new module `apps/desktop/src/backend/services/snapshot-assembler.ts` that owns
**(a)** assembly of the full `AppSnapshot` from a database handle plus an injected
context bag, and **(b)** per-surface projection of that snapshot. `server.ts` stops
knowing the snapshot shape; it only asks the service to project per surface.

### Decisions locked in the grilling session

1. **Pure / stateless assembler.** Per-client throttle/diff state (the 1000 ms racer
   coalescing timer) is connection-scoped and **stays in `server.ts`**. The module is
   read-only — it never writes the DB and holds no timers.
2. **`forSurface(surface)` dispatch**, keeping all three surface names
   (`admin | projector | racer`). `admin` and `projector` return the full shape today;
   the seam is ready if projector later diverges.
3. **No racer id.** One racer-shaped payload for all racers, matching current behavior.
   The WS connection only carries `surface`; we do not thread a racer id.
4. **Assemble-from-context + project.** The module assembles from `db` + an injected
   context bag (the live runtime state only the app knows). `RollerRumbleApp` runs
   `reconcileQueueRaceStatuses` (a DB write shared with two non-snapshot call sites)
   **before** assembly, then hands the context in. Reconcile stays out of the module.
5. **Class owned by the app; projection re-exposed on the service.** `server.ts` keeps
   depending only on `service` — no new import of the snapshot module.
6. **Inject a `now()` clock + golden-snapshot guard.** Deterministic tests; a captured
   fixture proves the wire payload is byte-identical (modulo injected `generatedAt`).
7. **Main thread owns the interface + core extraction + server cutover.** Haiku
   subagents fan out — after the interface is frozen — on independently-verifiable
   slices.

## Interface

```ts
// snapshot-assembler.ts
export type SnapshotStreamSurface = "admin" | "projector" | "racer";

// The live runtime state only RollerRumbleApp knows at assemble time.
export interface SnapshotContext {
  resultPresentation: RaceResultPresentation | null;
  tunnel: TunnelState;
  os2l: Os2lDiagnostics;
  photoBooth: PhotoBoothStatus;
  stripe: StripeSetupStatus;
  countdownDurationMsFor: (raceId: string) => number;
  now?: () => number; // default Date.now — injected for deterministic tests
}

export class SnapshotAssembler {
  constructor(private db: AppDatabase) {}

  // Full ("admin/projector") shape. Pure read; assumes reconcile already ran.
  assemble(ctx: SnapshotContext): AppSnapshot;

  // Per-surface projection. admin/projector -> passthrough; racer -> stripped payload.
  forSurface(snapshot: AppSnapshot, surface: SnapshotStreamSurface): AppSnapshot;
}
```

### Caller wiring in `RollerRumbleApp`

```ts
private snapshots = new SnapshotAssembler(this.db);

getSnapshot(): AppSnapshot {
  const activeEvent = this.db.getActiveEvent()!;
  this.reconcileQueueRaceStatuses(activeEvent.id); // stays here — shared DB write
  return this.snapshots.assemble(this.snapshotContext());
}

// Re-exposed so server.ts depends only on `service`.
snapshotForSurface(full: AppSnapshot, surface: SnapshotStreamSurface): AppSnapshot {
  return this.snapshots.forSurface(full, surface);
}

private snapshotContext(): SnapshotContext {
  return {
    resultPresentation: this.resultPresentation,
    tunnel: this.tunnelManager.getState(),
    os2l: this.os2lTrigger.getDiagnostics(),
    photoBooth: this.getPhotoBoothStatus(),
    stripe: this.getStripeSetupStatus(),
    countdownDurationMsFor: (raceId) => this.getCountdownDurationMs(raceId)
  };
}
```

### What moves into the module

- `getSnapshot`'s assembly body (DB reads, queue reindex, currentRace/nextQueueEntry,
  tournament bundles, theme selection, countdown math, `metricsByRacerId`) → `assemble`.
- `buildRacerSummaries` (pure stat computation) → private method on the assembler.
- `createRacerSnapshotPayload` (server.ts:85–149) → `forSurface`'s `racer` branch.
- The duplicated backend `SnapshotStreamSurface` type (server.ts:68) → exported from
  the module; `server.ts` imports it.

### What stays put

- `reconcileQueueRaceStatuses` — DB write, also called from `clearRaceResultPresentation`
  and app.ts:2042. Runs as a pre-step before `assemble`.
- Per-client throttle: `SnapshotStreamClientState`, `scheduleRacerSnapshot`,
  `sendSnapshotForSurface`, the 1000 ms interval — all stay in `server.ts`, now calling
  `service.snapshotForSurface(full, surface)` instead of `createRacerSnapshotPayload`.
- `onSnapshot` / `emitSnapshot` broadcast plumbing — unchanged; still emits the full
  snapshot, broadcast loop projects per client.

## Safety: behavior-preserving guarantee

This is a refactor — the wire payload must not change. Guard rail:

1. **Before** any extraction, capture golden fixtures from current code: serialize
   `service.getSnapshot()` (full) and `createRacerSnapshotPayload(full)` (racer) against
   a seeded in-memory DB into `__fixtures__/snapshot-*.json`.
2. **After** each step, assert the new assembler output is byte-identical to the fixture,
   with `generatedAt` pinned via the injected `now()`.
3. A dropped/renamed field then fails loudly instead of silently shipping.

## Execution sequence

Each step leaves the quality gate green
(`pnpm format && pnpm quality && pnpm typecheck && pnpm test && pnpm build`) and is its
own commit on the feature branch.

| #   | Commit                                                                                                                       | Owner     | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| 0   | Golden fixtures + seeded-DB test harness; add `now()` seam to `getSnapshot`                                                  | **main**  | —          |
| 1   | `SnapshotAssembler` class: `assemble` + `forSurface` + `SnapshotContext` (interface frozen here)                             | **main**  | 0          |
| 2   | Wire `RollerRumbleApp` to the assembler; delete inlined assembly + `buildRacerSummaries`; add `snapshotForSurface`           | **main**  | 1          |
| 3   | `server.ts` cutover: call `service.snapshotForSurface`; delete `createRacerSnapshotPayload`; import surface type from module | **main**  | 2          |
| 4a  | Per-surface unit tests (racer strips metrics/themes/tunnel/etc.; admin==projector==full)                                     | **haiku** | 1          |
| 4b  | Consolidate the triple-defined `SnapshotStreamSurface` (renderer api.ts, query.tsx, backend) onto one source                 | **haiku** | 1          |
| 4c  | Domain docs: add terms to `CONTEXT.md`; write `docs/adr/0002-snapshot-assembler-boundary.md`                                 | **haiku** | 1          |

Steps 4a–4c run in parallel once step 1 freezes the interface.

## Haiku delegation

Haiku is strong on well-specified, independently-verifiable tasks against a frozen
contract; weak on cross-cutting judgment. Main keeps the god-class-touching, wire-shape-
critical work (steps 0–3). Each haiku task below has a closed contract and its own
verification command.

### Task 4a — assembler unit tests

- **Spec:** Given the frozen `SnapshotAssembler` interface and the seeded-DB harness from
  step 0, write `snapshot-assembler.test.ts` asserting: (i) `forSurface(full, "racer")`
  strips `metricsByRacerId`, `resultPresentation`, `themes`, ticker messages, and
  collapses tunnel/os2l/photoBooth/stripe to their public-safe subset exactly as the old
  `createRacerSnapshotPayload` did; (ii) `forSurface(full, "admin")` and `"projector"`
  return the full snapshot unchanged; (iii) `assemble` with a pinned `now()` equals the
  golden fixture.
- **Must not:** change any non-test file; invent new payload fields.
- **Verify:** `pnpm --filter @roller-rumble/desktop test -- snapshot-assembler.test.ts`
  and `pnpm typecheck`.

### Task 4b — surface-type consolidation

- **Spec:** `SnapshotStreamSurface` is defined three times (renderer `lib/api.ts:664`,
  used in `lib/query.tsx`, backend `server.ts:68`). Point the backend at the module's
  exported type and remove the local backend duplicate. Do **not** merge the renderer
  copy across the front/back boundary — only de-dupe within the backend.
- **Verify:** `pnpm typecheck && pnpm lint`.

### Task 4c — domain docs + ADR

- **Spec:** Add to `CONTEXT.md` a "Snapshot" subsection defining: **AppSnapshot** (full),
  **SnapshotAssembler**, **surface** (`admin`/`projector`/`racer`), **racer payload**
  (public-safe projection), **SnapshotContext** (injected runtime state). Write
  `docs/adr/0002-snapshot-assembler-boundary.md` recording: pure read-only module,
  reconcile stays in app, throttle stays in server, no racer id (decisions 1–6 above).
- **Verify:** `pnpm format:check` (markdown formatting only).

### Stays on main (not delegated)

Steps 0–3: golden-fixture capture, the `SnapshotAssembler` extraction, the
`RollerRumbleApp` rewire, and the `server.ts` cutover — all touch the 3,500-line god
class and/or the exact wire payload, where a model weaker on cross-cutting judgment risks
high-blast-radius rework.

## Risks / watch-items

- **`includeAllRaceData` setting** branches results filtering in both `getSnapshot` and
  `buildRacerSummaries`; the fixture harness must cover both on/off to lock behavior.
- **`countdownSecondsRemaining`** depends on `getCountdownDurationMs(raceId)` (race
  config the app owns) — passed via `countdownDurationMsFor`, not reachable from `db`
  alone. Confirm it stays a context function.
- **`metricsByRacerId`** is derived from `currentRace.metrics`, which `ActiveRace` (now
  on main) writes. Read-only here; no coupling, but the fixture should include a race
  mid-flight so metrics projection is exercised.

```

```
