<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

All notable Roller Rumble changes should be recorded here before a release.

## Unreleased

### Added

- The projector race display now gives each lane a comet-style leading-edge glow: a bright head at the rider that trails backward along the lane fill and brightens with momentum. A new "Lane glow" setting under Projector Display chooses what it reacts to: Rivalry (the default) lights whichever lane is faster than its opponent right now, so exactly one lane glows and the light flips as the speed lead changes; Surge lights a lane on the rider's own acceleration, rewarding a dig even with no rival. Solo time trials always use the Surge behavior. The glow fades to dark when a rider coasts, stops, or finishes, and calms itself when reduced motion is requested. The mode can be switched live mid-race and persists across projector reloads.
- Added a Glow Lab (Settings → Lab Pages → Open Glow Lab) for designing the lane glow. Position each racer in their lane, set each lane's glow level by hand, and tune the glow's size, blur, scale, opacity, and falloff live across every race graphic — with a Copy CSS button to capture the tuned values. The layout leaves room for the upcoming companion cues (lead-change flash, top-speed flare, speed streaks).
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
