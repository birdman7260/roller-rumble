# Lane leading-edge glow is a renderer-derived, relative, one-sided signal

## Status

accepted

## Context & decision

The projector race display drives a `leading-edge glow` on each lane (a comet at the rider marker). We decided the glow encodes a **relative, instantaneous** speed signal, not absolute speed: `Rivalry glow` (this rider's speed minus the opponent's, the default) and `Surge glow` (this rider's own acceleration, the solo fallback), operator-switchable live via a `glow mode` admin setting. The signal is computed **in the renderer** from the existing snapshot metrics stream — lightly smoothed (~1.2s) and decayed to zero when ticks stop — rather than added to the backend `RaceMetricsSnapshot`. The mapping is **one-sided**: only the ahead/accelerating lane lights; tied, trailing, slowing, and stopped all read dark.

## Considered options

- **Absolute speed scale** (brightness ∝ current km/h). Rejected: a steady strong rider just stays bright; the operator wanted the light to track who's _winning the moment_. Absolute speed is instead delegated to the `speed streaks` companion cue.
- **Cruising-pace baseline for Surge** (above your rolling average) vs. acceleration. Chose acceleration deliberately — the light rewards _changes_ in effort.
- **Computing the glow in the backend** as a metrics field. Rejected: the glow is presentational and mode-switchable, `metrics.ts` is pure telemetry, and the renderer already receives everything it needs at ~4Hz. Keeping it renderer-side avoids leaking a display concern into the snapshot and avoids a backend decay ticker.

## Consequences

- Under `Surge glow`, a lane held at a steady hard effort reads **dark** — only the upswing of a surge lights it. This is intended, not a bug.
- The renderer must locally smooth and **decay** speed toward zero when no ticks arrive, because `currentSpeedKph` freezes (it is recomputed only on a tick) rather than falling when a racer coasts or stops.
- `Rivalry glow` requires an opponent, so solo races silently fall back to `Surge glow`.
- Calibration constants (smoothing window, fade-to-dark time, the difference that maps to full glow) live in one renderer-side place and are tuned against the real projector.
- Companion cues (`lead-change flash`, `top-speed flare`, `speed streaks`) are built on the same renderer-side smoothed-speed foundation; the glow PR establishes that seam first.
