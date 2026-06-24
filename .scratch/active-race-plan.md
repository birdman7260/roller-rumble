# ActiveRace — TDD Implementation Plan

Extracted from the grilling session. See `CONTEXT.md` for term definitions and
`docs/adr/0001-active-race-finalized-callback.md` for the callback decision.

## What we're building

A new module `apps/desktop/src/backend/services/active-race.ts` that concentrates
the live race lifecycle currently scattered across five private methods in
`RollerRumbleApp` (`activateRace`, `handleRotation`, `reconcileRuntimeTargetDistance`,
`finishLaneTelemetryState`, `finalizeCurrentRace`).

## Interface

```ts
type FinalizedRaceResult = {
  race: RaceRecord;
  winnerRacerId: string | null;
};

class ActiveRace {
  // Normal path — zero metrics, beginRace(), marks queue entry "racing"
  static start(
    race: RaceRecord,
    db: AppDatabase,
    sensor: SensorAdapter,
    onFinalized: (result: FinalizedRaceResult) => void
  ): ActiveRace;

  // Recovery path — reconstructs lane states from race.metrics, beginRace()
  // Calling resume(...).finalize() replaces finalizeInterruptedRace()
  static resume(
    race: RaceRecord,
    db: AppDatabase,
    sensor: SensorAdapter,
    onFinalized: (result: FinalizedRaceResult) => void
  ): ActiveRace;

  tick(racerId: string, timestampMs: number, deltaRotations: number): void;
  finalize(): void; // admin-triggered; timer path calls onFinalized directly
  dispose(): void; // clears grace-period timer on app shutdown
}
```

Caller responsibilities after each `tick()`: call `emitSnapshot()`.
Caller responsibilities after `onFinalized` fires: `applyTournamentRaceOutcome`,
`showRaceResultPresentation`, `maybeAutoStageNextRace`, `runQueueNotificationTriggers`,
`emitSnapshot`.

## Test file

`apps/desktop/src/backend/services/active-race.test.ts`

Tests use lightweight mock objects for `AppDatabase` and `SensorAdapter` — no
real SQLite or file I/O. Vitest fake timers for the grace-period timer.

### Test fixture helpers

```ts
function makeRace(patch?: Partial<RaceRecord>): RaceRecord; // two-participant race, 250m target
function makeDb(race: RaceRecord): MockDb; // updateRace returns merged record
function makeSensor(): MockSensor; // vi.fn() for all methods
```

## Behaviors to test (in order)

### Tracer bullet

1. **`start()` transitions the race to active in the DB**
   — `db.updateRace` called with `{ state: "active", startedAt: <iso> }`

### Core activation

2. **`start()` arms the sensor for the race participants**
   — `sensor.beginRace(race.participants)` called
3. **`start()` marks the queue entry as racing**
   — `db.markQueueEntryStatus(race.queueEntryId, "racing")` called

### Telemetry

4. **`tick()` updates lane metrics in the DB after each rotation sample**
   — after one tick, `db.updateRace` called with `metrics` array containing updated distance
5. **`tick()` accumulates distance across multiple samples**
   — after two ticks for the same racer, total distance equals the sum

### Finalization — manual path

6. **`finalize()` calls `onFinalized` with the winner and finalized race**
   — callback receives `{ race: { state: "finished" }, winnerRacerId: ... }`
7. **`finalize()` ends the sensor**
   — `sensor.endRace()` called
8. **`finalize()` persists results with correct placement order**
   — `db.createResults` called; lane that finished first has `placement: 1`
9. **`finalize()` is idempotent — second call is a no-op**
   — calling `finalize()` twice only fires `onFinalized` once

### Auto-finalization (grace period timer)

10. **When a lane reaches the target, `onFinalized` fires after 1 500 ms**
    — using fake timers: tick racer past target, advance 1 500 ms, callback fires
11. **The other lane gets one last sample before `onFinalized` fires**
    — tick racer A past target, then tick racer B, advance timer — B's last sample is included
12. **First lane to cross is the winner even if the timer fires later**
    — racer A crosses first; racer B crosses during grace window — winner is A

### Cleanup

13. **`dispose()` prevents the grace timer from firing**
    — tick racer past target, call `dispose()`, advance 1 500 ms — `onFinalized` not called

### Recovery path

14. **`resume()` starts from persisted metrics, not zero**
    — race has non-zero metrics; after resume, first tick adds to existing distance
15. **`resume().finalize()` immediately finalizes an interrupted race**
    — covers `finalizeInterruptedRace()`: resume then finalize, results created from stored metrics

## What moves out of `RollerRumbleApp`

Once `ActiveRace` is implemented and tested:

- Replace `this.currentRuntime` (private field) with `this.currentActiveRace: ActiveRace | null`
- `activateRace()` → `ActiveRace.start(...)`
- `resumeInterruptedRace()` → `ActiveRace.resume(...)`
- `finalizeInterruptedRace()` → `ActiveRace.resume(...).finalize()`
- `handleRotation()` callback → `this.currentActiveRace?.tick(...)`
- `this.currentRuntime?.finalizeTimer` cleanup in `close()` → `this.currentActiveRace?.dispose()`
- `reconcileRuntimeTargetDistance()` — appears to be dead code (guard at line 2136
  prevents it from running on an active race); verify and delete

## Files

| Action | Path                                                                     |
| ------ | ------------------------------------------------------------------------ |
| Create | `apps/desktop/src/backend/services/active-race.ts`                       |
| Create | `apps/desktop/src/backend/services/active-race.test.ts`                  |
| Modify | `apps/desktop/src/backend/services/app.ts` (wire in, remove old methods) |
