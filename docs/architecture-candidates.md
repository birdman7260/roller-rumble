# Architecture deepening candidates

Backlog of **deepening opportunities** surfaced by an `/improve-codebase-architecture`
review (2026-07). Each turns a shallow module deep, for testability and AI-navigability.
The original review was an HTML report in a temp dir (not committed); this file is the
durable capture so each candidate can be picked up in a fresh conversation.

## How to pick one up

1. Open a **new conversation** (clear context — each candidate is an independent trip
   through the main flow).
2. Run **`/grill-with-docs`** with the candidate's *seed prompt* below to stress-test the
   design before building. It will re-derive the friction straight from the code.
3. The grilling settles the seam and interface; it may write an **ADR** and update
   **`CONTEXT.md`**. Then **`/implement`** (test-first via `/tdd`, closing with
   `/code-review`).

**Shared vocabulary:** `/codebase-design` (module · interface · depth · seam · adapter ·
leverage · locality). **Respect the ADRs** in `docs/adr/` — especially **ADR-0003**
(`RollerRumbleApp` stays the cross-domain coordinator that owns the finalization cascade;
extracted services are leaf modules with narrow `Pick<AppDatabase, …>` ports and never
emit snapshots).

> ⚠️ **Line numbers below are indicative, captured before PR #29** (the RaceCountdown
> extraction, which shrank `app.ts` by ~160 lines). Locate code by **symbol name**, not
> line number.

## Status

| # | Candidate | Strength | Status |
|---|-----------|----------|--------|
| 2 | Collapse the countdown into a GO sequencer (`RaceCountdown`) | Strong | ✅ Done — merged to `main` (PR #29), ADR-0017 |
| 1 | Inject the hardware adapters | Strong | ⏭️ Next up |
| 3 | Give `TournamentService` the tournament state machine | Worth exploring | Backlog (ADR-0003 pass 2) |
| 4 | Split the queue-status decision from its dispatch | Worth exploring | Backlog |
| 5 | Deepen the racer view-model behind a pure selector | Strong | Backlog |

**Suggested sequence:** 1 (builds on the #2 seam, retires the reflection test pattern) →
3 / 4 (the ADR-0003 pass-2 work) → 5 (independent frontend track).

---

## Candidate 1 — Inject the hardware adapters

**Strength:** Strong · **Category:** ports & adapters

**Seam / files:** `apps/desktop/src/backend/services/app.ts` (the constructor and the class
field initializers — `createSensorAdapter()`, `new ManualRaceTriggerAdapter()`,
`new Os2lRaceTriggerAdapter()`, `new AppDatabase()`, `new CloudflaredTunnelManager()`,
plus the leaf services); `apps/desktop/src/backend/services/app.test.ts` (the `Reflect`
pattern); `apps/desktop/src/backend/adapters/sensor.ts`, `adapters/trigger.ts`.

**Problem.** `RollerRumbleApp` constructs its entire world inside its constructor — sensor,
triggers, tunnel, db, and every service are `new`'d internally, nothing injected. So no
test can stand the coordinator up with fakes: the whole `app.test.ts` suite reaches *past*
the interface via `Reflect.get(RollerRumbleApp.prototype, "<privateMethod>")` and
re-attaches the prototype to a hand-built `this`. Evidence: **zero** `new RollerRumbleApp(`
in the suite; tests pin **private method names**, not the interface. Renaming a private
method breaks tests; the constructor wiring is never exercised.

**Direction.** Accept an adapter set at the constructor seam. Production wires the real
adapters; tests wire fakes plus an in-memory db. The interface becomes the test surface.

**Wins.** Interface becomes the test surface · two sensor adapters (simulator + box) = a
real seam · delete the reflection scaffolding · tests survive private-method renames ·
locality: wiring lives in one place · this is the payoff `RaceCountdown` (#2) already set
up — its `armingPort` injection is the first taste.

**ADR interaction.** Extends ADR-0003's narrow `Pick<AppDatabase, …>` port discipline from
the leaf services to the hardware seam. No conflict.

**Sequencing.** PR #29 (the `RaceCountdown` extraction) is **merged into `main`**, so #1
branches cleanly off `main` — no constraint remains. Its implementation still rewrites the
`app.ts` constructor and the `app.test.ts` reflection scaffolding, so start from
up-to-date `main`.

**Seed prompt:**
> `/grill-with-docs` inject the hardware adapters (sensor, triggers, tunnel, db) into
> `RollerRumbleApp` instead of constructing them in the constructor, so tests build the
> real coordinator with fakes and we can delete the `Reflect`-based test pattern.

---

## Candidate 3 — Give `TournamentService` the tournament state machine

**Strength:** Worth exploring · **Category:** in-process · **This is ADR-0003's deferred pass 2**

**Seam / files:** `apps/desktop/src/backend/services/app.ts` — `syncGroupsToFinals`,
`markTournamentCompleteIfFinished`, `applyTournamentRaceOutcome`, and the replacement-seed
helpers (`findTournamentReplacementSeeds` / `findNextTournamentReplacementSeed`);
`apps/desktop/src/backend/services/tournaments.ts` (large, but app.ts calls essentially one
method — `createTournamentBundle`); `apps/desktop/src/backend/services/competition.ts`.

**Problem.** `TournamentService` is **shallow**: app.ts calls one method
(`createTournamentBundle`) and keeps the whole bracket state machine for itself —
advancement, group→finals sync, completion checks — reaching *straight past* the service
into `competition.ts` (`advanceSingleElimination` / `advanceDoubleElimination` /
`computeRoundRobinStandings`). The service is a helper bag, not an owning module.

**Direction.** Move outcome-application, group→finals sync, and completion behind
`TournamentService`, returning a new `TournamentBundle`. The coordinator persists the
bundle and fires notifications (staying the cascade owner per ADR-0003).

**Wins.** Deletion test: complexity concentrates in one module · one bundle in, one bundle
out · bracket logic stops leaking across the seam · leverage: tested without driving the
god object.

**ADR interaction.** This **is** ADR-0003's deferred pass 2 ("only the domain CRUD around
the cascade moves; the cascade does not move"). Aligns with the ADR, doesn't reopen it.

**Seed prompt:**
> `/grill-with-docs` deepen `TournamentService` so it owns the tournament state machine
> (advance, group→finals sync, completion) and returns a new `TournamentBundle`, instead of
> app.ts owning that logic and reaching past the service into `competition.ts`. This is
> ADR-0003 pass 2.

---

## Candidate 4 — Split the queue-status decision from its dispatch

**Strength:** Worth exploring · **Category:** mock · plain-data

**Seam / files:** `apps/desktop/src/backend/services/app.ts` —
`runQueueNotificationTriggers`, `reconcileQueueStatusNotification`, `notifyRaceCompleted`;
`apps/desktop/src/backend/services/notifications.ts` (already holds pure helpers).

**Problem.** The ADR-0013 supersession rules (escalate → you're up; downgrade → hang tight;
teardown → you're out) are **interleaved with `createNotificationAndDispatch` side
effects**. The *decision* — what each waiting racer should see — can only be exercised by
driving the whole coordinator with a fake db and a fake push service. Decision and effect
aren't separable; this is the shape that bred the "spurious Queue update" ordering leak the
code comments describe.

**Direction.** A pure `reconcileQueueStatusNotifications(queue, liveTypes, inPlay) →
Intent[]` that returns notification intents; the coordinator applies them (keeping the
trigger *timing* in the coordinator).

**Wins.** Return intents, not side effects · test the ADR-0013 rules with plain data (no
db, no fake push) · locality: the rules live in one module.

**ADR interaction.** ⚠️ **Mild tension with ADR-0003** ("triggers stay in the app"). The
framing: keep the trigger's *timing* in the coordinator, move only the *pure derivation*
behind a seam — a deepening within the trigger step, not a relocation of it. Confirm that
reading holds during grilling; if it doesn't, this may warrant an ADR of its own.

**Seed prompt:**
> `/grill-with-docs` extract the ADR-0013 queue-status supersession *decision* into a pure
> `reconcileQueueStatusNotifications(queue, liveTypes, inPlay) → Intent[]`, so the rules are
> testable with plain data while the coordinator keeps the dispatch and timing.

---

## Candidate 5 — Deepen the racer view-model behind a pure selector

**Strength:** Strong · **Category:** in-process · renderer

**Seam / files:** `apps/desktop/src/renderer/pages/racer-page.tsx` (~1859 lines — the
view-model hook, `handleQueueSignup`, and the derived values);
`apps/desktop/src/renderer/pages/racer-sections/{race,stats,queue-tab}.tsx`;
`apps/desktop/src/renderer/pages/racer-sections/snapshot-display.ts`.

**Problem.** `racer-page.tsx` is a ~1859-line view-model that threads the **whole
`AppSnapshot`** into every section and recomputes the same derivations — "is this racer up
next", "tournament seed", "is this entry leavable" — in three components (poor locality).
Its ~70-line queue-signup branch (limit check, checkout branching, challenge-replacement,
payment-error handling) is trapped inside the React hook and can't be unit-tested without a
full mount.

**Direction.** A pure `selectRacerView(snapshot, racerId) → RacerView` selector plus a
queue-signup decision function. Sections read the narrow `RacerView`; the page becomes a
thin coordinator. (Note: `snapshot-display.ts` already exports some pure helpers — this
consolidates them behind one selector interface.)

**Wins.** Narrow interface, whole snapshot hidden · derive once, not three times ·
queue-signup rules become unit-tested · locality: one selector, N sections.

**ADR interaction.** None known. Keep the `AppSnapshot` wire shape unchanged (ADR-0002).

**Seed prompt:**
> `/grill-with-docs` deepen the racer page behind a pure `selectRacerView(snapshot,
> racerId) → RacerView` selector and a testable queue-signup decision function, so sections
> read a narrow view and the 1859-line `racer-page.tsx` becomes a thin coordinator.
