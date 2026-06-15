<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

All notable Roller Rumble changes should be recorded here before a release.

## Unreleased

### Added

- Projector display settings now include quick buttons to resize the race window to 720p or 1080p for layout checks.

### Changed

- Reworked the horizontal projector layout so the title, main stage, Fiercely Local footer, and ticker stay visible down to 720p.
- Rebalanced staged race lanes so racer details cards, avatars, stats, and race indicators fit more cleanly at 720p and 1080p.
- Removed the visible URL text from the projector QR card and enlarged the QR so it fills the right side of the card.
- Winner results now use the full projector screen with spacing while keeping the bottom ticker visible.
- The URL on the QR code page is removed.

### Fixed

- Removed negative letter spacing from large projector text so title, signup, and winner text no longer has letters touching.
- Improved race sprite marker positioning so animated racers stay fully inside their race indicators.
- The QR display works at different screen sizes now.

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
