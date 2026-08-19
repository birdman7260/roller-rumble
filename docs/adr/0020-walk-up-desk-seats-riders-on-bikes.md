# The walk-up host composes each race by seating riders on the two bikes

**Status:** accepted — resolves [issue #36](https://github.com/birdman7260/roller-rumble/issues/36) on the [walk-up event map (#30)](https://github.com/birdman7260/roller-rumble/issues/30). Builds on [ADR 0018](0018-event-kind-and-derived-capabilities.md) (`event kind`) and [ADR 0019](0019-host-assigned-lane-swap.md) (`lane swap`).

At a `walk-up event` the operator has to get from "a stranger walks up" to "the race is running", over and over, all evening, with no `Queue` to mediate. Today that takes two tabs per race: the Racers tab creates the racer and queues them, the Race Desk holds the distance, the queue and the staged race. Two tabs per race is the friction this ticket exists to remove.

We decided the host composes each race on a purpose-built **`walk-up desk`** whose surface is the two bikes, rendered as **`bike seat`s** side by side — left where the left bike physically is. The host seats each rider on the bike they actually got on. An empty seat opens one field scoped to that bike, which finds a returning rider or creates a new one from a name alone. A race is solo when one seat is left empty; solo is never declared. GO is a single full-width control beneath the seats.

The load-bearing consequence: **seating is the binding.** Because the host puts a named rider on a named bike as the act of composing the race, the `lane swap` from ADR 0019 stops being a step in every race and becomes a repair for when the riders swapped after being seated. It is not removed — the host can still be wrong, and a missed swap still crowns the wrong winner on a public screen — but it is no longer something they must remember to check each time.

## Considered Options

Three surfaces were built and clicked through rather than argued about, on branch `prototype/walk-up-composition-loop` (`/walk-up-lab`). Each carried the loop through countdown, race, results and back, and each counted the taps and typed characters a race cost the operator.

**How the host composes a race**

- **Two `bike seat`s (chosen).** The surface is a picture of the room, so what the app believes is checkable against what the operator can see without reading a lineup. It is the only option where the seating gesture and the bike binding are the same act. Its cost is the extra tap: an empty seat takes two taps (open the picker, pick) where a roster takes one.
- **A command line (rejected).** One always-focused field: type a name and press Enter to seat, Enter on an empty field to race, Backspace to un-stage. Genuinely the fewest keystrokes for a new arrival, and the whole loop lives in one control. Rejected because a permanently focused field makes every bare-letter shortcut unreachable — `isShortcutKeystroke` correctly refuses `S` while the host is typing, so the `lane swap` can only ever be a button — and because the two bikes degrade into a status line the operator has to read rather than a thing they can point at.
- **Tonight's roster of chips (rejected).** Everyone who has ridden, most recent first; one tap seats, one tap un-seats, typing only for someone new. The cheapest possible returning rider (1 tap, 0 characters against the seats' 1 tap and a partial name), and the case a market stall generates all evening. Rejected because the bikes are reduced to two letters on a chip, which is the one thing the operator most needs to get right, and because the whole roster goes inert the moment both bikes are full.

**How a rider is entered**

- **One find-or-create field per seat (chosen).** A name alone gets someone racing, per the map. The field matches partial names against tonight's riders so a returning rider is never retyped, with an explicit "add as someone new" for a real collision.
- **The existing three-field Quick Add (rejected).** Email and phone are optional and addable at any time — including while the rider is pedaling — so making them part of composing a race inverts the map's entry rule. Where the host captures them is [#39](https://github.com/birdman7260/roller-rumble/issues/39)'s question, not this one.

**Solo versus head-to-head**

- **Inferred from how many seats are taken (chosen).** With the bikes on screen the declaration is already visible, so a declaring step would be a tap that changes nothing. This also matches ADR 0019, which made solo a presentation concern derived from participant count rather than a lane id.
- **Declared explicitly (rejected).** Today's `Add To Queue` and `Solo Run` are separate actions producing different `intent`s; at a walk-up event there is no `intent` to carry, because there is no `Queue`.

## Consequences

- **The `lane swap` survives as a repair, not a routine.** ADR 0019 is unchanged and still applies to every `event kind`; what changes is that a walk-up host is not expected to reach for it every race. On the `walk-up desk` the lone rider's move is offered on their seat (using the existing `describeLaneSwap` wording), and a head-to-head swap belongs to the race rather than to either seat — one control, because a swap moves everyone.
- **Solo is one empty seat.** No mode, no toggle, nothing to reset between races. This is only coherent because ADR 0019 already put a solo racer on a real `left`/`right` lane.
- **Back-to-back is one tap.** Results land in the seats. A per-bike "Race Again" keeps that rider on for another go, so winner-stays-on costs one tap and a full turnover costs one. Nothing carries between races except what is visibly still in a seat — there is no state the operator has to remember.
- **The trigger is manual, confirmed rather than assumed.** The prototype ran both. Under an `OS2L cue` the host only arms the race and the DJ supplies GO, which is wrong for a stall where the operator is the one talking to the rider. The cue path stays available and has one property worth remembering if it is ever wanted: arming is not the countdown, so it leaves the `lane swap` window open _longer_ than the manual path does.
- **This adds one `event capability`, not a branch.** Per ADR 0018 every downstream ticket contributes a field to the manifest rather than an `if`: this one is `hostComposesRaces`. A `standard` event answers false and keeps the Race Desk and its `Queue`; a `walk-up event` answers true and gets the desk.
- **Where the desk sits in the admin window is deliberately not settled here.** This ADR fixes the composition surface and its gesture. Whether the walk-up tab set replaces the standard one, supplements it, or the rail goes away entirely is [#42](https://github.com/birdman7260/roller-rumble/issues/42)'s question, which this ticket unblocks.
- **No production code ships with this decision.** The desk cannot be built until ADR 0018's `kind` column and capability manifest exist, which are still an ADR only. The three variants stay on branch `prototype/walk-up-composition-loop` as the primary source; `main` keeps this decision.
- **A partial-match entry field is not optional.** The prototype's first pass seated a returning rider only on an exact full-name match, so typing "Mar" silently created a second Marisol Vega and filed her as a first-time rider. At a stall that corrupts the top-racers board ([#34](https://github.com/birdman7260/roller-rumble/issues/34)) and the lead export ([#40](https://github.com/birdman7260/roller-rumble/issues/40)) quietly, in the middle of the evening, with nobody watching.
