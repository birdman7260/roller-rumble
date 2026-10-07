# A racer is identified only by the id minted at registration, held on their phone

**Status:** accepted — supersedes [ADR 0007](0007-email-delivery-for-passkey-recovery.md), [ADR 0009](0009-qr-host-assist-attach.md) and [ADR 0016](0016-registration-vs-account-claim.md); amends [ADR 0008](0008-general-racer-merge.md). Planned in `docs/plan-racer-registration-wizard-2026-10-07.md`.

Passkeys, accountless sign-up, account claiming, and a unique `(type, value)` identity index gave the racer page three sign-in paths, an HTTPS requirement, and two ways to write a new registration onto someone else's account: a stale session on the phone, and a reused email or phone at the admin desk. We are running our first event on a fresh install and expect to change things based on what we learn. So we chose the simplest model that cannot clobber an account. **Every `registration` creates a new `racer account`, and that account's only identity is the racer id generated for it.** The phone holds a `device login` in browser local storage, and that is the only way it is ever signed in. There are no passkeys and no passwords, and there is no way to sign back in. A racer's `contact details` (real name, phone, email) are required on the `registration wizard`, optional at the admin desk, never unique, never used to find an account, and never sent to racer phones.

## Considered Options

- **Device login holding a signed token that names the racer id (chosen).** The racer id is the identity. The token is a signature over that id, so a phone can't claim an account it wasn't issued.
- **Bare racer id in local storage (rejected).** This is the literal "local storage is the login". But racer ids are public: they ship in the `racer payload` and appear in URLs. Anyone could become any racer by pasting an id.
- **Keep passkeys (rejected).** They require HTTPS through the tunnel, they need a recovery story (ADR 0007, ADR 0009) that we never finished, and they add a sign-in step that a one-night event doesn't need.
- **Keep email unique and find-or-create by it (rejected).** This is exactly the clobber vector. Two people sharing a family email, or one typo, would merge two racers.

## Consequences

- **A lost device login cannot be recovered.** If a racer clears their browser or switches phones, they register again as a new racer, and their earlier results stay on the old account. We accept this for now. `racer merge` (ADR 0008, unbuilt) remains the eventual way to fold the duplicates together.
- **Signing out is irreversible on that phone.** The racer page keeps sign-out so a shared phone can register a second person, but puts it behind a strong warning.
- **The device login has no expiry.** An expiry would lock racers out, with no way back in.
- **Local storage is the only place the device login lives.** The httpOnly session cookie is removed, along with the cookie-vs-bearer desync that ADR 0016 worked around.
- **Contact details are operator-only.** They are stripped from the `racer payload`. A racer sees only their own contact details.
- **Registration no longer needs HTTPS**, so racers can register over the plain LAN URL.
- **No passkey-era data is migrated.** The first event runs on a fresh install.
