Place the real Fiercely Local logo in this directory.

Preferred filename:

- `fiercely-local-logo.svg`

Supported fallbacks, checked in this order:

- `fiercely-local-logo.svg`
- `fiercely-local-logo.png`
- `fiercely-local-logo.webp`
- `fiercely-local-logo.jpg`

The race display uses this asset for the `Fiercely Local` projector mark. SVG is preferred because
it scales best on a 1080p projector, but any of the fallback raster formats will work without code
changes.

## Notification & PWA icons (placeholders — replace with the real Roller Rumble mark)

These drive Web Push notifications and the installed PWA (`manifest.webmanifest`). They ship as
solid-color placeholder PNGs and should be replaced with the real branded artwork:

- `notification-icon.png` — large notification icon, square, full color, 192×192+ (Android).
- `notification-badge.png` — status-bar badge, **monochrome** on transparent, ~96×96 (Android tints it).
- `icon-192.png` / `icon-512.png` — PWA/home-screen icons referenced by the manifest (used by iOS
  for its home-screen icon and notification glyph). Keep the manifest `sizes` in sync if you resize.
