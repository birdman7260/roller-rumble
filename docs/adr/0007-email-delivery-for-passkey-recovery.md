# Email delivery is added to support self-serve passkey recovery

Roller Rumble is a **local-first** app: one host machine runs the full stack and racers join over a LAN or a Cloudflare tunnel, so the app has deliberately avoided depending on outbound internet for its core loop. A returning racer, however, can be locked out when their `passkey` isn't usable on the current device (new phone, iPhone→Android switch, lost/replaced phone, different browser), and the only recovery today is `host-assist` — find the host, interrupt them, have them attach a passkey by hand. We decided to **build outbound email delivery** so a locked-out racer can request an `email one-time code`, prove ownership of their registered address, and self-attach a passkey to their real `racer account` — making `email one-time code` the primary `passkey recovery` path, with `race under your name` and `host-assist` as fallbacks.

## Considered Options

- **Email one-time code (chosen).** The only self-serve path that restores the _real_ account with its cross-event history. Costs a new internet dependency and email operational surface.
- **Magic link instead of a numeric code (rejected).** A link can open in a different browser and break the racer's session/page; a 6-digit code keeps them in the same page. Same infra cost, worse mobile flow.
- **Host-only recovery, no email (rejected).** Keeps the app fully offline-capable but leaves recovery non-self-serve and bottlenecked on the host during a live event — the problem we set out to solve.
- **Self-attest re-attach by typing an email (rejected).** Zero infra, but hands over the account's PII (email/phone) to anyone who types the address — violates the one harm the threat model says to avoid.

## Consequences

- Email requires **outbound internet**, which a pure-LAN event does not have. `email one-time code` must **degrade to `host-assist`**: when email is unconfigured or unsendable, the recovery screen's primary button collapses to "Ask the host" so the loud button is never a dead end. Email config joins the **subsystem health** surface.
- New backend surface: an email provider/SMTP `managed setting`, code generation with rate-limiting, short expiry, and single-use enforcement — a phishing/abuse vector the local-first app did not previously have.
- The threat model that justifies the _low-friction_ fallbacks (casual impersonation only; host physically present; no stored card to spend) is the same one that makes a full email round-trip acceptable-but-not-mandatory. If that posture ever hardens (e.g. accounts start holding spendable value), email recovery stops being optional.
- `race under your name` remains available with **no** internet, but its "sort your account after" promise depends on `racer reconciliation`, which is not yet built. Until it is, that path's copy must promise only "for tonight," not an account merge.
