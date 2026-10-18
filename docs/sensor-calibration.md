# Dialing in the bike sensors

Use this when you're at the real bikes and the race numbers look wrong, or before the first event on
new hardware. Everything lives in the admin's **Bike Sensor** tab. The **Bike sensor &
measurement** panel has a live readout of what the race box is sending, a **Start sensor test**
button, and every setting that affects how riders are measured. Beside it, the **Live log** panel
shows the app log as it's written. Tick **Only sensor lines** to see just the box. **Clear log**
gives you a clean start before each check.

Every setting saves straight away and applies to the **next** race or test, with three exceptions.
**Bike sensor** (Simulator vs OpenSprints) needs a full quit and reopen. **Sensor serial port** and
**Sensor protocol** apply the next time the box connects: unplug its USB and plug it back in.

How measuring works, in one line: the box counts one **tick** per roller revolution per sensor
**port**, reports the running totals every ~250 ms, and the app multiplies ticks by **distance per
tick** to get distance. Speed, top speed, finish times, and watts all come from that.

## Work through these in order

Each step depends on the one before it. Don't tune speed until the distance is right.

### 1. Get the box connected

1. Set **Bike sensor** to **OpenSprints USB box**, then quit and reopen the app.
2. The **Status** card's _Bike sensor_ row should go **Ready** and read `Connected to COM3 (basic-1)`
   or similar. The monitor's **Firmware** should say `basic`.

| Symptom                                   | Fix                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| "No race box found yet — still searching" | Check the USB cable and the FTDI driver. Close any other app that has the port open (another Roller Rumble, Arduino IDE, a serial monitor). |
| Binds to the wrong device                 | Set **Sensor serial port** to the box's port (`COM3`, `/dev/tty.usbserial-…`), then unplug and replug the box.                              |
| Connected, but **Firmware** isn't `basic` | Our box is `basic-1`. Set **Sensor protocol** to **OpenSprints basic**, then unplug and replug the box.                                     |

### 2. Check each bike lands on the right lane

1. Click **Start sensor test**. Within ~4 s **Stream** should read **Receiving** and **Samples**
   should climb. **Sample interval** should hold at about 250 ms.
2. Spin the **left** bike only. Its row's **Ticks** should climb, and only that row. Then do the
   right bike.
3. If the wrong row moves, fix **Sensor lane map**: the lanes go in port order, so `right,left` swaps
   them. If no row moves, look in **Raw lines from the box**. Lines like `0: 12` mean the box is
   counting. Lines stuck at `0: 0` while you pedal mean a sensor, magnet, or RJ45 cable problem, not
   a software one.

A flipped lane map crowns the wrong winner. Always do this step after re-cabling.

### 3. Check one revolution is one tick

With the sensor test running, mark the roller with tape. Turn it by hand exactly **10 times** slowly
and watch **Ticks**: it should go up by exactly **10**.

- **20** means two magnets (or a double-triggering switch). Halve that port's distance per tick, or
  remove a magnet.
- **Fewer than 10** means the magnet sits too far from the reed switch. Move it closer, then repeat.
- **Different counts on each bike** means you fix each port separately with **Per-port distance per
  tick** (step 4).

### 4. Set the distance per tick

Measure the roller's **diameter** (the one the tire sits on, not the end caps). Then:

```text
distance per tick (m) = π × diameter (m) ÷ magnets on the roller
4.5 in roller, 1 magnet: π × 0.1143 ÷ 1 = 0.3591   (the default)
```

Enter it in **Distance per sensor tick**. If one bike differs, leave that field as the common value
and put the odd one in **Per-port distance per tick** in port order (`,0.1795` changes port 1 only).
Check the **m / tick** column in the monitor shows what you expect for every port.

**Check it:** the monitor's **Distance** column is `ticks × m/tick`. A bike computer on the rear
wheel should agree with it after a long spin. A gap of more than a few percent means the diameter is
wrong (or the tire is slipping on the roller).

### 5. Line up the box's start with the on-screen GO

The box stays silent for a fixed stretch after the app sends it GO, then starts counting. The app
sends GO early by **Race box countdown** so the box starts counting right as the projector hits zero.
The app can only send GO early inside the on-screen countdown. If **Race countdown length** is not
longer than the box's countdown, GO goes out at the very start and a slow box can only start late.

1. After a sensor test starts streaming, read **Box countdown (measured)**. Copy that number into
   **Race box countdown (ms)**.
2. Set **Race countdown length** at least 500 ms longer than that. 5000 is a good starting point.
3. Run a real race, then read **Box start vs GO (last race)**:
   - **Within ±100 ms**: good.
   - **"… ms late"**: the riders' first strokes weren't counted and their times include dead time.
     Raise **Race box countdown** by that much. Raise **Race countdown length** too if it is no
     longer the bigger of the two.
   - **"… ms early"**: strokes during the last moments of the countdown are thrown away. Lower it
     by that much.

### 6. Make speed readable

The box only reports every 250 ms, so one tick more or less in a sample swings speed by about 5 km/h.
**Speed smoothing window** averages over a longer stretch: 1000 ms (the default) gives about 1.3 km/h
steps with about half a second of lag. Raise it if speeds still jitter. Lower it if the speed lags
too far behind the rider. `0` shows raw per-sample speed, which inflates **top speed**.

### 7. Rule out a bouncing sensor

Watch the **Fastest sample** column while someone rides flat out. A single sample runs a few km/h
above the smoothed **Speed** at the rider's peak, because of that 5 km/h step. If it spikes far above
anything a person could do, the switch is double-counting:

1. Fix it at the hardware first: check the magnet gap and look for a loose RJ45 cable.
2. As a safety net, set **Plausible speed ceiling** well above the fastest real rider you saw (roller
   sprints can pass 80 km/h). During a race, any sample over it is cut down to the ceiling and logged
   as `[sensor] port N jumped …`. The **Over ceiling** column counts samples over it.

### 8. Finishes, the trailing rider, and watts

- **Finish-time interpolation** (on by default) works out when each rider actually reached the line
  inside the last 250 ms sample. Turn it off only to compare against the old behavior. With it off,
  times snap to samples, and a same-sample tie goes to port 0.
- **Trailing rider's finish budget** sets how long the second rider gets to finish after the winner
  crosses. It's a percentage of the winner's time, and always at least 5 more seconds.
- **Wattage estimate** is a rough curve from speed (`base, linear, cubic`), not a power meter.
  Change it only if you want the watts to match some other reference.

## When you need help

Turn **Log raw sensor data** on to see every line the box sends in the **Live log**. To hand it to
someone else, **Clear log**, reproduce the problem, then **straight away** use **Settings →
Diagnostics → Save diagnostics bundle**. The bundle holds the most recent log lines, which with raw logging on is
only about the last 40 seconds of box data, plus the monitor's last readout. Turn raw logging off
afterwards.

## Done checklist

- [ ] Status says Ready, firmware `basic`
- [ ] Left spin moves only the left row, right spin moves only the right row
- [ ] 10 hand turns = 10 ticks on every port
- [ ] **m / tick** matches the measured roller on every port
- [ ] Box start vs GO is within ±100 ms after a real race
- [ ] Fastest sample stays believable during an all-out ride
