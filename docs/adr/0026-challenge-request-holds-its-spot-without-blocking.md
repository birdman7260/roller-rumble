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
- **Drop the challenger on a decline (chosen)** vs. **resolve both racers by prior intent** vs.
  **always keep the challenger queued.** A declined request leaves the queue with the challenger's
  spot, even when the challenge upgraded a spot they already had. That spot was spent on a race that
  isn't happening, and letting it fall back to a solo run or auto-match would hand the challenger a
  race they didn't ask for at the front of the line. The challenged racer never asked for any of it,
  so their side resolves the way a `challenge abandonment` resolves a stranded partner (ADR 0015): a
  spot the challenge created is removed, and a spot it upgraded falls back to its prior intent.
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
- A racer with a request waiting on them must answer it before they can join the queue, queue a solo
  run, or challenge anyone. The racer page's modal already asks for that answer, and the self-service
  signup endpoint refuses (`challenge_answer_required`) so a request is never left hanging while its
  racer carries on without it. This also means a racer cannot give up a request's spot to send a
  challenge of their own. The queue module still resolves that case as a decline if it ever happens.
- Leaving a request counts as declining it. The challenger is always told that their challenge is off
  the queue, and never ends up in an auto-match they didn't choose.
- A request that upgrades the challenged racer's existing spot takes that spot over while it is
  pending. That spot is skipped like the request until they answer, and a decline restores it.
- The host's own match composition at the admin desk never sends a request.
