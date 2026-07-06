# Host-assist attach binds a racer's phone to an account via an admin-only single-use QR

A `passkey` ceremony must run on the racer's own phone, so a host cannot attach a passkey to a `racer account` entirely from the admin surface — the host must first get the racer's phone holding a session for that account, after which the existing register/verify flow attaches the passkey. We decided the host binds the phone with a **single-use, short-TTL QR** (`attach QR`) generated from the admin Racers tab: it encodes the public racer URL plus a one-time claim token for a chosen account; the racer scans it, the server mints a normal racer session cookie for that account (first-scan-wins), and the phone is signed in and prompted — optionally — to add a passkey. This is the same flow as `passkey recovery` path C (a returning racer on a new device) and the offline fallback when `email one-time code` cannot send.

## Considered Options

- **Admin-shown QR the racer scans (chosen).** Fast to redeem, reuses the existing session cookie + register ceremony, works at a physical venue. Requires a working camera and rendering the QR somewhere only the intended racer can reach it.
- **Host-issued claim code the racer types (rejected as primary).** No camera needed and symmetric with `email one-time code`, but slower to relay; kept as a possible fallback, not the v1 path.
- **Racer-initiated, host-approves queue (rejected).** No code/QR to relay, but needs a live request queue and admin/phone polling in sync — more moving parts than a physical-venue interaction needs.

## Consequences

- The QR **grants a full account session**, not an attach-only scope — the racer is signed in for the night regardless of whether they add a passkey. Attaching a passkey a rider controls already implies durable sign-in, so a narrower scope would buy little. Justified by the low-stakes threat model (host physically present, no stored card to spend).
- Because it grants a session, the QR **must render only in the admin window — never on the public projector** — and must be **single-use with a short TTL (~5 min), first-scan-wins**, so a bystander scanning the host's screen cannot silently claim an account.
- Merge and attach ship as **two independent, composable admin tools**, not one wizard. A full "reconnect returning racer" is host-driven: `racer merge` (accountless → real), then `attach QR` on the survivor. Merging first invalidates the phone's accountless session, so the re-scan correctly lands on the survivor.
- New surface: claim-token issue/redeem endpoints and an admin QR view. The token is a short-lived server-side grant distinct from the long-lived HMAC session token it mints on redemption.
