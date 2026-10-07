# Plan: Racer registration wizard, device login, no passkeys

> Replace passkey sign-in, account claiming, and accountless sign-up with a single
> `registration wizard`. A racer's only identity is the racer id generated when they register,
> held on their phone as a `device login` in browser local storage. `contact details` (real
> name, phone, email) are plain, non-unique, operator-only fields, so no registration can ever
> land on an existing account. Decision record: [ADR 0024](adr/0024-racer-identity-is-the-device-held-racer-id.md).
> Vocabulary: `CONTEXT.md` § "Racer identity and registration".

**Scope note.** This sets up a **fresh install for our first event**. No passkey-era data is
migrated or preserved: no backfills, no compatibility with old tokens, no transitional code
paths. Future sign-in or recovery is explicitly out of scope.

## Execution status (updated 2026-10-07)

| Slice                                               | State       | Depends on |
| --------------------------------------------------- | ----------- | ---------- |
| S1 Decision record + glossary                       | ✅ Done     | —          |
| S2 Contact details, register endpoint, admin desk   | ✅ Done     | S1         |
| S3 Wizard shell + contact-details and display-name  | ✅ Done     | S2         |
| S4 Photo + payment steps                            | ✅ Done     | S3         |
| S5 Remove passkeys, accountless, cookie, identities | Not started | S3         |
| S6 User guide + README sweep                        | Not started | S4, S5     |

S4 and S5 are independent once S3 lands. Every code slice must pass the full quality gate
(`pnpm format && pnpm quality && pnpm typecheck && pnpm test && pnpm build`) and add a
`CHANGELOG.md` entry under `## Unreleased`. S1 is docs-only and has no user-visible change,
so it has no CHANGELOG entry.

## What exists today

- **Passkey auth.** `AuthService` (`apps/desktop/src/backend/services/auth.ts`) runs WebAuthn
  sign-in, registration, and account claim via `@simplewebauthn/server`. Routes are
  `/api/auth/passkeys/{sign-in,register,claim}/{options,verify}` in `server.ts`. Credentials
  live in `passkey_credentials` (migration 0005).
- **Accountless sign-up.** `POST /api/auth/accountless`, gated by the
  `allowAccountlessRacerSignup` admin setting, keyed by a `roller-rumble.accountlessId`
  stored as an `anonymous` identity.
- **Sessions.** An HMAC-signed `{racerId, expiresAt}` token with a 30-day TTL. It is stored in
  **both** an httpOnly cookie and local storage (`roller-rumble.racerSessionToken`).
  `getSessionToken` prefers the cookie over the bearer header. `requireRacerSession` guards
  about 10 racer self-service routes.
- **Identities.** `identities` has a table-level `UNIQUE (type, value)` (migration 0001).
  `Database.createOrUpdateRacer` **merges** into any racer sharing an email or phone, and the
  admin quick-add (`admin-page.tsx` `handleQuickAddRacer` → `POST /api/racers` →
  `registerRacerRecord`) reaches it. **This is a live clobber path.**
- **PII leak.** `listEventRacers` hydrates every racer's `identities`, and
  `SnapshotAssembler.forSurface("racer")` spreads `...snapshot` without stripping them. Every
  racer's email and phone therefore ship to every racer phone.
- **Racer UI.** `racer-sections/auth.tsx` (`AuthForm`) holds the email, register, and
  accountless forms. `me.tsx` holds the "Secure this account / Create Passkey" upsell.
  `racer-page.tsx` (1859 lines) holds the handlers and the local storage plumbing.
- **Payment gate.** The event payment config has `paymentRequiredForQueue`. The queue signup
  returns `payment_required`, and the racer page handles the Stripe checkout return via
  `?payment=` and `?payment_id=`.

## Decisions (settled)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **The device login is a signed token naming the racer id, not the bare id.** Racer ids are public: they appear in the racer payload and in URLs. The token's payload _is_ the generated UUID.                                                                                                                                                              |
| D2  | **Device logins never expire.** Stop writing or checking `expiresAt`.                                                                                                                                                                                                                                                                                      |
| D3  | **Local storage is the only place the device login lives.** Remove the httpOnly cookie, and have the server read only `Authorization: Bearer`.                                                                                                                                                                                                             |
| D4  | **The racer is created when the display-name step is submitted.** That way an abandoned wizard never puts a real name on the projector as a display name. Steps 1–2 inputs are kept as a per-device draft in local storage (wrapped in try/catch). After creation, the wizard resumes at the first incomplete step, tracked per racer id in local storage. |
| D5  | **New `racers` columns: `real_name`, `email`, `phone`.** All are nullable, none are unique, and none are used for lookup. `display_name` stays the public fun name. The `identities` table is retired.                                                                                                                                                     |
| D6  | **Every racer-creation path is insert-only.** Delete `createOrUpdateRacer`. Nothing looks up a racer by contact details at creation.                                                                                                                                                                                                                       |
| D7  | **Remove accountless mode.** That means the setting, the endpoint, the `anonymous` identity type, and the `accountlessId` storage key.                                                                                                                                                                                                                     |
| D8  | **Contact details are validated by format only.** Email uses the zod email check. Phone needs 7–15 digits after stripping punctuation and is stored as entered. Real name is 1–80 characters, trimmed.                                                                                                                                                     |
| D9  | **A lost device login means registering again.** No recovery path; `racer merge` remains future work.                                                                                                                                                                                                                                                      |
| D10 | **Contact details are operator-only.** They are stripped from the racer payload. A racer sees their own only via `/api/auth/session`.                                                                                                                                                                                                                      |
| D11 | **Admin quick-add is insert-only.** It has a required **display name** field plus optional real name, phone, and email.                                                                                                                                                                                                                                    |
| D12 | **Sign-out stays, behind a strong warning.** The warning says the account cannot be recovered on this phone. Signing out returns the page to the wizard.                                                                                                                                                                                                   |

## Slices

### S1 — Decision record + glossary ✅

- Added [ADR 0024](adr/0024-racer-identity-is-the-device-held-racer-id.md).
- Marked ADRs 0007, 0009, and 0016 superseded by 0024, and ADR 0008 amended.
- Rewrote the `CONTEXT.md` "Racer identity and registration" section. It defines
  `racer account`, `display name`, `contact details`, `device login`, `registration`,
  `registration wizard`, `racer reconciliation`, and `racer merge`, and retires the
  passkey, accountless, claim, host-assist, and attach-QR terms.
- Updated the `racer payload` and `advanced setting` glossary entries to match.

### S2 — Contact details, register endpoint, admin desk (backend + admin form) ✅

- **Migration `0011_racer-contact-details.sql`:** add `racers.real_name`, `racers.email`,
  and `racers.phone`, all nullable `TEXT`. No backfill is needed.
- **`schema.ts`, `Database.ts`:**
  - Map the new columns.
  - Make `createRacer` insert-only and have it write the columns.
  - Delete `createOrUpdateRacer`.
  - Make `listRacers(search)` match display name, real name, email, and phone.
- **Shared types:**
  - `Racer` gains `realName`, `email`, and `phone`, each `string | null`.
  - Remove `identities` from `Racer`.
  - Update `services/__fixtures__/` and the lab pages that build fake racers.
- **Shared validation:**
  - `racerRegistrationSchema` = `{ realName, email, phone, displayName }`, all required, per
    D8.
  - `createRacerSchema` (admin) = `{ displayName }` required, plus optional `realName`,
    `email`, and `phone`.
  - Drop `accountlessId`.
- **`POST /api/auth/register`:**
  - Never reads the request's device login.
  - Creates the racer insert-only, then calls `ensureEventRegistration`.
  - Returns `{ racer, snapshot, sessionToken }`.
  - Lives on `AuthService.registerRacer`, which returns `Racer`; the app broadcasts.
- **Device login (D2):** tokens carry no expiry and none is checked.
- **Admin `POST /api/racers` (D11):** goes through insert-only creation.
- **Admin quick-add form (`admin-page.tsx`):**
  - Add a **Display name** field, which is required.
  - Relabel the existing name input to **Real name**, which is optional.
  - Phone and email stay optional.
  - Every submit creates a new racer.
- **Admin racer list:** shows real name, phone, and email (operator-only).
- **PII (D10):** strip `realName`, `email`, and `phone` from every racer in
  `forSurface("racer")`.
- **Tests:**
  - Two registrations with the same email give two racers, two ids, and two tokens.
  - Registering while holding another racer's token leaves that racer untouched.
  - Admin quick-add with a repeated email creates a new racer.
  - Admin quick-add works with only a display name.
  - The racer payload contains no `realName`, `email`, or `phone` for any racer.
  - The admin snapshot still contains them.
- **CHANGELOG:**
  - Fixed: "Adding a racer at the admin desk always creates a new racer, even if the email or
    phone matches someone else."
  - Fixed: "Racer phones no longer receive other racers' contact details."
  - Changed: "The admin desk's add-racer form now has separate Display name and Real name
    fields; only the display name is required."

### S3 — Wizard shell + contact-details and display-name steps (renderer) ✅

- **`packages/shared-ui` `StepProgress`:**
  - Shows the current step, the total, and a label for each step.
  - Is theme-aware through CSS variables and manifest attributes, never theme ids.
  - Is accessible: an ordered list with `aria-current="step"`, plus a visually hidden
    "Step X of N".
- **New `racer-sections/registration-wizard/` folder:**
  - A container that owns the step list, the current index, the draft, and resume (D4).
  - One component per step.
  - Auth state and handlers move out of `racer-page.tsx` instead of growing it.
- **Step list:** computed from the event. It is contact details → display name → photo →
  payment, where payment appears only when `paymentRequiredForQueue`. So the progress bar
  shows 3 or 4 steps.
- **Step 1, "Your details":**
  - Labelled inputs: real name (`autocomplete="name"`), phone (`type="tel"`,
    `autocomplete="tel"`), and email (`type="email"`, `autocomplete="email"`).
  - Errors appear inline, and Continue stays disabled until all three are valid.
- **Step 2, "Pick your racer name":**
  - A display name input with a little fun copy.
  - Continue calls `registerRacer` with steps 1 and 2 together, stores the device login and
    racer id, and clears the draft.
- **Until S4 lands,** finishing step 2 marks the wizard complete and lands on the race page.
- **Remove the old sign-in UI:**
  - Delete `AuthForm`'s email sign-in, register, host-assist, and accountless branches.
  - Delete `me.tsx`'s "Secure this account / Create Passkey" block.
  - Delete `getPasskeyUnavailableMessage`, because registration no longer needs HTTPS.
- **Sign-out (D12):** a confirm modal with strong warning copy. On confirm, forget the device
  login and racer id, then go back to wizard step 1.
- **Close the REST contact-details leak (D10), carried over from S2:** S2 strips contact
  details only from the racer WebSocket stream (`forSurface("racer")`) and from
  `/auth/session` and `/auth/register`. The racer page's first load still calls
  `GET /api/snapshot`, which returns the full snapshot. Sign-out and the racer self-service
  routes (queue signup, leave, notifications, opt-out, checkout cancel) also return the full
  snapshot, and the page writes it into the snapshot cache. Send the racer page the racer
  snapshot everywhere, then make the CHANGELOG say "Racer phones no longer receive other
  racers' contact details." S2 deliberately limited its entry to "live updates".
- **Rename the renderer admin client:** `api.ts` `registerRacer` posts to `/api/racers` (admin
  quick-add). Rename it, for example to `addRacerAtDesk`, before adding the wizard's
  `registerRacer` client for `/api/auth/register`.
- **Tests:**
  - Step-list derivation with and without payment.
  - Step 1 validation.
  - Draft restore after reload.
  - Registration ignores an existing device login.
  - The wizard resumes at the correct step for a racer who is already registered.
  - `StepProgress` renders the correct current step.
- **CHANGELOG:** Changed: "Racers now join through a short step-by-step registration with a
  progress bar: your details, then a racer name. Passkeys and email sign-in are gone."

### S4 — Photo + payment steps (renderer) ✅

- **Step 3, "Your photo" (required, no skip):**
  - Choose a photo, or take one (`<input type="file" accept="image/*" capture="user">`),
    using the existing avatar upload.
  - Offers the photo booth when the event has it enabled.
  - Shows a preview with a Retake option.
  - The step is complete when the racer has an `avatarUrl`, read from server state rather
    than a local flag. That way an avatar from the photo booth (which arrives
    asynchronously) also completes it, and a reload never re-asks.
  - Required in the wizard only. The server does not gate the queue on having a photo, and
    racers added from the admin desk may have none.
- **Step 4, "Payment":** shown only when the event requires payment
  (`paymentRequiredForQueue`).
  - **With Stripe configured:** starts the existing Stripe checkout. On return
    (`?payment=success`), the wizard resumes and completes. On cancel, it stays on the
    payment step. The step is complete when the racer's event payment status is `paid`.
  - **Without Stripe:** the step says "Pay at the desk" and the racer continues. The host
    marks them paid from the admin window. The queue's existing `payment_required` gate is
    unchanged. Whether they acknowledged this is tracked per racer in local storage.
- **Finish:** land on the race page.
- **As built:** the existing Stripe checkout was tied to queue signup (refused while the queue
  is closed, auto-queued once paid), so S4 added an entry-fee-only checkout:
  `POST /api/racer/payments/checkout` and a `payments.purpose` column (migration
  `0012_payment-purpose.sql`). A racer mid-wizard can also sign out and start over.
- **Tests:**
  - The photo step can't be passed without an avatar.
  - A photo-booth avatar arriving by snapshot completes the step.
  - The payment step is hidden when payment isn't required.
  - With Stripe, a success return completes the wizard.
  - Without Stripe, the racer sees the pay-at-desk path and continues.
- **CHANGELOG:**
  - Added: "Registration includes a photo step: pick a photo or take a selfie."
  - Added: "When an event charges an entry fee, registration ends with the payment step,
    or tells racers to pay at the desk when online payment isn't set up."

### S5 — Remove passkeys, accountless, the cookie, and identities (backend + cleanup)

- **`AuthService`:** delete all passkey and claim methods and the challenge map. What
  remains is device-login issue/verify plus `registerRacer`. Rename it if that reads better,
  for example `RacerLoginService`.
- **`server.ts`:**
  - Delete the passkey, claim, and accountless routes, and `getRequestOrigin` if it becomes
    unused.
  - Delete `RACER_SESSION_COOKIE` and its set/clear helpers.
  - Make `getSessionToken` read only the bearer header.
  - Make `/auth/sign-out` a server no-op.
- **`api.ts`:** delete the passkey, claim, and accountless clients.
- **Settings:** delete `allowAccountlessRacerSignup` from settings, types, and validation,
  and remove its toggle in `operator-settings.tsx`.
- **Migration `0013_drop-passkeys-and-identities.sql`** (S4 took 0012 for `payments.purpose`)**:** drop `passkey_credentials` and
  `identities`.
- **Database and shared code:** delete `findRacerByIdentity`, `listIdentities`,
  `attachIdentity`, and the passkey methods. Delete `IDENTITY_TYPES` and the `Identity`
  type.
- **Dependencies and env:** remove `@simplewebauthn/server` and `@simplewebauthn/browser`.
  Remove `ROLLER_RUMBLE_PASSKEY_RP_ID` from `env.ts`, `.env`, and the README.
- **Racer page:** stop reading or writing `roller-rumble.accountlessId` and
  `roller-rumble.anonymousId`.
- **Tests:** delete the passkey cases. Add a check that a cookie alone no longer
  authenticates.
- **CHANGELOG:** Changed: "Removed the 'Allow accountless racers' setting; every racer
  registers through the registration wizard."

### S6 — User guide + README sweep

- Update `docs/user-guide/02`, `03`, `04`, `07`, and `08`, plus the README:
  - Remove passkey, HTTPS-for-passkeys, and host-assist guidance.
  - Describe the wizard and the sign-out warning.
  - Explain that a lost phone means registering again.
  - Note that racers no longer need the tunnel just to register.
- Refresh the auth section of `docs/product-requirements.md`.

## Follow-ups (out of scope)

- The projector and admin QR could fall back to the LAN URL when no tunnel is running, now
  that registration doesn't need HTTPS.
- `racer merge` and `racer reconciliation` for duplicate racers created by re-registering.
