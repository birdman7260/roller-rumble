# Racer accounts are merged by a general survivor-picked reparent, not a narrow accountless-absorb

Duplicate `racer account`s arise two ways: a locked-out returning racer who picks `race under your name` (creating an accountless duplicate for the night — see `racer reconciliation`), and the same person registering under two identities across events (phone one week, email the next). We decided to build a **general two-racer merge** rather than restricting the absorbed side to an `accountless racer`. A merge picks an explicit _survivor_ and _absorbed_ racer, the host chooses the surviving display name/avatar, and every racer-referencing row is reparented onto the survivor inside one transaction before the absorbed row is deleted.

The identity model makes most of this lossless: `identities`, `passkey_credentials`, `payments`, and `push_subscriptions` all have globally-unique keys, so they simply **union** onto the survivor. The work — and the risk — is in the references SQLite will not cascade for us: the JSON and non-FK columns (`queue_entries.racerIdsJson`, `races.winnerRacerId`/`participantsJson`/`metricsJson`, `bracket_nodes.{racerAId,racerBId,winnerRacerId}`, `group_matches.{…}`, `tournaments.settingsJson.seeds[]`) must be rewritten explicitly, and the two unique indexes collide and must be resolved by rule (`event_racers` keeps the `paid` row; `notification_deliveries` keeps the read/most-progressed row).

## Considered Options

- **General survivor-picked merge (chosen).** Covers both duplicate sources with one tool. Cost: every conflict category needs an explicit rule and the full ~17-site rewrite (incl. JSON/non-FK columns) must be handled now.
- **Absorb-accountless only (rejected).** Restrict the absorbed side to an `accountless racer` so there are no clashing identities/passkeys/payments. Simpler and safe, but cannot fix duplicate _real_ accounts across events — a real scenario we chose to support.
- **Relabel instead of merge (rejected).** Move the survivor's identity/passkey onto the newer racer and retire the old row — avoids rewriting results/JSON but orphans the old account's prior-event history. Unacceptable data loss.
- **Logical undo (rejected as the safety net).** Reversible merge via tombstone + reverse-map of every rewrite. Too much state for a rare host action; a pre-merge SQLite file snapshot gives cheap restore instead.

## Consequences

- Merge **hard-refuses** when the two racers share a tournament/bracket or a race, or when a race is live — merging would place one rider in two slots and corrupt standings. The host must resolve the structural clash before merging.
- The operation is **destructive and not logically reversible**. Safety net is a confirm screen listing per-category counts, an **audit row** (survivor id, absorbed id, timestamp, counts), and a **timestamped copy of the SQLite file** taken immediately before the merge — a file-restore escape hatch, not an in-app undo.
- The rewrite must stay **exhaustive**: any future table or JSON blob that references a racer id has to be added to the merge routine, or a merge will silently orphan it. This couples new racer-referencing schema to the merge code and needs a test that asserts coverage.
- Entry point is a new **global racer picker** (search the whole racer database, matching email/phone `identity` values, not just display name) — the admin Racers tab otherwise shows only the current event's roster.
