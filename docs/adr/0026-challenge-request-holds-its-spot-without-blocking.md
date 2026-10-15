# A challenge request holds its queue spot without blocking the races behind it

With the `challengeRequiresAcceptance` setting on, a racer's challenge is sent as a `challenge
request`: it claims its spot in the `Queue` at signup, by the usual queuing rules, but it can only be
raced once the challenged racer accepts. That leaves a question for the case where the request
reaches the front before anyone answers. We hold the request at its spot and **skip it** when staging,
so ready races behind it keep running. The request moves up as races go and stages as soon as it is
accepted. The pending answer is a flag on the challenged racer's `queue occurrence`, and the projected
entry carries `awaitingRacerId`. `isQueueEntryReady` treats an awaiting entry as not ready, the same
way it already treats an unpaired `auto-match` spot.

## Considered options

- **Hold the spot and skip it (chosen)** vs. **block the queue until answered.** Blocking is simpler to
  explain, but one phone left in a pocket would stall the whole event until the host stepped in.
  Skipping reuses the readiness rule that unpaired auto-match spots already follow, so nothing in
  staging, auto-stage, or the snapshot's `nextQueueEntry` needed special handling.
- **Resolve a decline by prior intent (chosen)** vs. **always keep the challenger queued.** A decline
  resolves both racers the way a `challenge abandonment` resolves a stranded partner (ADR 0015). A spot
  the challenge created is removed, and a spot it upgraded falls back to its prior intent. A challenger
  who only ever wanted that race does not end up in an auto-match they never asked for.
- **Flag on the occurrence (chosen)** vs. **a separate requests table.** The request already is the
  challenge's lock group. One boolean on the challenged racer's occurrence travels through the queue
  module's existing projection and abandonment logic, and the projected entry's `awaitingRacerId`
  gives every surface what it needs.

## Consequences

- The racer page opens an Accept/Decline modal straight from the snapshot whenever a queued entry is
  awaiting the signed-in racer. A push (`challenge_request`) reaches a phone that isn't open. The
  generic notification modal skips that type so the two never double up.
- Answering, or the request going away (the challenger leaves or replaces it, or the host removes it),
  replaces the request on the challenged racer's channel with a silent `challenge_closed` (ADR 0013). A
  level-triggered reconciler catches the paths that don't answer it explicitly.
- Queue timing labels and the projector ticker don't count an awaiting entry as a race ahead, and
  queue-status notifications never tell its racers they're up.
- Turning the setting off affects only new challenges. Requests already pending stay pending until they
  are answered or removed.
- Leaving a request, or giving up its spot to send a challenge of your own, counts as declining it.
  The challenger is always told, and never ends up in an auto-match they didn't choose.
- A request that upgrades the challenged racer's existing spot takes that spot over while it is
  pending. That spot is skipped like the request until they answer, and a decline restores it.
- The host's own match composition at the admin desk never sends a request.
