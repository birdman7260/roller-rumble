<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

All notable Roller Rumble changes should be recorded here before a release.

## Unreleased

### Added

- The race display now shows a header inside the race box, above both lanes: the race distance on the left and an elapsed-time clock on the right. The clock reads 0:00.0 until the race starts, counts up while the race is live, and freezes at the final time when the race finishes.

### Changed

- On the race display, a racer with no photo now shows a colored disc with their initials in place of the avatar, sized and placed exactly like a photo would be. Both lanes' names line up and both lane cards are the same height whether or not a racer has a photo. The RPM readout now sizes to its content instead of reserving half the card, and its digits are held to a steady width so a changing RPM value no longer makes the card jitter.
- The race results now wait for the second racer to finish instead of popping up the moment the winner crosses the line. After the winner finishes, the trailing racer keeps riding to the line; the results appear once they cross (after a brief beat) or when their time runs out. The trailing racer's time limit is the winner's finishing time times a configurable percentage (default 120%, always at least 5 seconds of extra time), set with the new advanced setting "Race finish budget". Solo races are unaffected.

### Fixed

- On the race display's horizontal track theme, the rider marker no longer overflows upward into the lane card above it. Each lane now reserves a dedicated band of clearance above its track bar sized to exactly fit the rider, so the rider's wheels sit on the bar and its head stays clear of the lane card at any window height. The rider sprite also now grows and shrinks smoothly with the window instead of jumping in size around certain heights, and it still reaches exactly the finish line at 100%.
- The Oregon Trail '90 and Frontier Trail race themes now position their riders the same way as the track theme: the rider's wheels sit on the route line with a reserved band of clearance above it, so the rider grows and shrinks smoothly with the window, no longer overlaps the lane card at any window height, and still lands exactly on the finish line at 100%.
- A racer's on-screen stats (speed, cadence, power, and their clock) now freeze the instant they cross the finish line, instead of continuing to update while the other racer finishes.

## 0.1.18 - 2026-07-08

### Added

- A VirtualDJ cue can once again set the race countdown length with `countdownMs`, and the race GO now lands exactly at the end of that countdown so a DJ can start the race on a beat or drop. Roller Rumble owns the whole on-screen countdown and, with the OpenSprints race box, quietly starts the box partway through so its silent start delay finishes right as the countdown reaches zero. There is a new advanced setting, "Race box countdown (ms)", for tuning a box whose start delay differs from the default.

### Changed

- The default race countdown is now 4 seconds (was 3), matching the OpenSprints race box's own start delay, so a cue with no time and the manual Start button both count down 4 seconds. The projector countdown reaching zero now coincides with the race actually going instead of finishing about a second early on the hardware box.
- Trimmed the stats shown for each racer to the most useful ones. On the racer page, a collapsed racer now shows only the number of races and top speed, and the expanded view no longer shows peak power. On the admin Racers page, top speed is no longer shown in the racer list.
- On the racer page Racers tab, the Challenge button now stays aligned to the right edge of the row in both the collapsed and expanded states, and sits at the top-right when a racer is expanded instead of floating in the vertical center.
- Each racer lane on the race display now shows a single live RPM readout instead of the distance, speed, and top-speed stats, and the racer's name is displayed in a larger font.
- The race results screen now shows a stronger size difference between the winner and runner-up: the winner's card is noticeably wider with larger text, while the runner-up's card is narrower with smaller text. Both cards stay fully inside the results panel without covering the "Winner!" title or spilling past the bottom edge.
- Reordered the admin Settings tab so the most-used cards come first: Status, Settings, Tunnel, Projector Display, then Notifications, with the remaining cards below them.
- The secondary Settings cards (Diagnostics, VirtualDJ Diagnostics, Lab Pages, Environment, Photo Booth, and Managed Settings) now start collapsed and can be expanded or collapsed by clicking their title. Managed Settings moved to the bottom of the tab.

### Fixed

- The racer page can now be pulled down to refresh on Android Chrome. On phones the page hands scrolling back to the browser so the native pull-to-refresh gesture works, while the event title card stays pinned to the top of the screen, the section tab bar stays pinned to the bottom, and page content is never hidden behind the tab bar. The operator sidebar no longer appears above the racer page on phones.
- Signing out on the racer page and then registering again as a guest now creates a separate racer instead of overwriting the previous racer's name and details. Signing out now resets the device's guest identity.
- Racer phone pages now stay live after the first race or two. The page automatically reconnects to the live-update stream if its connection drops (for example when the phone sleeps, the browser tab is backgrounded, or an idle connection times out over the Cloudflare tunnel) and re-syncs the latest state on reconnect, so a manual refresh is no longer needed. While reconnecting, the racer page shows a brief "Reconnecting to live updates…" banner.
- The Cloudflare tunnel no longer gets stuck showing "Failed" after a brief network hiccup. A transient loss of connection to Cloudflare's edge (common on flaky or QUIC-throttling Wi-Fi) now shows a temporary "Reconnecting…" notice instead of a failure, and the tunnel status returns to active on its own once cloudflared reconnects — no manual stop/start needed.

## 0.1.17 - 2026-07-02

### Added

- The admin window title bar now shows the app version (e.g. "Roller Rumble Admin — v0.1.16"), making it easy to confirm which build is running.

### Changed

### Fixed

- The race box is now recognized even though it reports its firmware version without a trailing line break. The app previously waited for a line ending that never came and treated the box as unresponsive; it now reads the version reply as soon as it arrives.

## 0.1.16 - 2026-07-01

### Added

### Changed

### Fixed

- The app now wakes the race box the same way the diagnostic probe does (asserting the serial DTR line) and waits a little longer for it to boot, so a box that opens on its port but stayed silent is now detected. Startup diagnostics also log the first bytes received from the box, making a silent-vs-misconfigured box easy to tell apart.

## 0.1.15 - 2026-07-01

### Added

### Changed

### Fixed

- Roller Rumble now runs as a single instance. Launching it again (or a leftover copy still running in the background) no longer starts a competing copy that fights the first one for the race box's USB port and the local server port — the most common reason the race box showed "still searching" with an "Access denied" error. A second launch now just focuses the window that's already open.
- Roller Rumble now secures its network port before connecting to the race box, and if the port is already taken it shows a clear "already running / port in use" message and exits cleanly instead of hanging in the background still holding the race box's USB port. A leftover, windowless copy can no longer keep the box locked away from the next launch. If another program genuinely needs port 3187, you can now set `ROLLER_RUMBLE_PORT` to a different value.
- Fixed a shutdown crash ("database connection is not open") that could occur when the app was closing while the bike sensor was still searching for the box.

## 0.1.14 - 2026-07-01

### Added

### Changed

### Fixed

- Undid some of the previous fix that wasn't needed.

## 0.1.13 - 2026-07-01

### Added

### Changed

### Fixed

- Fixed the electron rebuild script to handle more than one package correctly.

## 0.1.12 - 2026-07-01

### Added

### Changed

### Fixed

- Diagnostics now record what the bike sensor is doing at startup and while it searches: which sensor mode is active, whether the serial driver loaded, every serial port found (with its USB IDs), which port answered the race box's version handshake, and any connection error. This makes a "still searching" box far easier to troubleshoot from the saved diagnostics.

## 0.1.11 - 2026-07-01

### Added

- Settings now has a **Bike sensor** card where you can switch between the simulator and the physical OpenSprints USB race box, pick the serial port, set the sensor-to-lane wiring, and adjust the roller rollout — no more hand-editing the settings file. Saving these writes them into your settings file for you, and the generated settings file and `.env.example` now include a documented bike-sensor section.

### Changed

### Fixed

- The OpenSprints race box is now detected on startup. Opening its USB port resets the box, and it needs a couple of seconds to boot before it can answer; the app was giving up too soon and falling back to the simulator. It now keeps asking while the box boots, so a plugged-in box that the probe tool could see is now found by the app too.
- Race distances and speeds from the OpenSprints race box are now accurate: the app measures distance using the real 4.5-inch (114.3 mm) roller with one magnet per revolution (~0.359 m per tick), instead of a placeholder bike-wheel value that overstated distance.
- The OpenSprints race box now streams reliably for the full length of a race instead of being told a finish distance its firmware couldn't store, which could stop the live feed early.

## 0.1.10 - 2026-07-01

### Added

### Changed

### Fixed

- Fixed pipeline for Windows

## 0.1.9 - 2026-07-01

### Added

### Changed

### Fixed

- Tried to fix the build issue

## 0.1.8 - 2026-07-01

### Added

- The projector race display now gives each lane a comet-style leading-edge glow: a bright head at the rider that trails backward along the lane fill and brightens with momentum. A new "Lane glow" setting under Projector Display chooses what it reacts to: Rivalry (the default) lights whichever lane is faster than its opponent right now, so exactly one lane glows and the light flips as the speed lead changes; Surge lights a lane on the rider's own acceleration, rewarding a dig even with no rival. Solo time trials always use the Surge behavior. The glow fades to dark when a rider coasts, stops, or finishes, and calms itself when reduced motion is requested. The mode can be switched live mid-race and persists across projector reloads.
- The projector race display now punctuates an overtake with a lead-change flash: the instant one racer passes the other on distance covered, the passing lane bursts briefly in its own color. It marks the actual standings flip — not a momentary speed lead — so a lane must pull clearly ahead to trigger it, a neck-and-neck dead heat does not strobe, and a re-pass flashes again. Solo time trials show no flash (there is no one to pass), and the burst softens to a gentle fade when reduced motion is requested.
- The projector race display now trails fast riders with speed streaks: motion lines behind each rider that grow longer and brighter the faster they are actually going, and shrink to nothing as they slow or stop. Unlike the glow, which shows who is winning the moment, the streaks track raw speed — so a rider holding a strong, steady pace still visibly looks fast. They work for every racer on their own (head-to-head and solo time trials alike), point the way each theme travels (up for climbs, along the track for horizontal layouts), and are minimized when reduced motion is requested.
- Added a Glow Lab (Settings → Lab Pages → Open Glow Lab) for designing the lane glow, lead-change flash, and speed streaks. Position each racer in their lane, set each lane's glow, flash, and streak levels by hand, and tune each cue's size, blur, scale, opacity, and falloff live across every race graphic — with Copy CSS buttons to capture the tuned values. The layout leaves room for the upcoming top-speed flare cue.
- Roller Rumble can now run races from the physical OpenSprints USB race box, not just the built-in simulator. Pick "OpenSprints USB box" under the new Bike sensor setting; the app finds the box automatically (or you can set a specific serial port if needed). The race countdown follows the box's own 3‑2‑1‑GO, and roller revolutions drive each racer's distance and speed.
- All three OpenSprints firmware generations are supported (newest SilverSprint, original basic, and the oldest advanced). The app auto-detects which one your box speaks; only the oldest firmware, which can't announce itself, needs the protocol picked manually.
- New Bike sensor settings: which lane each sensor cable feeds (lane map), how far a bike travels per roller revolution (roller rollout, measured from your hardware), a manual serial port override for when auto-detect picks the wrong device, and a sensor-protocol override.
- The Settings status panel now includes the Bike sensor, showing whether the box is connected (and on which port) or the simulator is in use.
- If the race box loses its connection during a race, the race is marked interrupted so you can restart it instead of recording a half-finished result.
- Settings now has a Status panel at the top showing each part of the app (tunnel, Stripe, notifications, network, VirtualDJ, photo booth) as Ready, Degraded, Failed, or Off at a glance, with plain-language guidance and a suggested fix when a known problem is detected.
- The settings an operator commonly changes — Cloudflare tunnel mode/token/name, Stripe secret and webhook keys and CA certificate, local network address, public racer URL, and web push keys — are now labeled fields in Settings that the app saves into the settings file for you. Secret fields are hidden with a reveal toggle and show only the last 4 characters once set.
- Saving a managed setting now takes effect without quitting and relaunching the app. Changing a tunnel setting asks before restarting the tunnel so a live event's racer connections are never dropped without confirmation.
- Settings has a "Reload settings from disk" action so hand-edited changes to the settings file are picked up without a full restart.
- Roller Rumble now keeps logs automatically every run, and Settings has "Copy diagnostics" and "Save diagnostics bundle" buttons that produce a redacted summary or a zip of logs and status to send to the maintainer. Secret values are never included.
- If the app fails to start because the database can't be opened (for example after an update), it now shows a clear dialog with the error and offers to delete all data and restart instead of silently failing to open.
- Projector display settings now include quick buttons to resize the race window to 720p or 1080p for layout checks.
- Racers who are maxed out only by locked challenge matches now get a modal to choose which queued challenge to replace when creating a new challenge.
- React Doctor is now installed and included in the ESLint configuration for React renderer code. This led to a major refactor for the better.

### Changed

- Challenge placement now reuses the opponent's sooner flexible queue spot when available, otherwise the challenger's selected replacement challenge spot, while keeping the previous opponent in the flexible queue.
- Reworked the horizontal projector layout so the title, main stage, Fiercely Local footer, and ticker stay visible down to 720p.
- Rebalanced staged race lanes so racer details cards, avatars, stats, and race indicators fit more cleanly at 720p and 1080p.
- Removed the visible URL text from the projector QR card and enlarged the QR so it fills the right side of the card.
- Winner results now use the full projector screen with spacing while keeping the bottom ticker visible.
- The URL on the QR code page is removed.
- More logic for queueing and challenging
- Refactored the race lifecycle code.
- Refactored the snapshot assembler code into its own module.
- Refactored payment, auth, and notifications.

### Fixed

- Removed negative letter spacing from large projector text so title, signup, and winner text no longer has letters touching.
- Racers who are already fully locked into challenge matches can no longer be silently displaced by someone else's challenge; the challenger now sees an unavailable message.
- Improved race sprite marker positioning so animated racers stay fully inside their race indicators.
- The QR display works at different screen sizes now.
- The racer page no longer makes requests for notifications during a race.
- The racer page only gets updates with what it actually needs and at a slower rate to minimize network.
- The racer page bottom navigation bar now stays pinned to the bottom of the screen on mobile (Android Chrome). Scrolling past the bottom no longer drags the bar upward or reveals the page background beneath it.

## 0.1.7 - 2026-06-11

### Added

- Buttons in the settings to easily open the different lab pages

### Changed

### Fixed

- Added ability to provide a CA cert so that the app can run from corporate controlled networks

## 0.1.6 - 2026-06-11

### Added

- Stuff to investigate VDJ

### Changed

### Fixed

## 0.1.5 - 2026-06-09

### Added

- Admin settings to make it easier to manage the ENV file
- The app now looks for .env.local both in the installed location as well as:
  - Windows: %APPDATA%\Roller Rumble\.env.local
  - macOS: ~/Library/Application Support/Roller Rumble/.env.local
- There is a button to auto generate the push notification keys, to make it easy for the boys to test out

### Changed

- The admin settings panel flows better and each card contains it content in a way that fits more screen sizes

### Fixed

- The VirtualDJ OS2L listener should work better now. It wasn't listening for the current staged race if the setting was turned on during that time.
- The code should be able to handle more types of VDJ cues, hopefully fixing the test Wyatt was doing.

## 0.1.4 - 2026-06-03

### Added

### Changed

- The entire racer page so that it is actually closer to a finished product, with nice organization and features and functionality

### Fixed

## 0.1.3 - 2026-06-03

### Added

### Changed

### Fixed

- The publish script was not aware of the GitHub repo

## 0.1.2 - 2026-06-03

### Added

### Changed

- the github actions now allow for manual triggers

### Fixed

## 0.1.1 - 2026-06-03

### Added

- Github build pipeline

### Changed

### Fixed

## 0.1.0

- Initial working build.
