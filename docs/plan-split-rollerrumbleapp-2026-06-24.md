# Plan: Split RollerRumbleApp at its clean seams (pass 1 of 2)

> Addresses Candidate 3 ("Split the RollerRumbleApp god class at its natural seams")
> from `docs/architecture-review-2026-06-23.html`. Candidates 1 (ActiveRace) and 2
> (SnapshotAssembler) are already shipped.

## Execution status (updated 2026-06-25)

**Pass 1 complete.** All three leaf services are extracted; the full quality gate is green.

| Service                 | State      | Notes                                                                                        |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| **AuthService**         | ✅ Shipped | `services/auth.ts`. Extracted together with PaymentService in one effort.                    |
| **PaymentService**      | ✅ Shipped | `services/payment.ts`. App keeps the webhook→queue orchestration (see §2 + ADR 0003).        |
| **NotificationService** | ✅ Shipped | `services/notifications-service.ts`. Triggers + admin target resolution stay in app (see §3). |

Deviations from the decisions table below, all deliberate and approved:

- **Auth + Payment shipped as one unit**, not two sequential PRs — `auth-payment.test.ts`
  white-box-tested both, so they shared a verification boundary.
- **Verification reversed for Auth/Payment** (see Verification row): the locked "existing
  tests pass untouched" net was infeasible because `auth-payment.test.ts` drove
  `RollerRumbleApp.prototype` directly. It was deleted and replaced by fresh
  `auth.test.ts` + `payment.test.ts` covering the same 14 cases.
- **Executed inline by Opus**, not via Sonnet subagents (see Delegation row).
- **Not "move-only".** Extracted methods were reshaped into leaf signatures (return plain
  results, never `AppSnapshot`) per ADR 0003 — the table's "strict move-only" framing was
  wrong; the ADR's leaf-module contract is what governs.
- **`AppHttpError` extracted to `services/http-error.ts`** to break the app↔services import
  cycle; `app.ts` re-exports it so `server.ts` imports stay byte-stable. Services import it
  from `./http-error`. Not anticipated in the original plan; reuse this for pass 2.
- **`createAccountlessRacerSession` stayed in the app** (not moved to AuthService) — it is
  welded to `registerRacerRecord`, shared with the non-auth `registerRacer` path.
- **NotificationService signals re-broadcast via an injected `onPushDelivered` callback**
  (`new NotificationService(db, () => this.emitSnapshot())`) instead of emitting — the async
  push-dispatch updates delivery state, then calls the hook, mirroring the sensor/OS2L adapter
  callbacks. Keeps the leaf ignorant of `AppSnapshot`.
- `app.ts` is **2466 lines** after all three (auth.ts 392, payment.ts 455,
  notifications-service.ts 144, http-error.ts 9; down from 3177).

## Decisions locked during grilling

| Decision                  | Choice                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                     | **Pragmatic split** — app stays the orchestrator, not a thin 5-method coordinator                                                                                                                                                                                                                                   |
| This pass                 | **PaymentService, AuthService, NotificationService** (the three clean leaves)                                                                                                                                                                                                                                       |
| Queue/Tournament          | **Deferred** to pass 2; capture cascade-coordination contract in an ADR                                                                                                                                                                                                                                             |
| Service contract          | Service takes a **narrow `Pick<AppDatabase,…>` port**, owns its domain writes, returns **plain domain results** (never `AppSnapshot`), never emits                                                                                                                                                                  |
| Snapshot/notify ownership | Stays in app: `emitSnapshot()`, `return this.getSnapshot()` wrappers, and the _trigger_ logic (`runQueueNotificationTriggers`, `notifyTournamentStarted`)                                                                                                                                                           |
| Verification              | _(superseded for Auth/Payment — see status section)_ Originally: strict move-only with existing tests untouched. Actual: fresh `auth.test.ts` + `payment.test.ts` replace `auth-payment.test.ts`. NotificationService can still go move-only with `notifications.test.ts` as the net. Full quality gate either way. |
| Delegation                | _(superseded — executed inline by Opus)_ Originally: sequential Sonnet subagents. A subagent is still an option for the self-contained NotificationService extraction.                                                                                                                                              |

## Why this shape (the core finding)

`RollerRumbleApp` isn't five tidy domains — it's glued by four cross-cutting concerns:
`this.db` (217 calls), snapshot broadcast (105 calls), notification triggers, and
**`handleRaceFinalized` — the finalization cascade** (race-end → tournament outcome →
result presentation → auto-stage → queue notifications → broadcast).

Payment/Auth/Notification sit _outside_ that cascade, so they lift cleanly.
Queue/Tournament are _inside_ it, so they wait for a deliberate coordination decision.

## The three extractions

Each follows the same recipe. `RollerRumbleApp` keeps a field
(`this.payment = new PaymentService(...)`, mirroring `this.tournaments`) and thin
delegating wrappers, so the **public surface `server.ts` depends on is byte-stable**
(`getRacerAuthSession`, `handleStripeWebhook`, `updateRacerPaymentStatus`,
`sendAdminNotification`, etc.).

### 1. AuthService ✅ _(shipped — `services/auth.ts`)_

- **Owns:** `passkeyChallenges` map, session secret.
- **Methods moved:** `getPasskeyRequestContext`, `createRacerSessionToken`,
  `getRacerFromSessionToken`, `getRacerAuthSession`, `getRacerSessionSecret`,
  `rememberPasskeyChallenge`, `consumePasskeyChallenge`, `start/finishPasskeySignIn`,
  `start/finishPasskeyRegistration`. The `finish*` methods now **return `Racer`** (not
  `{ racer, snapshot }`); the app wrapper does the `emitSnapshot()` + builds the response.
- **Port:** `AuthStore = Pick<AppDatabase, 'getSetting' | 'setSetting' | 'getRacer' |
'getActiveEvent' | 'ensureEventRegistration' | 'findRacerByIdentity' |
'listPasskeyCredentialsForRacer' | 'getPasskeyCredentialByCredentialId' |
'updatePasskeyCredentialUse' | 'updateRacerRegistration' | 'createOrUpdateRacer' |
'createPasskeyCredential'>`.
- **Stayed in app:** `createAccountlessRacerSession` — welded to `registerRacerRecord`
  (shared with the non-auth `registerRacer` path), so it is not an auth leaf.

### 2. PaymentService ✅ _(shipped — `services/payment.ts`)_

The leaf owns Stripe client state + payment/Checkout bookkeeping; **the app keeps the
webhook→queue orchestration** (it calls `signUpQueue`, which is cascade-adjacent — per
ADR 0003 the coordinator owns anything that fans into the queue).

- **Owns:** `stripeClient`, `stripeSecretKey`, `stripeExtraCaCertFile`, and the moved
  `getStripeFailureDetails` helper.
- **Service surface (leaf, no snapshots):** `getStripeSetupStatus`, `testStripeConnection`,
  `assertPaidForEvent`, `updateActiveEventPaymentConfig` (→ void), `updateRacerPaymentStatus`
  (→ void), `createCheckoutForQueue` (→ `{ paymentId, checkoutUrl }`), `cancelCheckoutPayment`
  (→ `boolean` changed), and the webhook leaf ops `parseWebhookEvent`, `isWebhookProcessed`,
  `markWebhookProcessed`, `applyCheckoutCompleted` (→ `StoredPaymentRecord | null`),
  `applyCheckoutExpired`, `markCheckoutQueueFailed`. Private: `getStripeConfig`,
  `getStripeClient`, `resolvePaymentForStripeSession`, `assertWebhookSecret`.
- **Stayed in app (orchestration):** `signUpQueueForRacer`, `handleStripeWebhook`,
  `completeStripeCheckoutSession`, `queuePaidStripePayment` — each now calls `this.payment.*`
  leaf ops. e.g. `handleStripeWebhook` = `parseWebhookEvent` → `isWebhookProcessed` →
  (`completeStripeCheckoutSession` → `applyCheckoutCompleted` → `queuePaidStripePayment` →
  `markCheckoutQueueFailed` on failure | `applyCheckoutExpired`) → `markWebhookProcessed` →
  `emitSnapshot`.
- **Port:** `PaymentStore = Pick<AppDatabase, 'getActiveEvent' | 'getEventRacerPayment' |
'updateEventRacerPayment' | 'updateEventPaymentConfig' | 'createPaymentRecord' |
'updatePaymentRecord' | 'getPaymentRecord' | 'getPaymentByStripeCheckoutSessionId' |
'hasProcessedWebhookEvent' | 'markWebhookEventProcessed'>`.

### 3. NotificationService ✅ _(shipped — `services/notifications-service.ts`)_

The leaf owns web-push config, racer push-subscription bookkeeping, the racer inbox, and
push dispatch. **Cross-domain "who to notify" resolution and the triggers stay in the app**,
since they reach into queue/tournament state and event racers.

- **Service surface (leaf, no snapshots):** `getNotificationConfig`,
  `save/revokeRacerPushSubscription` (→ `NotificationConfig`), `listRacerNotifications`,
  `markRacerNotificationRead` (→ `RacerNotification[]`), `createNotificationAndDispatch`
  (→ delivery count; public so app triggers call it). Private: `dispatchNotificationPushes`.
- **Re-broadcast seam:** dispatch is async fire-and-forget; after it updates delivery state it
  calls an injected `onPushDelivered` callback (`new NotificationService(db, () =>
  this.emitSnapshot())`) instead of emitting — the established sensor/OS2L adapter idiom.
- **Stayed in app:** `resolveAdminNotificationTargets` + `sendAdminNotification` (cross-domain
  target resolution + orchestration), and the triggers `runQueueNotificationTriggers` /
  `notifyTournamentStarted` — all call `this.notifications.createNotificationAndDispatch(...)`.
- **Port:** `NotificationStore = Pick<AppDatabase, 'getActiveEvent' | 'ensureEventRegistration'
  | 'getRacer' | 'upsertPushSubscription' | 'revokePushSubscription' |
  'listActivePushSubscriptionsForRacers' | 'listNotificationsForRacer' | 'markNotificationRead'
  | 'createNotification' | 'getNotification' | 'listNotificationDeliveries' |
  'updateNotificationDeliveryPushStatus'>`.
- **Tests:** `notifications.test.ts` (pure helpers) untouched; added
  `notifications-service.test.ts` (8 cases) covering config, subscription CRUD, inbox, and the
  dispatch→`onPushDelivered` seam.

## How pass 1 was executed

All three were extracted **inline by Opus** rather than via Sonnet subagents: Auth + Payment
because the prototype-coupled tests and payment/queue weld needed whole-file context, and
NotificationService alongside them for continuity. The leaf-module recipe (narrow `Pick<>`
port, plain returns, `AppHttpError` from `./http-error`, byte-stable public wrappers, no
`emitSnapshot` in the leaf) is the reusable template for pass 2.

## Deferred to pass 2 (ADR `0003-finalization-cascade-coordination`)

Documents: who owns `handleRaceFinalized`, how `applyTournamentRaceOutcome` /
`maybeAutoStageNextRace` / `reconcileQueueRaceStatuses` move when QueueService /
TournamentService take their share, and that the cascade stays coordinator-owned.
Written so pass 2 starts from a contract, not a blank page.

## Sequencing

1. ✅ Draft ADR 0003 (the cascade contract).
2. ✅ AuthService + PaymentService — extracted together, behind the full gate.
3. ✅ NotificationService — behind the full gate.

`app.ts` went **3177 → 2466** across pass 1, landing just above the original ~2300–2400
estimate: the kept orchestration (webhook→queue, admin-notification target resolution) and the
thin emit wrappers are larger than the leaf bodies they delegate to. The point of the split was
legibility and testable leaves, not a line-count target — pass 1 added 1000 lines of focused,
directly-unit-tested service code (`auth.ts` 392, `payment.ts` 455, `notifications-service.ts`
144, `http-error.ts` 9) carved out of the god class.
