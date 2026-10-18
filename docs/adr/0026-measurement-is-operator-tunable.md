# Everything that measures a rider is an operator-tunable managed setting

**Status:** accepted — amends [ADR 0004](./0004-managed-settings-write-back.md), [ADR 0005](./0005-opensprints-as-dumb-sensor.md), and [ADR 0010](./0010-os2l-cue-owns-countdown.md)

Before the first field test on the real bikes we suspected the measurement was off but couldn't say where. The candidate causes were all fixed in code: the per-tick distance, the lane map, the box countdown, how speed was derived from 250ms samples, and how a finish was timed. Dialing any of them in meant a code change and a rebuild at the venue. We decided every knob that affects how a rider is measured becomes a **managed setting**, shown beside a live **sensor monitor** in **Settings → Bike sensor & measurement**, and applied on the next race without a restart.

The new knobs are: per-port distance per tick, a plausible-speed ceiling, the speed smoothing window, finish-time interpolation, the wattage model, and raw sensor logging. Two former advanced settings are promoted: the default countdown length and the trailing rider's finish budget. The countdown length matters because the pre-roll only has room when it outlasts the box countdown, so a slow box can't be lined up without it. The box countdown is now read at each countdown's start. We chose a wide, honest settings surface over a small one because, until the hardware is confirmed, the operator at the bikes is the only one who can tell which number is wrong. Every default keeps the measurement physically correct, so an untouched install needs none of them.

## Consequences

- **ADR 0004**: the managed set is no longer "deliberately small". The sensor group is large, but it lives in its own card rather than the general Managed settings list.
- **ADR 0005**: the adapter still owns no race logic. It may now alter a tick delta in one case: when the operator sets a speed ceiling, an implausible jump (a bouncing reed switch) is clamped and logged. With no ceiling set (the default), deltas pass through raw. Rotation events now also carry their port's meters per tick.
- **ADR 0010**: the box countdown is still silent and can't be mirrored live, but it can be **measured after the fact**: GO sent → first sample, minus that sample's own elapsed time. The monitor shows that measurement, plus how far the box's start landed from the app's GO, so the setting is tuned from data instead of by ear.
- Operator procedure: `docs/sensor-calibration.md`.
