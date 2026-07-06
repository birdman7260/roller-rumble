# The OS2L cue owns the countdown; the box's silent countdown is its tail

**Status:** accepted — amends the countdown-ownership consequence of [ADR 0005](./0005-opensprints-as-dumb-sensor.md)

ADR 0005 let the OpenSprints box own the countdown on the USB path and recorded that "the app's configurable countdown duration is therefore overridden by the box's fixed 3‑2‑1‑GO." That broke a feature the app already had: a VirtualDJ **OS2L cue** carries a `countdownMs` so a DJ can start the countdown on a musical moment and have the race **GO** land on a specific beat. Deferring to the box's fixed countdown discarded the cue's duration. Field notes also showed the real `basic_msg` box runs a **silent** ~4‑second countdown after `g` — it emits no `CD:` steps, it just goes quiet and then streams — so the app cannot mirror the box's cadence even in principle, and a no-time cue's 3‑second default visibly hit zero ~1s _before_ the box actually went.

We decided the **app owns the visible countdown** for the cue-specified duration `N` (default `4000ms`, chosen to match the box's nominal silent countdown). The app runs the whole `N`-second countdown itself and **delays the GO command** (`g`) until `T0 + (N − BOX_COUNTDOWN_MS)`, so the box's stream begins at the countdown's zero. **GO fires on the app clock at `N` (music-locked)**, not on the box's first tick — the moment the DJ picked, welded to the music rather than to a silent box's timing. Ticks that arrive before `N` are discarded naturally: the session's per-lane tick baseline advances even while `ActiveRace` is null, so counting starts clean at `N` from the box's current cumulative count with no head-start jump — which makes the design robust whether `BOX_COUNTDOWN_MS` slightly over- or under-estimates the real box. `BOX_COUNTDOWN_MS` is a tunable constant (an advanced setting) because a silent box can't be measured closed-loop. When `N < BOX_COUNTDOWN_MS`, the pre-roll clamps to zero (send `g` immediately) and the box simply streams a beat late — the unavoidable hardware floor.

We chose this over keeping the box as countdown owner because the cue's musical timing is the whole point of the OS2L integration, and the box gives us no way to honor it (fixed duration, silent, no configurable countdown command). The rejected alternative — activate on the box's first tick — keeps GO at the mercy of the box's silent timing, reintroducing the dead-air between the displayed zero and the real GO.

## Consequences

- The default countdown rises from **3s to 4s** globally (shared `COUNTDOWN_DURATION_MS`), so a no-time cue, the manual Start, and the simulator all count the same 4s that matches the box's nominal countdown.
- The box's fixed countdown no longer overrides the cue; the ADR 0005 consequence to that effect is superseded by this ADR.
- The simulator path is unchanged in shape (it owns its own `N`-second countdown; there is no `g` to delay).
- `BOX_COUNTDOWN_MS` is a new advanced setting; a differently-timed box is tuned by hand rather than measured.
