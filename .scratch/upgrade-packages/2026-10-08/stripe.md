# stripe

| Package | Installed | Target |
| ------- | --------- | ------ |
| stripe  | 22.2.0    | 23.0.0 |

Repo Stripe surface (the only code that touches the SDK):

- `apps/desktop/src/backend/services/payment.ts:1` imports `Stripe` (default import). `:158` calls `new Stripe(secretKey, { appInfo, httpAgent? })` with **no `apiVersion`**, so the SDK's pinned version is used. `:182` calls `balance.retrieve()`, `:286` calls `checkout.sessions.create(...)`, and `:340` calls `webhooks.constructEvent(rawBody, signature, secret)` with no tolerance argument. `:38-89` classifies errors by the `type`/`code`/`requestId` properties (`StripeConnectionError`, `StripeAuthenticationError`, `StripePermissionError`). `:382-431` reads `session.id`, `session.metadata.paymentId`, `session.payment_intent` and `session.status`.
- `apps/desktop/src/backend/services/stripe-payments.ts:105-145` builds `Stripe.Checkout.SessionCreateParams` from `mode: "payment"`, `client_reference_id`, `success_url`, `cancel_url`, `metadata`, `payment_intent_data.metadata` and `line_items[].price_data{currency, unit_amount, product_data{name, description}}`.
- `apps/desktop/src/backend/services/app.ts:2045-2057` handles `checkout.session.completed` and `checkout.session.expired` through `event.data.object`, `event.id` and `event.type`.
- `apps/desktop/src/backend/services/payment.test.ts:35` fully mocks `stripe` (`vi.mock("stripe", ...)`).

**Type-check evidence:** I compiled a scratch file that reproduces every call and type above (the default import, `appInfo` + `httpAgent`, `Stripe.Checkout.SessionCreateParams`, `Stripe.Checkout.Session`, `Stripe.Event` narrowing on both checkout event types, `balance.retrieve`). It used the repo's `tsc` and `@types/node` with the repo's tsconfig settings (`moduleResolution: Bundler`, `module: ESNext`, strict). It compiles cleanly against **both 22.2.0 and 23.0.0**, so no type errors are expected.

**Requirements:** Node `>=20` (`engines`) and peer `@types/node >=20`. The repo has `@types/node ^22.15.3` (`apps/desktop/package.json:81`), local Node v22.22.3, and Electron 35.7.5 (bundles Node 22). All satisfied; no package outside this group needs to change.

## stripe 22.2.1

- **behavior change**: path params are now URI-encoded ([source](https://github.com/stripe/stripe-node/releases/tag/v22.2.1), [#2750](https://github.com/stripe/stripe-node/pull/2750))
  - not used: the repo calls no ID-taking methods (`.retrieve(id`, `.update(id`, `.del(`). The only calls are `balance.retrieve()` and `checkout.sessions.create()`.
- **behavior change**: `parseHttpHeaderAsNumber` returns `undefined` instead of `NaN`. The V2ListIterator also changed (concurrency guard, empty page) ([source](https://github.com/stripe/stripe-node/releases/tag/v22.2.1))
  - not used: searched `V2List`, `v2.`, `autoPagingEach`, `for await`. No V2 APIs or list iteration.
- **behavior change**: the user-agent header gains a `source` field ([source](https://github.com/stripe/stripe-node/releases/tag/v22.2.1))
  - not used: the repo never reads or asserts the user agent (searched `USER_AGENT`, `user-agent`).

## stripe 22.2.2

- **breaking (types)**: `Stripe.ErrorType.StripeError` is no longer usable as a runtime class. CJS type exports are fixed ([source](https://github.com/stripe/stripe-node/releases/tag/v22.2.2), [#2758](https://github.com/stripe/stripe-node/pull/2758))
  - not used: searched `ErrorType`, `Stripe.errors`, `instanceof Stripe`. The repo classifies errors by duck-typing the `type` string (`payment.ts:50-56`).

## stripe 22.2.3

Nothing in scope. The only change is URI-encoding of `accounts.retrieve` path params; the repo never calls `accounts.` ([source](https://github.com/stripe/stripe-node/releases/tag/v22.2.3))

## stripe 22.3.0

- **behavior change**: the pinned API version changes to `2026-06-24.dahlia`. This minor dahlia release is additive only ([source](https://github.com/stripe/stripe-node/releases/tag/v22.3.0))
  - not used directly: no `apiVersion` is hard-coded (searched `apiVersion`, `Stripe-Version`, `dahlia`). The cumulative pin change is covered under 23.0.0.
- **breaking (types)**: support is removed for `stored_credential_usage` on `PaymentAttemptRecord`/`PaymentRecord...card`, and for `crypto_storer`/`storer` on `V2.Core.AccountUpdateParams`. `PaymentAttemptRecord`/`PaymentRecord` card `description`/`iin`/`issuer` become optional, and `Billing.CreditGrant.priority` becomes required ([source](https://github.com/stripe/stripe-node/releases/tag/v22.3.0))
  - not used: searched `stored_credential_usage`, `CreditGrant`, `V2.Core` (no hits) and `PaymentRecord`. The only `PaymentRecord` hits are the repo's own `StoredPaymentRecord`/`createPaymentRecord` in `db/Database.ts`, not the Stripe resource; the repo never calls `paymentRecords.`.
- **behavior change (types)**: the CJS companion namespace now resolves nested types at all depths ([source](https://github.com/stripe/stripe-node/releases/tag/v22.3.0), [#2765](https://github.com/stripe/stripe-node/pull/2765))
  - not used: the repo is ESM (`"type": "module"`) and uses only `Stripe.Checkout.Session`, `Stripe.Checkout.SessionCreateParams` and `Stripe.Event`. These type-check on 23.0.0 (see above).

## stripe 22.3.1

- **breaking (types)**: `Stripe.HttpClient` and `Stripe.HttpClientResponse` are now exported as interfaces, not classes. Dropped type exports are restored (`StripeConfig`, `HttpAgent`, `Webhooks`, etc.) ([source](https://github.com/stripe/stripe-node/releases/tag/v22.3.1), [#2779](https://github.com/stripe/stripe-node/pull/2779))
  - not used: searched `HttpClient`, `httpClient`, `createNodeHttpClient`. The repo passes only `httpAgent` (an `https.Agent`, `payment.ts:162`), which still type-checks as `HttpAgent` on 23.0.0.
- **behavior change**: `Retry-After` header support is removed (it was a no-op; the API never sends it) ([source](https://github.com/stripe/stripe-node/releases/tag/v22.3.1), [#2781](https://github.com/stripe/stripe-node/pull/2781))
  - not used: searched `maxNetworkRetries`, `Retry-After`. The repo keeps default retry settings.

## stripe 22.3.2

- **behavior change**: API error fields are now generated from the OpenAPI spec, which adds fields such as `advice_code` and `network_advice_code` ([source](https://github.com/stripe/stripe-node/releases/tag/v22.3.2), [#2783](https://github.com/stripe/stripe-node/pull/2783))
  - not used: the repo reads only `type`, `code` and `requestId` from errors (`payment.ts:50-52`). I confirmed in the 23.0.0 package's `esm/Error.js` that these are still set (`this.type`, `this.code`, `this.requestId`).
- **behavior change**: the source hash in telemetry is replaced by a telemetry UUID ([source](https://github.com/stripe/stripe-node/releases/tag/v22.3.2))
  - not used: searched `telemetry`, `enableTelemetry`. No hits.

## stripe 22.4.0

- **behavior change**: the pinned API version changes to `2026-07-29.dahlia` (additive minor) ([source](https://github.com/stripe/stripe-node/releases/tag/v22.4.0))
  - not used directly: covered under 23.0.0.
- **breaking (types)**: support is removed for `dynamic_tax_rates` on `Checkout.SessionCreateParams.line_items[]` and for `proof_of_registration` on `AccountCreateParams.documents` ([source](https://github.com/stripe/stripe-node/releases/tag/v22.4.0))
  - not used: searched `dynamic_tax_rates`, `proof_of_registration`. The repo's `line_items` use only `quantity` and `price_data` (`stripe-payments.ts:131-143`).
- **behavior change (types)**: a shared `OtherString` type now annotates non-exhaustive enums ([source](https://github.com/stripe/stripe-node/releases/tag/v22.4.0), [#2786](https://github.com/stripe/stripe-node/pull/2786))
  - not used: the repo's `event.type` narrowing (`app.ts:2051-2054`) and `session.status` comparison (`payment.ts:429`) type-check on 23.0.0.

## stripe 22.5.0

- **behavior change**: when `CLAUDECODE` or `CLAUDE_CODE_CHILD_SESSION` is set, the SDK writes a `<claude-code-hint .../>` line to stderr at module load ([source](https://github.com/stripe/stripe-node/releases/tag/v22.5.0), [#2805](https://github.com/stripe/stripe-node/pull/2805))
  - not used: this is stderr noise only, in agent-run sessions. `payment.test.ts:35` mocks `stripe`. `app.test.ts` may load the real module, but no test asserts on stderr (searched `onConsoleLog`, `stderr`, `CLAUDECODE`). No change needed.
- **deprecation/addition**: adds `stripe.webhooks.constructEventWithoutVerification`, `stripe.constructEventWithoutVerification` and `parseEventNotificationWithoutVerification` ([source](https://github.com/stripe/stripe-node/releases/tag/v22.5.0))
  - not used: searched `WithoutVerification`. (The top-level `stripe.constructEventWithoutVerification` is removed again in 23.0.0.)

## stripe 22.6.0

- **behavior change**: the pinned API version changes to `2026-08-26.dahlia` (additive minor) ([source](https://github.com/stripe/stripe-node/releases/tag/v22.6.0))
  - not used directly: covered under 23.0.0.
- **behavior change**: when the server drops the connection mid-body, the SDK now throws a connection error instead of hanging forever ([source](https://github.com/stripe/stripe-node/releases/tag/v22.6.0), [#2815](https://github.com/stripe/stripe-node/pull/2815))
  - not used (beneficial, no code change): a hung `checkout.sessions.create` (`payment.ts:286`) or `balance.retrieve` (`payment.ts:182`) now rejects. The rejection lands in the existing `catch` (`payment.ts:297-309`, `:188-197`) and is classified as `stripe_connection_failed` (`payment.ts:56`).
- **breaking**: serializing a V2 discriminated-union param without a string discriminator now throws ([source](https://github.com/stripe/stripe-node/releases/tag/v22.6.0), [#2801](https://github.com/stripe/stripe-node/pull/2801))
  - not used: searched `v2.`, `V2.`. The repo uses no V2 APIs.
- **breaking (types)**: support is removed for `cryptogram` on `PaymentAttemptRecord`/`PaymentRecord...three_d_secure`, and `PaymentIntent.allowed_payment_method_types`/`SetupIntent.allowed_payment_method_types` become required ([source](https://github.com/stripe/stripe-node/releases/tag/v22.6.0))
  - not used: searched `cryptogram`, `three_d_secure`, `allowed_payment_method_types`. The repo never builds PaymentIntent objects (it only reads `session.payment_intent` as a string ID).
- **addition**: `EventNotificationHandler` for thin events ([source](https://github.com/stripe/stripe-node/releases/tag/v22.6.0), [#2818](https://github.com/stripe/stripe-node/pull/2818))
  - not used: searched `EventNotificationHandler`, `parseEventNotification`. The repo uses snapshot events through `constructEvent`.

## stripe 22.6.1

Nothing in scope ([source](https://github.com/stripe/stripe-node/releases/tag/v22.6.1)). The release has secure multipart boundaries (no file uploads in the repo: searched `files.create`), a GET/DELETE `Decimal` coercion fix (no GET/DELETE params used), and requestor URL hardening (internal).

## stripe 22.6.2

- **behavior change**: `constructEvent` now validates that the webhook secret is non-empty and throws otherwise ([source](https://github.com/stripe/stripe-node/releases/tag/v22.6.2), [#2841](https://github.com/stripe/stripe-node/pull/2841))
  - not used: the repo already rejects empty secrets before calling the SDK. The env value is `.trim()`ed (`stripe-payments.ts:43`), and `assertWebhookSecret()` throws `stripe_webhook_not_configured` on a falsy value (`payment.ts:355-365`) before `constructEvent` (`payment.ts:340-344`).

## stripe 23.0.0

Sources: [GitHub release v23.0.0](https://github.com/stripe/stripe-node/releases/tag/v23.0.0) (which defers to the changelog), [CHANGELOG.md#23.0.0](https://github.com/stripe/stripe-node/blob/v23.0.0/CHANGELOG.md#23-0-0), and the [Endive API changelog](https://docs.stripe.com/changelog/endive) (the major API version this SDK pins). There is no separate stripe-node v23 migration guide; the changelog's ⚠️ items are the breaking list.

- [ ] **breaking (API version)**: the pinned API version changes from `2026-05-27.dahlia` (installed 22.2.0, see `esm/apiVersion.js`) to **`2026-09-30.endive`**, a new major API release with breaking changes ([source](https://github.com/stripe/stripe-node/blob/v23.0.0/CHANGELOG.md#23-0-0), [Endive changelog](https://docs.stripe.com/changelog/endive))
  - affected: `apps/desktop/src/backend/services/payment.ts:158`. `new Stripe(...)` sets no `apiVersion`, so after the bump every request (`balance.retrieve` `:182`, `checkout.sessions.create` `:286`) is sent as `Stripe-Version: 2026-09-30.endive`. **No code change required.** I checked every Endive breaking change against the request params in `stripe-payments.ts:122-144` and the fields read in `payment.ts:382-431` / `app.ts:2051-2054` (see the items below); none touch them. Required action: after upgrading, run one test-mode Checkout end to end (`stripe listen --forward-to .../api/webhooks/stripe`), complete one session and let one expire, to confirm the `paid` and `expired` paths still work. Do not add a hard-coded `apiVersion` (the repo deliberately follows the SDK pin).
  - note on webhooks: webhook payloads use the **webhook endpoint's** API version (set in the Stripe Dashboard or by the Stripe CLI), not the SDK pin. `constructEvent` only verifies the signature and parses. The repo reads only `event.id`, `event.type`, `data.object.id`, `data.object.metadata.paymentId`, `data.object.payment_intent` and `data.object.status`, which are stable across dahlia and endive. No change is needed for the repo itself; no endpoint is created in code (searched `webhookEndpoints`).
- **breaking (API, Endive)**: `payment_method_types` is removed from Checkout Sessions, PaymentIntents and SetupIntents (use dynamic payment methods, `allowed_payment_method_types` or `excluded_payment_method_types`) ([source](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions), [SDK changelog](https://github.com/stripe/stripe-node/blob/v23.0.0/CHANGELOG.md#23-0-0))
  - not used: searched `payment_method_types`, `allowed_payment_method_types`, `excluded_payment_method_types`. The repo already relies on Dashboard-configured dynamic payment methods (README "Apple Pay, Google Pay, Link, and cards are handled by Stripe-hosted Checkout and the payment methods enabled in the Stripe Dashboard").
- **breaking (API, Endive)**: adds a Failed Tax Calculation error (Tax/Checkout) ([source](https://docs.stripe.com/changelog/endive/2026-09-30/failed-tax-calculation-error))
  - not used: searched `automatic_tax`, `tax_details`, `tax_rates`. The repo does not enable Stripe Tax on Checkout. If it were triggered, any new error code would fall through to the generic `code ?? "stripe_checkout_failed"` branch (`payment.ts:83-88`).
- **breaking (API, Endive)**: Bancontact `setup_future_usage` on Checkout widens from `'none'` to `'none'|'off_session'` (Bancontact details are now saved for off-session SEPA) ([source](https://docs.stripe.com/changelog/endive/2026-09-30/bancontact-off-session-payments-checkout))
  - not used: searched `payment_method_options`, `setup_future_usage`, `bancontact`.
- **breaking (API, Endive)**: other Endive breaking changes cover the billing cycle anchor format (`SubscriptionUpdateParams`/`SubscriptionResumeParams`/`InvoiceCreatePreviewParams.billing_cycle_anchor`), Connect account rejection reasons (`AccountRejectParams.reason` string→enum) and requirements errors, Financial Connections `countries`→`country`, removal of PayTo `PaymentMethodUpdateParams.payto`, `Charge.payment_method_details.card.mandate` string→expandable, nullable Radar `PaymentEvaluation` scores, the SEPA debit address requirement, 3DS `data_share_only`, BLIK decline codes, India mandates, dispute evidence page limits, Reserve enums and V2 AccountLink `configurations` ([source](https://docs.stripe.com/changelog/endive), [SDK changelog](https://github.com/stripe/stripe-node/blob/v23.0.0/CHANGELOG.md#23-0-0))
  - not used: searched `billing_cycle_anchor`, `subscriptions.`, `accounts.`, `financialConnections`, `payto`, `mandate`, `radar`, `sepa`, `three_d_secure`, `blik`, `disputes`, `reserve`, `accountLinks`, `charges.`. No hits in `apps/`, `packages/` or `tools/`.
- **breaking (stripe.js, Endive)**: the payment request button is deprecated. Elements removes `paymentMethodTypes` and sets `canConfirm` false while updates are pending ([source](https://docs.stripe.com/changelog/endive))
  - not used: the renderer never loads stripe.js or Elements (searched `@stripe/stripe-js`, `loadStripe`, `Elements`). Checkout is Stripe-hosted via `session.url`.
- **breaking**: `Stripe.constructEventWithoutVerification()` is removed (use `stripe.webhooks.constructEventWithoutVerification`) ([source](https://github.com/stripe/stripe-node/pull/2862))
  - not used: searched `WithoutVerification`. The repo uses `webhooks.constructEvent` (`payment.ts:340`).
- **breaking (types)**: the `ErrorType` export is removed from the top-level client (use `Stripe.errors`) ([source](https://github.com/stripe/stripe-node/pull/2865))
  - not used: searched `ErrorType`, `Stripe.errors`, `Stripe.StripeError`. Error handling is duck-typed on `error.type` strings (`payment.ts:50-81`).
- **breaking (types)**: the V1-only `object`/`has_more`/`url` fields are removed from `Stripe.V2List<T>`, and V2 request address params are now operation-specific ([source](https://github.com/stripe/stripe-node/pull/2856))
  - not used: searched `V2List`, `v2.`, `V2.`.
- **behavior change**: incomplete or stalled response bodies now throw `StripeConnectionError` instead of `StripeAPIError` ([source](https://github.com/stripe/stripe-node/pull/2868))
  - not used (beneficial, no code change): `payment.ts:56-62` already maps `type === "StripeConnectionError"` to `stripe_connection_failed` ("could not reach Stripe"). These failures previously surfaced as a generic `stripe_checkout_failed` and now get the more accurate connection message. `payment.test.ts:236-238` already covers this path with a mocked error, and no test asserts the old `StripeAPIError` classification (searched `StripeAPIError`).
- **behavior change**: `webhooks.signature.verifyHeader()`/`verifyHeaderAsync()` now apply `DEFAULT_TOLERANCE` when `tolerance` is omitted, and passing `0` to `constructEvent` now skips the tolerance check ([source](https://github.com/stripe/stripe-node/pull/2876))
  - not used: searched `verifyHeader`, `tolerance`. `constructEvent(rawBody, signature, secret)` at `payment.ts:340-344` passes no tolerance, so it keeps the default 300s tolerance.
- **requirement**: Node 18 support is dropped and Node `>=20` is required (`engines.node`). Peer `@types/node >=20` ([source](https://github.com/stripe/stripe-node/blob/v23.0.0/CHANGELOG.md#23-0-0), `npm view stripe@23.0.0 engines peerDependencies`)
  - not used (already satisfied): `@types/node ^22.15.3` (`apps/desktop/package.json:81`), Electron 35.7.5 (Node 22), local Node v22.22.3. No `engines`, `.nvmrc` or `.node-version` pins Node 18.
- **behavior change**: the `STRIPE_SUPPRESS_NOTICES=true` env var now suppresses `Stripe-Notice` warnings (emitted via `process.emitWarning`) in test/sandbox mode, except under a detected AI agent ([source](https://github.com/stripe/stripe-node/pull/2853))
  - not used: searched `STRIPE_SUPPRESS_NOTICES`, `emitWarning`. Optional: add it to `.env.example` if test-mode notices become noisy in the Electron console. Not required.
- **behavior change**: `NodeHttpClient` works with Nock 14/MSW interceptors (it no longer hangs). `EventNotificationHandler` callback clients are scoped to the event's account ([source](https://github.com/stripe/stripe-node/blob/v23.0.0/CHANGELOG.md#23-0-0))
  - not used: searched `nock`, `msw`, `EventNotificationHandler`. Tests mock `stripe` with `vi.mock` instead (`payment.test.ts:35`).
- **requirement (packaging)**: `package.json` `exports` gains a new `extensibility` condition entry. The `default.import` → `./esm/stripe.esm.node.js` mapping is unchanged ([source](https://github.com/stripe/stripe-node/blob/v23.0.0/package.json), `npm pack stripe@23.0.0`)
  - not used: Vite, tsup and Node do not pass an `extensibility` condition. The ESM default import at `payment.ts:1` resolves to the same entry as before.
