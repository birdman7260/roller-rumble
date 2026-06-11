<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

All notable Roller Rumble changes should be recorded here before a release.

## Unreleased

### Added

### Changed

### Fixed

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
