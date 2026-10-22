# Tournaments seed by event fastest time, so the bracket cutoff is a real promise

**Status:** accepted. Builds on [ADR 0022](0022-top-racers-board-ranks-one-run-per-racer.md) (what makes a run qualify) and [ADR 0002](0002-snapshot-assembler-boundary.md) (the assembler is a pure read).

The projector now shows the `bracket cutoff` during open time trial: the time a racer must beat to make the `planned bracket size`. That only means something if beating it actually puts you in the bracket, and the old seeding didn't work that way. `buildSeeds` scored each racer `wins × 1000 + avg top speed × 20 + avg speed × 10 + races`, so wins dominated. A racer who beat the posted time could still miss the bracket to someone with more wins and slower runs.

Seeding now ranks by **event fastest time first**: every racer with a qualifying run, in the `top racers board`'s order (fastest, then the earlier run, then racer id). Racers with no qualifying run follow, ordered by the old score, so a bracket larger than the field of finishers still fills the way it used to. The same order picks an opt-out's replacement, so the next-fastest racer steps in.

## Considered Options

- **Seed by fastest time (chosen).** The cutoff and the seeding read the same ranking (`rankTopRacers`), so they cannot drift apart, and seed 1 is simply the fastest rider of the evening, which is what an open time trial measures.
- **Keep the score and show the Nth-fastest time as a benchmark (rejected).** It is cheaper, but a number on the projector labelled as the way into the tournament, which then doesn't decide who gets in, misleads the racers it is meant to motivate.

## Consequences

- **Wins no longer seed racers who have a time.** A head-to-head win counts only through the time the rider posted in it.
- **The cutoff ignores `includeAllRaceData`**, like the board does: it ranks the active event's runs at its race distance. Racers with no qualifying run still fall back to a score over the results `includeAllRaceData` selects.
- **The planned size lives on the event**, not in the admin window, because the projector has to read it. Picking a size in the bracket size dropdown plans it; the host can hide the cutoff again, which clears the plan.
- **The cutoff disappears while a tournament is active.** It comes back once that tournament ends, since the event can go back to open time trial afterwards.
