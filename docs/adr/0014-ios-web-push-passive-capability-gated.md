# iOS Web Push is passive and capability-gated

We ship a web app manifest so iOS racers _can_ install the racer page as a PWA and receive Web Push (iOS only delivers push to an installed, standalone PWA — a Safari tab cannot). We deliberately do **not** add an iOS install coach: a racer who knows how to install a PWA may, and those who don't are not nagged.

The "Enable Notifications" CTA is gated on push _capability_ (`'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`) rather than on platform sniffing. Consequences: in an iOS Safari tab the API is absent so the CTA is hidden; once the PWA is installed and opened standalone the CTA appears and enabling works; Android (tab or installed) is unchanged. **The absent enable button in an iOS Safari tab is by design — do not "fix" it.**

Rationale: capability detection answers the question we actually care about ("can this device receive a push right now?") and is robust to iPadOS masquerading as macOS in the UA string. Passive install keeps v1 scope small for a small event-organizer audience; an active install coach can be revisited if adoption data warrants it.
