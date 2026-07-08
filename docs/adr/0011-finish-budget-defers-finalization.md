# The finish budget defers finalization; the race stays live until both racers finish or the trailing racer runs out of time

Previously a race finalized ~1500ms after the first racer crossed the line, so the results overlay
appeared while the trailing racer was still pedaling. We now keep the `ActiveRace` **live** past the
winner's crossing and finalize only when the `trailing racer` also finishes or their `finish budget`
expires — so the trailing rider actually reaches the line and earns a real finish time. The budget is
reckoned from race start as `winner.finishedAtMs × RACE_FINISH_BUDGET_PERCENT`, floored so it is never
less than five seconds beyond the winner's finish; on expiry the trailing racer is force-finished at
partial distance and placed second (the same force-finish path `finalize()` already ran). A companion
change — `finish freeze` — bails out of `tick()` once a lane's `finishedAtMs` is set, so a finished
rider's live metrics stop instead of being overwritten with fresh motion. Solo races are unaffected:
one lane, no budget, finalize on the lone finish.

## Considered options

- **Defer finalization (chosen)** vs. **finalize early and delay only the overlay.** Delaying just the
  `resultPresentation` in `app.ts` would freeze the loser mid-track and stall a modal over a dead race —
  the trailing racer would never get a real finish time. Keeping the race live is the only option that
  delivers the actual goal ("wait until *both* have finished"), and it keeps the `ActiveRace` the sole
  owner of "is the race over?" exactly as CONTEXT.md already frames it.
- **Partial-distance 2nd place (chosen)** vs. **an explicit DNF status.** There is no DNF concept in the
  schema or UI today; the winner already took the win, so a partial-distance second reads correctly and
  reuses the existing force-finish path. DNF is a whole new domain concept for marginal payoff.
- **Advanced env setting (chosen)** vs. **in-app managed setting** vs. **per-event value.** The budget
  percent is a set-once-per-venue knob, not a per-event dial a live operator tweaks, so it does not earn
  the managed-setting write-back plumbing or a schema column. Promote it to a managed setting later only
  if operators genuinely want to tune the drama live.

## Consequences

- The finalization trigger moves from a fixed 1500ms timer to two paths: a **short ~1500ms beat** on a
  clean finish (both crossed, or a solo finish) so the projector shows the finish line before the modal,
  and **immediate** finalization when the budget expires (that path already spent its drama waiting).
- The `finish budget` timer is an in-memory `setTimeout`, so it does **not** survive an interrupt/resume.
  A race interrupted after the winner crossed but before the trailing racer finished will not re-arm the
  budget on resume; the operator ends it with the existing manual finalize control. Re-arming was
  rejected because a paused clock has no well-defined remaining budget.
- `finish freeze` needs no new metric logic: `finishLaneTelemetryState` already zeros the instantaneous
  fields and preserves the record stats, so the only bug was `applyRotationSample` running after finish —
  the early-bail fixes it.
