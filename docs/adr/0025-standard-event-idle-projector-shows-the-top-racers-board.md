# A standard event's idle projector shows the top racers board beside the queue

**Status:** accepted. Builds on [ADR 0022](0022-top-racers-board-ranks-one-run-per-racer.md) (the `top racers board`). **Revises ADR 0022** on one point: the board is no longer a walk-up-only card, so its derivation is no longer gated on `hasTopRacersBoard`.

Between open time trial races, a `standard` event's projector showed only the `signup prompt`, so the screen said nothing about the evening once racing had begun. Now it picks one of four views, from whether the `Queue` and the board have anything on them (`getProjectorIdleView`):

| Queue     | Board     | Stage                                                         |
| --------- | --------- | ------------------------------------------------------------- |
| empty     | empty     | the full `signup prompt`                                      |
| has races | has times | the queue beside the board                                    |
| empty     | has times | a compact signup prompt where the queue was, beside the board |
| has races | empty     | the queue beside a compact signup prompt                      |

The queue always takes the left half and the board the right, so the board never jumps across the screen as the queue fills and empties. A tournament still owns the stage with its bracket.

The board keeps ADR 0022's ranking contract exactly: one best qualifying run per racer, active event only, full distance covered (the same `hasReachedFinishLine` predicate `ActiveRace` uses), ties broken by the earlier run and then racer id, and cut to `AdminSettings.raceDisplayTopRacersRows` (3 to 10, default 5).

## Considered Options

- **Derive the board for every event (chosen).** There is no `event kind` yet, and when one lands a `standard` event wants the board too, so `hasTopRacersBoard` will be true for both kinds. `raceProjection.topRacers` is therefore always an array. ADR 0022's `null`-means-no-board state waits for a kind that withholds the board.
- **Rank on `RacerStats.bestFinishTimeMs` in the renderer (rejected).** For the reasons ADR 0022 already gives: it is a career stat that follows `includeAllRaceData` across events, and it counts force-finished partial runs.
- **Show the queue beside an empty board before anyone has a time (rejected).** An empty half on a projector recruits nobody; the compact QR does.

## Consequences

- **The board ranks against `AdminSettings.targetDistanceMeters`** until ADR 0023 moves the `race distance` onto the event. A `standard` event may still change its distance mid-event, and the board then shows only runs at the new distance; changing back brings the old times back, because no run is rewritten.
- **Every snapshot reads every race's target distance in the active event.** It is a narrow two-column select (`listRaceTargetDistances`), not `listRaces`, so it never parses race metrics. ADR 0022's concern about a full race scan on every broadcast still applies at league-night scale, and the fix is the same: gate it once a kind can withhold the board.
