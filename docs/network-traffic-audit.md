# Network Traffic Audit

This document tracks tunnel/network traffic improvements for racer-facing pages. The goal is to keep
the racer page live and useful while avoiding avoidable HTTP requests through the public tunnel.

## Findings

### 1. Notification refetch on every snapshot broadcast

Status: Implemented.

Previous behavior: every WebSocket snapshot invalidated the racer notifications query. During
countdown and active races, snapshots can broadcast frequently, causing signed-in racer pages to
refetch `/api/racer/notifications` even when notifications had not changed.

Current behavior: snapshots include `notificationRevision`, and the renderer only invalidates racer
notifications when that revision changes.

### 2. Full high-frequency snapshots for racer phones

Status: Implemented.

Racer phones currently receive the same full `AppSnapshot` stream as admin and projector surfaces.
This keeps the architecture simple, but it may send more data than phones need during active races.

Current behavior: WebSocket clients identify their surface with `/ws?surface=...`. Admin and
projector clients still receive immediate snapshots, while racer clients are coalesced to the latest
snapshot at a lower cadence so active-race telemetry does not stream to phones several times per
second. Racer WebSocket payloads also strip projector/admin-only data such as live telemetry maps,
race metric arrays, theme catalogs, OS2L diagnostics, photo booth hardware health, and Stripe setup
details while preserving the fields used by the racer page.

Potential future options:

- send revision/delta messages instead of full snapshots

### 3. Duplicate snapshot transfer on initial racer load

Status: Planned.

The app fetches `/api/snapshot`, and `/api/auth/session` also returns a full snapshot. Racer page
startup can transfer the same snapshot data twice.

Potential option: make `/api/auth/session` return only session/racer identity and let the shared
snapshot query own snapshot data.

### 4. Notification config fetched before it is needed

Status: Planned.

The racer page currently fetches notification config on page load. It could be lazy-loaded only
when a signed-in racer reaches notification setup or queueing behavior that needs it.
