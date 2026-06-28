# OpenSprints hardware — serial protocol reference

The race box is **OpenSprints** hardware: an Arduino behind a USB-to-serial chip
(appears as a **COM port** on Windows). Each bike's roller has a reed switch wired
to the box via an RJ45 ("ethernet") cable. One sensor pulse = one **tick** = one
roller revolution. The box supports up to **4 racers** (sensor pins 2–5 → racer
index 0–3); Roller Rumble uses 2 (left/right).

This is **not** something we had to reverse-engineer — OpenSprints and its successor
SilverSprint are open source. Sources:

- `github.com/opensprints/opensprints` — `firmware/arduino/{basic_msg,advanced_msg}`
- `github.com/cwhitney/SilverSprint` — `apps/Arduino/ss_basic/ss_basic.ino` (firmware),
  `apps/SilverSprints/src/data/SerialReader.cpp` (host parser)

**Serial settings (all variants):** `115200` baud, 8N1. Host→device commands are
single ASCII letters; many variants want a trailing `\n`. The device is
**self-identifying** — send `v` and it returns its firmware string, which tells you
exactly which variant below you're talking to.

## Variant A — SilverSprint `ss_basic` (newest, most likely)

Lines are `\r\n`-terminated, `KEY:value` format.

**Host → device**
| Send | Meaning |
| ------------ | ---------------------------------------------- |
| `v\n` | Query version → replies `V:SS_v0.1.7` |
| `l<n>\n` | Set race length to `<n>` ticks → replies `L:<n>` |
| `t<secs>\n` | Set time-based race duration in seconds |
| `d\n` / `x\n`| Race type distance / time |
| `g\n` | GO — resets ticks, runs 4-2-1 countdown, then streams |
| `s\n` | STOP |
| `m\n` | Toggle mock mode → replies `M:ON` / `M:OFF` |

**Device → host**
| Receive | Meaning |
| -------------------------- | ---------------------------------------------------- |
| `V:<ver>` | Firmware version |
| `CD:3` `CD:2` `CD:1` `CD:0`| Countdown ticks (after `g`, one per second) |
| `R:<t0>,<t1>,<t2>,<t3>,<ms>` | **Race progress** — cumulative tick count per racer + elapsed millis. Streamed only while a race is running, ~every 10ms |
| `0F:<ms>` … `3F:<ms>` | Racer N finished at `<ms>` (distance race hit length) |
| `FS:<n>` | False start by racer `<n>` |

Key fact: **`R:` only streams after `g` + countdown.** Ticks reset to 0 at race
start, so per-sample `deltaRotations` = `t_now − t_prev`.

## Variant B — original `basic_msg`

Version reply: `basic-1`. Length set via `l` + two raw bytes (little-endian) + `\r`.
Progress is **not** `R:`-framed; each racer prints its own line every 250ms:
`0: <ticks>` / `1: <ticks>` / … then `t: <millis>`. Finish: `0f: <millis>`.
Commands: `l` `v` `g` `m` `s`.

## Variant C — `advanced_msg`

Binary-ish packet: `!<elapsedMillis>@<frame chars>#`, where each frame char encodes a
4-bit racer-tick bitmask offset by `'a'` (one char per 2ms frame). Commands `g`/`m`/`s`.
Least likely to be in the field; listed for completeness.

## Implementation status

All three variants are decoded. `createOpenSprintsDecoder` (`opensprints-protocol.ts`) frames
the stream itself — CR/LF lines and `!…#` packets can't collide — so it auto-detects A vs B vs C
and normalizes every variant to the same cumulative-tick `OpenSprintsMessage`. Variant detection
comes from the `v` reply (`V:…` → A, `basic-1` → B); Variant C can't self-identify, so it must be
selected via the `ROLLER_RUMBLE_SENSOR_PROTOCOL` managed setting. Arm/stop byte sequences differ
per variant (`buildArmCommands`): A uses a decimal length, B a 2-byte binary length, C none.

## Calibration note

Roller Rumble's `applyRotationSample` multiplies `deltaRotations` by
`DEFAULT_WHEEL_CIRCUMFERENCE_METERS`. For OpenSprints that constant must be the
**roller rollout** (distance the bike travels per one roller revolution), not a bike
wheel circumference. SilverSprint's mock assumed a 114.3mm-diameter roller
(≈0.359 m circumference) but the real value depends on this specific hardware and
must be measured/calibrated, or race distances and speeds will be wrong.
