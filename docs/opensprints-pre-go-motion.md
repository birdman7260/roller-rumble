# OpenSprints: is there a per-racer motion signal before GO?

Research for [issue #32](https://github.com/birdman7260/roller-rumble/issues/32), which blocks
[#35](https://github.com/birdman7260/roller-rumble/issues/35) (the bike-binding gesture for booth
mode). The question: can the race box tell us **which** roller is spinning **before** a race is
running?

This note supersedes inference in `docs/opensprints-protocol.md` where the two disagree; that file is
a secondhand summary, and the evidence below is firmware source plus a capture off our own box.

---

## Verdict

**No — not on the box we will actually use, and not in the way the design was hoping for.**

Our hardware is Variant B (`basic_msg`, `v` → `basic-1`). Between the `g` (GO) command and the box's
own GO, **it emits nothing at all**: no countdown steps, no false-start message, no per-racer line.
With no race armed it is likewise silent. Variant B has no `FS:` message to decode, so the most
promising pre-GO signal — "the box names the sensor that moved early" — **does not exist on our
hardware**. A "spin your roller to claim your lane" gesture cannot be built on a pre-GO signal from
this box.

It is worse than "no message," which is why no workaround exists: in `basic_msg` every sensor read is
nested inside `if (raceStarted)`, and the sketch uses no interrupts. Outside a race the rollers are
**electrically invisible** — ticks are not counted, not buffered, not recoverable. There is also no
diagnostic or debug command (the command set is exactly `l v g m s`, unknown bytes dropped silently),
which answers #32's "is there an undocumented way in" as a flat no.

**But the gesture is still buildable, via a different mechanism than the one #35 assumed.**

The blocking premise in #35 — "there is no pre-GO motion data" — is true only of the _box's_ GO. It
is false of the _app's_ GO, and those are separate events. Once `g` is sent, the box streams
per-lane cumulative ticks every ~250ms **continuously and unconditionally**, whether or not anyone
is pedaling, until `s` or the finish line. The app already owns the finish line and its own countdown
(ADR 0005, ADR 0010) and treats the box as a dumb tick source. So the app can send `g` **early** —
opening a "claim window" while the race is still un-started from the rider's and the projector's
point of view — and use the live per-lane stream as the binding signal. That is pre-GO in every
sense that matters to the product; it is only post-`g` internally.

Cost of that route: a fixed ~4s dead time after `g` before ticks appear, and two code changes noted
under [What our code does today](#what-our-code-does-today). No firmware change, no new hardware.

---

## Which box we actually have

Variant B, confirmed on the physical unit, not inferred.

| Evidence                                                                                        | Source                                                               |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| FTDI `USB\VID_0403&PID_6001`, presents as COM3, 115200 8N1                                      | `opensprints-capture_2026-07-01_142627.txt:13-20` (hardware capture) |
| `v` → `basic-1`                                                                                 | same capture, `:23` (`[version] basic-1`)                            |
| `l` + two raw bytes: sending 60000 echoed `OK -5536` — the signed-int16 overflow of `basic_msg` | same capture, `:24` (`[setup] OK -5536`)                             |
| "opensprints/basic_msg -> reports version 'basic-1' (**this is our box**)"                      | `tools/opensprints-probe/Probe-OpenSprints.ps1:171`                  |

The capture files are the 2026-07-01 field probe run on the event hardware
(`~/Downloads/opensprints-capture_2026-07-01_140320.txt` and `…_142627.txt`; the first run is the
failed one where `l60000\n` jammed the length parser and nothing streamed). They are not in the repo.

---

## The pre-GO window on our box is provably silent

The probe sends `g` and then reads for five seconds
(`tools/opensprints-probe/Probe-OpenSprints.ps1:255-256`). In that five-second window the capture
contains exactly four progress samples:

```
[countdown] 0: 0
[countdown] 1: 0
[countdown] 2: 0
[countdown] 3: 0
[countdown] t: 0
… t: 251 … t: 502 … t: 753
```

(`opensprints-capture_2026-07-01_142627.txt:148-167`)

Read that carefully: ~4 seconds of the window produced **nothing**, then the stream began at
`t: 0`. So on our box the post-`g` countdown is silent — no `CD:` steps (confirming
`CONTEXT.md:188` and ADR 0010), and critically **no `FS:` and no per-racer line of any kind**. There
is no byte in that window that names a sensor.

Mock mode does not change this. The probe sends `m` then `g` and reads for 10 seconds
(`Probe-OpenSprints.ps1:244-246`); the capture's mock section reaches only `t: 5773`, i.e. ~4.2s of
silence first. `m` makes the box invent ticks, but it still needs `g` and still serves the countdown.

---

## The part that is actually useful: the armed stream is continuous

From the same capture, one single `g` … `s` race streamed unbroken from `t: 0` to `t: 54973` (~55
seconds), a sample every ~251ms — **including the long stretches where the human was standing still
reading a prompt**, and including all-zero samples while nobody pedaled. The stream is not motion-gated.

Per-lane isolation is clean:

| Phase             | Sample at phase end                    |
| ----------------- | -------------------------------------- |
| LEFT bike only    | `0: 189  1: 0  2: 0  3: 0  t: 19329`   |
| then RIGHT only   | `0: 306  1: 223  2: 0  3: 0  t: 37904` |
| then ALL together | `0: 388  1: 591  2: 0  3: 0  t: 54973` |

So the box does answer "which roller is spinning, right now, per lane" — at 250ms granularity, for
as long as you leave it armed. It just refuses to answer until ~4s after `g`.

This is the mechanism the binding gesture should be designed against.

---

## Per-variant answers, from firmware source

All five sketches below were read in full from source. `docs/opensprints-protocol.md` lists three
variants; there are **five**. Two of the extras matter (see [Detection risk](#detection-risk)).

| Sketch                    | `v` reply     | Pre-GO per-racer motion on the wire?                                            |
| ------------------------- | ------------- | ------------------------------------------------------------------------------- |
| **`basic_msg`** (ours)    | `basic-1`     | **None.** Pins are not read outside a race. Countdown silent and blind.         |
| `ss_basic` (+ `ss_kiosk`) | `V:SS_v0.1.7` | **Countdown only** — `FS:<n>` after 4 ticks. Idle blind.                        |
| `advanced_msg`            | _(no `v`)_    | **Yes, fully** — 2 ms per-racer bitmask, streams from power-on, no race gating. |
| `racemonitor` (proto 2.0) | `V:2.0.02`    | **Countdown only** — `F:<n>` after 2 ticks. Idle ticks counted but never sent.  |

### `basic_msg` — our box. No pre-GO signal exists, and none can be obtained.

[Source](https://github.com/opensprints/basic_msg/blob/349c3da3ca90c3d307b3b6a3bff5ec9d5d8defda/basic_msg.ino)
(byte-identical to `firmware/arduino/basic_msg/basic_msg.pde` in `opensprints/opensprints`).

Every sensor read in the sketch is nested inside `if (raceStarted)`:

```c
  if (raceStarted) {
    currentTimeMillis = millis() - raceStartMillis;
    for(int i=0; i<=3; i++)
    {
      if(!mockMode) {
        values[i] = digitalRead(sensorPins[i]);
        if(values[i] == HIGH && previoussensorValues[i] == LOW){
          racerTicks[i]++;
```

There are **no interrupts** in this sketch — polled `digitalRead` is the only sensor path. So with
`raceStarted == false` the rollers are electrically invisible: ticks are not counted, not buffered,
and not recoverable after the fact. This is the firmware-level confirmation of the silent window seen
in our capture.

The `raceStarting` (countdown) block contains **zero `Serial` calls and zero sensor reads** — hence
no `CD:`, no `FS:`, nothing. The GO instant is never announced; a client must infer it from the first
progress block.

The complete emission vocabulary is `OK <ticks>`, `ERROR receiving tick lengths`, `basic-1`, the
250ms progress block (`0: <n>` … `3: <n>`, `t: <ms>`), and `<i>f: <ms>` on finish. There is **no**
false-start message, no countdown message, and no ack for `g`, `m`, or `s`. Command set is exactly
`l v g m s`; unrecognized bytes are dropped with no reply (there is no `else` branch).

**No diagnostic or calibration command exists.** Every branch of `checkSerial()` was read; none
exposes raw sensor state. So option (2) in #32 — "an undocumented command or debug mode" — is
answered: there isn't one.

**Mock mode does not flow pre-GO.** The tick-synthesis branch (`racerTicks[i]+=(i+1);`) sits inside
the same `if (raceStarted)` block, which matches the capture (mock needed `g` and still served the
~4s countdown).

Two firmware bugs worth knowing before building anything on this box:

1. **`s` does not cancel a countdown.** The `s` handler clears `raceStarted` but never
   `raceStarting`, so `g` then `s` still starts the race ~4s later. Directly relevant to aborting a
   claim window. (`ss_basic` fixed this.)
2. `l` requires **exactly** two payload bytes; anything else yields `ERROR receiving tick lengths`
   and the parser then swallows the next `g` — the documented cause of our first failed capture.

One near-miss worth recording so nobody re-discovers it hopefully: `loop()` does call
`printStatusUpdate()` when idle, but that function gates on
`currentTimeMillis - lastUpdateMillis > updateInterval`, and `currentTimeMillis` is only advanced
inside `if (raceStarted)`. At boot both are 0, so nothing prints; after a race both are frozen, so
you get at most one trailing stale block carrying frozen counts. Idle is effectively mute.

### `ss_basic` — has `FS:<n>`, but it is a threshold alarm, not a motion signal

[Source](https://github.com/cwhitney/SilverSprint/blob/689cfdc40ea4ecf46240133469165e8c5a8efa9e/apps/Arduino/ss_basic/ss_basic.ino).
Note this is in `cwhitney/SilverSprint`, **not** the `opensprints` org, and it replies `V:SS_v0.1.7`
— trivially distinguishable from `basic-1`.

`FS:<n>` is real and it does name the sensor, confirming the semantics `docs/opensprints-protocol.md`
inferred. But the source shows it is much weaker than "the box watches individual sensors and tells
us who moved":

```c
    if (raceStarting) {
        for(int i=0; i<MAX_RACERS; i++) {
            values[i] = digitalRead(sensorPins[i]);
            if(racerTicks[i] < FALSE_START_TICKS) {
                if(values[i] == HIGH && previoussensorValues[i] == LOW){
                    racerTicks[i]++;
                    if(racerTicks[i] == FALSE_START_TICKS) {
                        Serial.print("FS:");
                        Serial.println(i, DEC);
```

- `#define FALSE_START_TICKS 4` — four rising edges before anything is emitted.
- Fires **at most once per racer per countdown**, and carries no timestamp and no tick count.
- Pre-GO ticks are **discarded**: `raceStart()` re-zeros `racerTicks[]`.
- Reachable **only** inside the countdown. Idle does not read the sensors at all — same blindness as
  `basic_msg`.

So even on the variant that has it, `FS:` would support "who moved first, roughly, once, during a
4-second window" — usable for a claim gesture, but coarser than the continuous armed stream we
already have. Countdown steps are `CD:3`/`CD:2`/`CD:1`/`CD:0` (counter starts at 4, first emitted
value is 3, `CD:0` is GO), and `R:` progress runs at `updateInterval = 10` ms.

Client-side corroboration: SilverSprint's own app parses `FS` and then **does nothing with it** —
the state transitions are commented out in
[`SerialReader.cpp`](https://github.com/cwhitney/SilverSprint/blob/689cfdc40ea4ecf46240133469165e8c5a8efa9e/apps/Silversprints/src/data/SerialReader.cpp).
We are not alone in treating false starts as cosmetic.

`ss_kiosk` (branches `develop` / `kiosk`) is `SS_v0.1.4_kiosk`: same `FS:`/`CD:` structure, but only
**3 racers** — sensor pin 5 is repurposed as a physical STOP button — and it adds `G:` / `S:` lines
emitted unconditionally in `loop()`. Those are _button_ events, not sensor events, so they are not a
pre-GO motion signal; they are, however, the only messages in the whole corpus that any variant emits
outside a race state besides `advanced_msg`'s stream.

### `advanced_msg` — the only true continuous pre-GO motion stream

[Source](https://github.com/opensprints/opensprints/blob/6006807937ced7627e3c019e06d2b441aa668b6c/firmware/arduino/advanced_msg/advanced_msg.pde).

This variant answers #32's question with an unqualified yes, because **it has no concept of race
state at all**. `raceStarted` and `raceStarting` are declared on lines 41–42 and never assigned or
read anywhere in the file. Transmission is armed from boot (`boolean sendRacePacketNow = true;`), the
pin-change and 2 ms timer ISRs are both started in `setup()`, and `loop()` transmits with no gating
condition. `g` merely re-bases the millisecond clock and flushes buffers.

Frame encoding, correcting `docs/opensprints-protocol.md`'s description slightly: each frame char is
`'a' + bitmask` (`'a'`..`'p'`), bit 0 = racer 1 … bit 3 = racer 4, **one frame per 2 ms**
(`OCR2A = 0xFA`, /128 prescaler). `RACE_PACKET_UTIL_SIZE 54` ⇒ ~52 frames ⇒ a packet roughly every
~104 ms. Our decoder's `charCodeAt(0) - 97` and 4-bit mask handling
(`opensprints-protocol.ts:264-275`) is therefore correct.

There is **no `v` command**, so this variant cannot be version-probed — which is exactly why our
adapter requires `ROLLER_RUMBLE_SENSOR_PROTOCOL` to select it. Mock mode is a no-op (`mockMode` is
set but never read). It has no countdown and no finish detection; all race logic lives in the client.
It is also visibly unfinished — `char n = 0; sprintf(&n,"%c", m);` writes a char _plus a NUL_ into a
one-byte stack variable, which is undefined behavior that works only by luck of stack layout.

### `racemonitor` (protocol 2.0) — not in our docs, and it counts idle ticks but never sends them

[Firmware](https://github.com/opensprints/opensprints-comm/blob/5cb63bb8bb9ce9894bd650031f5395f124991ed4/arduino/racemonitor/racemonitor.pde),
[protocol spec](https://github.com/opensprints/opensprints-comm/blob/5cb63bb8bb9ce9894bd650031f5395f124991ed4/README.markdown).
This is the official successor `basic_msg`'s own README points to, and it is the only variant with a
real written protocol document.

Commands are framed `!<cmd>[:<payload>]\r\n`, not bare bytes. Version is `V:2.0.02`. False start is
spelled **`F:<n>`, not `FS:<n>`**, and triggers at `FALSE_START_TICKS 2`. It uniquely reports
reaction time (`RT:<n>:<ms>`). Progress is the `basic_msg`-style multi-line block at 50 ms.

Its pin-change ISR is armed in `setup()` and does count ticks in idle — but `doStateIdle()` is a pure
command dispatcher that reports nothing, and `switchToState(STATE_COUNTDOWN)` zeroes the counters. So
idle motion accumulates in RAM and is then thrown away. Not observable, therefore not usable.

### Detection risk

Our variant detection was written against three sketches and would mishandle two of the five:

- A `racemonitor` box replies `V:2.0.02`, which `parseOpenSprintsLine` accepts as a `version` and
  `createOpenSprintsDecoder` therefore labels `ss-basic` (`opensprints-protocol.ts:320-326`). We would
  then send `d\n`, `l1000000\n`, `g\n` as bare bytes, which that firmware NACKs because it wants
  `!g\r\n`. Its `F:<n>` would also go undecoded (we only match `FS`).
- An `ss_kiosk` box has only 3 usable sensors, and its unsolicited `G:`/`S:` button lines decode to
  nothing.

Neither is our box, so neither is urgent — but if a spare unit ever appears, probe it before trusting
the arm sequence.

---

## What our code does today

Answering #32's sub-question 5, plus two concrete blockers for booth mode.

**`FS:` is parsed but deliberately thrown away.** `parseOpenSprintsLine` decodes `FS:<n>` into
`{ type: "falseStart", sensorIndex }` (`apps/desktop/src/backend/adapters/opensprints-protocol.ts:69-72`),
and `OpenSprintsSession.handleMessage` lists `falseStart` among the message types it explicitly
ignores (`apps/desktop/src/backend/adapters/opensprints-session.ts:110-117`), per ADR 0005's
dumb-sensor decision. `opensprints-session.test.ts:118-129` asserts the discard. So the plumbing to
surface it exists and is one case-arm away from working — but on Variant B there is nothing to
surface, which makes this moot for our hardware.

**Blocker 1 — the box is left un-armed while idle.** `g` is sent only from `armCountdown`, and `s` on
`endRace` (`apps/desktop/src/backend/adapters/opensprints-sensor.ts:301-325`). Outside a race the box
is silent by construction, so today there is no idle tick stream to bind against even though the
hardware can provide one. A claim window needs a way to arm the box without starting a race.

**Blocker 2 — any progress message is currently read as GO.** `handleMessage`'s `progress` case calls
`emitGo()` before handling ticks (`opensprints-session.ts:103-108`), on the reasoning that progress
only streams after the box's countdown. Under a claim window that inference becomes wrong: the first
claim tick would fire a spurious `go` lifecycle event and start the race. The session needs an
explicit mode where ticks flow without implying GO.

Neither blocker is in the transport: `handleChunk` decodes continuously whenever the port is open
(`opensprints-sensor.ts:594-601`), so pre-race bytes would already reach the session if the box sent
any.

---

## What this means for #35

- **Rule out** any design that depends on the box reporting an early tick or a false start. On
  Variant B that signal does not exist, and #35's "bind during the countdown" option as written
  (bind inside the box's own countdown window) is dead — that window is silent.
- **Viable, and better than the options listed in #35:** an app-owned **claim window**. Arm the box
  (`g`), wait out its ~4s silence, then open a visible "spin to claim" phase driven by the live
  per-lane stream. First lane to accumulate ticks past a small threshold claims the rider. Then run
  the app's own countdown and GO without ever sending a second `g`, since the box is already
  streaming. This gets #35's "closest to trivial, self-evident to the crowd" property without
  needing any pre-`g` signal.
- **Thresholds matter more than latency.** A bystander idly spinning a roller is a real hazard at a
  market (#35 flags this for solo). 250ms granularity is plenty for a deliberate spin gesture, but
  the claim rule should want several consecutive non-zero samples, not one tick.
- The ~4s arm dead-time is the one new operational cost, and it is hideable inside whatever the
  rider is doing before the claim prompt appears.
- Any of this likely amends ADR 0005, which currently frames `g` as strictly "make the box stream
  for this race."

---

## Unverified / open

Things this note does **not** establish, kept explicit so nobody promotes them to fact:

- **Nobody pedaled during the box's countdown in the 2026-07-01 capture.** That "a false start emits
  nothing on our box" is verified from `basic_msg` source (the countdown block has no sensor reads at
  all), but it has not been reproduced in the field. Cheap to confirm: arm the box, spin a roller
  during the silence, watch for any byte.
- **The claim-window design is untested on hardware.** Specifically unknown: whether the box behaves
  if left armed for minutes rather than seconds, and how a claim window is safely aborted given
  `basic_msg`'s `s`-doesn't-cancel-`raceStarting` bug — during the first ~4s after `g`, `s` will not
  stop the race from starting.
- **Stream duration is only proven to ~55s** (`t: 54973`, the length of the probe run). Nothing in the
  firmware suggests a limit below the int16 tick length we already set, but longer runs are unproven.
- **We cannot tell which `basic_msg` build is flashed.** The firmware answers a bare `basic-1` with no
  finer version, so a fork or local patch on our unit would be invisible from the wire. The behavior
  above matches the canonical blob and our capture matches it, which is as far as the evidence goes.
- **Reflashing feasibility was not assessed.** `ss_basic` or `advanced_msg` would both provide a
  genuine pre-GO signal, and patching `basic_msg` to move its `digitalRead` loop outside
  `if (raceStarted)` is a small change — but whether we can or should reflash the event hardware
  before First Fridays is a separate call, and every option changes the wire protocol our adapter
  speaks.
- **The `racemonitor` / `ss_kiosk` detection risks are reasoned from source, not observed.** No such
  box has been in our hands.
- `docs/opensprints-protocol.md` has not been amended to add the two newly-found variants or to
  correct its three-variant framing; that is a follow-up, not part of this research.
