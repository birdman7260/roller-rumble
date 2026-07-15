# A queue occurrence remembers its prior intent so challenge abandonment is exact

When we let racers `leave` the `Queue`, leaving a `challenge` occurrence forces a decision about the
opponent. Two situations look identical at leave time but should resolve oppositely: an opponent the
challenge **pulled in fresh** (held no prior spot) should be removed entirely — they never chose to be
in the open queue — while an opponent whose **existing** spot was merely upgraded to a challenge should
fall back to what they were doing before. The current `releaseOrphanedChallengeOccurrences` cannot tell
them apart, so it downgrades every orphaned partner to `auto-match` — keeping never-opted-in racers in
the queue, and silently converting an abandoned `solo` run into a head-to-head. We record each
occurrence's **prior intent** (the `intent` it held immediately before a challenge upgraded it, or
`null` if the challenge created it fresh) so orphan resolution becomes exact: `null` → remove,
`solo` → restore `solo`, `auto-match` → restore `auto-match`.

## Considered options

- **Persist prior intent on the occurrence (chosen)** vs. **infer origin at leave time.** Origin is not
  derivable from the surviving occurrences alone — once the challenge upgrade has happened, a
  fresh-pulled partner and an upgraded partner are byte-identical. The distinction only exists at
  signup, so it must be captured then and carried forward. This is a new nullable column on
  `queue_occurrences` and a migration.
- **Store prior intent (chosen)** vs. **a boolean `createdForChallenge` flag.** A boolean answers only
  "remove or keep," but the same field, holding the actual prior `intent`, also lets us restore a
  `solo` run correctly instead of flattening it to `auto-match`. Same storage cost, strictly more
  information — and it fixes the latent solo-downgrade bug for free.
- **Fix the solo-downgrade bug (chosen as a rider)** vs. **leave it.** Today an orphaned challenge always
  becomes `auto-match`. Since we are adding the field that makes the correct restore possible, doing it
  now costs nothing extra and removes a surprising behavior.

## Consequences

- New nullable `priorIntent` column on `queue_occurrences` (SQL migration + Drizzle schema mirror).
  Existing rows migrate as `null`, which reads as "no prior intent" — correct for anything not currently
  mid-challenge, and acceptable for the rare in-flight challenge at deploy time.
- `addQueueSignup` must set `priorIntent` when it upgrades an existing occurrence to a challenge (capture
  the old `intent`) and leave it `null` when it mints a fresh challenge occurrence.
- `releaseOrphanedChallengeOccurrences` changes from "downgrade to auto-match" to "resolve by
  `priorIntent`," and gains the ability to _remove_ occurrences, not just relabel them — so its callers
  (both `leave` paths and the existing signup normalization) now can shrink the occurrence set.
- The remove-the-fresh-partner branch is what triggers the opponent's `queue-status notification`; the
  restore-to-prior-intent branch stays silent (nothing the opponent chose was undone).
