# Notifications use a live-status supersession model

Automatic racer notifications (queue standing, tournament check-in) are modeled as keyed **notification channels** whose newest record supersedes the prior one, rather than as an append-only stream of independent alerts that stack in the tray. A _backgrounded_ notification is never truly cleared — it is replaced in place with an accurate message — because iOS Web Push requires the service worker to display a notification for every push it receives, and revokes push permission after repeated silent (non-displaying) pushes. That makes a remote "silent close" unsafe, so teardown is always "supersede with the current truth" (e.g. "You're up!" → "✓ You raced — nice work!"). Only escalation (getting more urgent) re-alerts via `renotify: true`; de-escalation and teardown update silently.

Persistence stays append-only: immutable notification rows gain a `channelKey` and `supersededAt`, preserving delivery history and fitting the existing immutable-row / delivery-record grain. The push tray uses `channelKey` as the notification `tag`, and the inbox/modal show only the latest non-superseded row per channel, so a stale record can neither sit in the tray nor re-pop the modal.

Foreground acknowledgement is the sole path that _truly_ removes a notification: when a racer acts inside the open app, the page calls `getNotifications({ tag }).close()` directly, with no push involved, so it works on every platform (`local clear`).

## Considered Options

- **True-dismiss via `close()`** — clean on Android (tray goes empty), but unsafe on iOS (forced generic notification + permission revocation). Rejected.
- **Platform-adaptive** (`close()` on Android, replace-in-place on iOS) — "most correct" but two code paths to test for marginal gain over uniform replace-in-place. Rejected.
