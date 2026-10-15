import Stripe from "stripe";
import {
  DEFAULT_PAYMENT_CURRENCY,
  STRIPE_MIN_PAYMENT_AMOUNT_CENTS
} from "@roller-rumble/shared/constants";
import type {
  HostSetEventPaymentStatus,
  Racer,
  RacerQueueSignupInput,
  StripeConnectionTestResult,
  UnracedRefundCandidate,
  UnracedRefundOutcome,
  UnracedRefundPreview,
  UnracedRefundResult,
  UpdateEventPaymentConfigInput
} from "@roller-rumble/shared/types";
import { nowIso } from "@roller-rumble/shared/utils";
import type { AppDatabase, StoredPaymentRecord } from "../db/Database";
import { AppHttpError } from "./http-error";
import {
  assertEventPaymentConfig,
  buildStripeCheckoutSessionParams,
  createStripeHttpAgent,
  getStripeRuntimeConfig,
  normalizePaymentCurrency,
  StripeCaCertificateError,
  type StripeRuntimeConfig
} from "./stripe-payments";

interface StripeFailureDetails {
  code: string;
  message: string;
  requestId?: string | null;
  type?: string | null;
}

function valueFromRecord(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : null;
}

/** How to describe a Stripe failure that is not a connection, key or permission problem. */
interface StripeOperationFailure {
  code: string;
  messagePrefix: string;
}

const CHECKOUT_FAILURE: StripeOperationFailure = {
  code: "stripe_checkout_failed",
  messagePrefix: "Could not start Stripe Checkout."
};

const REFUND_FAILURE: StripeOperationFailure = {
  code: "stripe_refund_failed",
  messagePrefix: "Stripe could not refund this payment."
};

function getStripeFailureDetails(
  error: unknown,
  operation: StripeOperationFailure = CHECKOUT_FAILURE
): StripeFailureDetails {
  if (error instanceof StripeCaCertificateError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : "Stripe returned an unexpected error.";
  const type = valueFromRecord(error, "type");
  const code = valueFromRecord(error, "code");
  const requestId = valueFromRecord(error, "requestId");
  const stripeType = typeof type === "string" ? type : null;
  const stripeCode = typeof code === "string" ? code : null;

  if (stripeType === "StripeConnectionError") {
    return {
      code: "stripe_connection_failed",
      message: `Roller Rumble could not reach Stripe. ${message}`,
      requestId: typeof requestId === "string" ? requestId : null,
      type: stripeType
    };
  }

  if (stripeType === "StripeAuthenticationError") {
    return {
      code: "stripe_authentication_failed",
      message: `Stripe rejected the configured secret key. ${message}`,
      requestId: typeof requestId === "string" ? requestId : null,
      type: stripeType
    };
  }

  if (stripeType === "StripePermissionError") {
    return {
      code: "stripe_permission_failed",
      message: `Stripe rejected this operation for the configured account. ${message}`,
      requestId: typeof requestId === "string" ? requestId : null,
      type: stripeType
    };
  }

  return {
    code: stripeCode ?? operation.code,
    message: `${operation.messagePrefix} ${message}`,
    requestId: typeof requestId === "string" ? requestId : null,
    type: stripeType
  };
}

/**
 * Payments that took the racer's money and have not been refunded yet. `queue_failed` was paid
 * but never queued; `refund_failed` is offered again so the host can retry.
 */
const REFUNDABLE_PAYMENT_STATUSES = new Set<StoredPaymentRecord["status"]>([
  "paid",
  "queue_failed",
  "refund_failed"
]);

/**
 * Whether Stripe answered a refund request with a definite refusal, so no refund was made and a
 * retry must use a new idempotency key (Stripe replays a key's first answer, errors included, for
 * 24 hours). Connection failures and 5xx answers leave it unknown whether the refund was made,
 * and a 409 means the same key is still in flight, so those keep the key.
 */
function isDefiniteStripeRefusal(error: unknown): boolean {
  const statusCode = valueFromRecord(error, "statusCode");
  return (
    typeof statusCode === "number" && statusCode >= 400 && statusCode < 500 && statusCode !== 409
  );
}

/**
 * Narrow database port for Stripe payment + Checkout bookkeeping. Expressed as a
 * `Pick<AppDatabase, …>` so it tracks the real signatures at compile time and
 * documents exactly which tables this leaf service touches.
 */
export type PaymentStore = Pick<
  AppDatabase,
  | "getActiveEvent"
  | "getEventRacerPayment"
  | "updateEventRacerPayment"
  | "updateEventPaymentConfig"
  | "createPaymentRecord"
  | "updatePaymentRecord"
  | "getPaymentRecord"
  | "getPaymentByStripeCheckoutSessionId"
  | "listEventPaymentRecords"
  | "listResults"
  | "getRacer"
  | "hasProcessedWebhookEvent"
  | "markWebhookEventProcessed"
>;

/**
 * Leaf module owning Stripe client lifecycle and the payment-record / Checkout
 * bookkeeping behind queue entrance fees. It never emits snapshots and never
 * knows the `AppSnapshot` shape: methods return plain domain results (payment
 * records, parsed Stripe events, booleans) and the caller (`RollerRumbleApp`)
 * owns the queue cascade and snapshot broadcast.
 */
export class PaymentService {
  private stripeClient: Stripe | null = null;
  private stripeSecretKey: string | null = null;
  private stripeExtraCaCertFile: string | null = null;
  private refundRunInProgress = false;

  constructor(private readonly db: PaymentStore) {}

  private getStripeConfig(): StripeRuntimeConfig {
    return getStripeRuntimeConfig();
  }

  getStripeSetupStatus(): StripeRuntimeConfig {
    const config = this.getStripeConfig();
    return {
      configured: config.configured,
      hasSecretKey: config.hasSecretKey,
      hasWebhookSecret: config.hasWebhookSecret,
      hasExtraCaCertFile: config.hasExtraCaCertFile,
      extraCaCertFile: config.extraCaCertFile,
      publicRacerUrl: config.publicRacerUrl,
      message: config.message
    };
  }

  private getStripeClient(): Stripe {
    const config = this.getStripeConfig();
    if (!config.secretKey) {
      throw new AppHttpError(
        "Stripe Checkout is not configured yet. Please see the host.",
        503,
        "stripe_not_configured"
      );
    }

    const extraCaCertFile = config.extraCaCertFile ?? null;
    if (
      !this.stripeClient ||
      this.stripeSecretKey !== config.secretKey ||
      this.stripeExtraCaCertFile !== extraCaCertFile
    ) {
      const httpAgent = createStripeHttpAgent(extraCaCertFile);
      this.stripeClient = new Stripe(config.secretKey, {
        appInfo: {
          name: "Roller Rumble"
        },
        ...(httpAgent ? { httpAgent } : {})
      });
      this.stripeSecretKey = config.secretKey;
      this.stripeExtraCaCertFile = extraCaCertFile;
    }

    return this.stripeClient;
  }

  async testStripeConnection(): Promise<StripeConnectionTestResult> {
    const config = this.getStripeConfig();
    if (!config.configured) {
      return {
        ok: false,
        code: "stripe_not_configured",
        message: config.message
      };
    }

    try {
      await this.getStripeClient().balance.retrieve();
      return {
        ok: true,
        code: "stripe_ready",
        message: "Roller Rumble reached Stripe successfully."
      };
    } catch (error) {
      const failure = getStripeFailureDetails(error);
      console.warn("[stripe] connection test failed", failure);
      return {
        ok: false,
        code: failure.code,
        message: failure.message,
        requestId: failure.requestId
      };
    }
  }

  /**
   * Validates and persists the active event's queue-payment configuration.
   * Throws `AppHttpError` when payment is required without a valid amount. The
   * caller broadcasts the snapshot.
   */
  updateActiveEventPaymentConfig(input: UpdateEventPaymentConfigInput): void {
    const amountCents = input.paymentAmountCents ?? null;
    if (
      input.paymentRequiredForQueue &&
      (amountCents === null || amountCents < STRIPE_MIN_PAYMENT_AMOUNT_CENTS)
    ) {
      throw new AppHttpError(
        "Set an entrance fee of at least $0.50 before requiring payment.",
        400,
        "payment_amount_required"
      );
    }

    const activeEvent = this.db.getActiveEvent()!;
    this.db.updateEventPaymentConfig(activeEvent.id, {
      paymentRequiredForQueue: input.paymentRequiredForQueue,
      paymentAmountCents: amountCents,
      paymentCurrency: normalizePaymentCurrency(input.paymentCurrency ?? DEFAULT_PAYMENT_CURRENCY)
    });
  }

  updateRacerPaymentStatus(
    racerId: string,
    input: {
      status: HostSetEventPaymentStatus;
      note?: string;
      providerReference?: string;
    }
  ): void {
    const activeEvent = this.db.getActiveEvent()!;
    this.db.updateEventRacerPayment(activeEvent.id, racerId, input);
  }

  assertPaidForEvent(eventId: string, racerId: string, message: string): void {
    const payment = this.db.getEventRacerPayment(eventId, racerId);
    if (!["paid", "waived"].includes(payment.status)) {
      throw new AppHttpError(message, 402, "payment_required");
    }
  }

  /**
   * Creates a Stripe Checkout session for the active event's entry fee and records
   * the pending payment. `queueIntent` is the queue spot to claim once Stripe
   * confirms payment, or `null` when the racer is paying the fee on its own from
   * the registration wizard. Returns the payment id and hosted checkout URL; the
   * caller assembles any response and snapshot.
   */
  async createCheckout(
    racer: Racer,
    queueIntent: RacerQueueSignupInput | null
  ): Promise<{ paymentId: string; checkoutUrl: string }> {
    const activeEvent = this.db.getActiveEvent()!;
    const config = this.getStripeConfig();
    if (!config.configured || !config.publicRacerUrl) {
      throw new AppHttpError(
        "Stripe Checkout is not configured yet. Please see the host.",
        503,
        "stripe_not_configured"
      );
    }

    let paymentConfig: { amountCents: number; currency: string };
    try {
      paymentConfig = assertEventPaymentConfig(activeEvent);
    } catch (error) {
      throw new AppHttpError(
        error instanceof Error ? error.message : "Payment amount is not configured.",
        400,
        "payment_amount_required"
      );
    }
    const { amountCents, currency } = paymentConfig;
    const payment = this.db.createPaymentRecord({
      eventId: activeEvent.id,
      racerId: racer.id,
      amountCents,
      currency,
      queueIntent
    });
    let session: Stripe.Checkout.Session;
    try {
      session = await this.getStripeClient().checkout.sessions.create(
        buildStripeCheckoutSessionParams({
          event: activeEvent,
          racer,
          paymentId: payment.id,
          amountCents,
          currency,
          publicRacerUrl: config.publicRacerUrl,
          queueIntent
        })
      );
    } catch (error) {
      const failure = getStripeFailureDetails(error);
      this.db.updatePaymentRecord(payment.id, {
        status: "failed",
        failureCode: failure.code,
        failureMessage: failure.message
      });
      console.warn("[stripe] checkout session creation failed", {
        ...failure,
        paymentId: payment.id
      });
      throw new AppHttpError(failure.message, 502, failure.code);
    }

    if (!session.url) {
      this.db.updatePaymentRecord(payment.id, {
        status: "failed",
        failureCode: "missing_checkout_url",
        failureMessage: "Stripe did not return a Checkout URL."
      });
      throw new AppHttpError("Could not start Stripe Checkout.", 502, "stripe_checkout_failed");
    }

    const updatedPayment = this.db.updatePaymentRecord(payment.id, {
      stripeCheckoutSessionId: session.id,
      checkoutUrl: session.url
    });
    return {
      paymentId: updatedPayment.id,
      checkoutUrl: session.url
    };
  }

  /**
   * Lists the active event's Stripe entrance fees paid by racers who have no finished race
   * result, so the host can refund the racers who never got to race. First asks Stripe about
   * any refund still pending, in case its webhook never reached the app.
   */
  async previewUnracedRefunds(): Promise<UnracedRefundPreview> {
    await this.settlePendingRefunds();
    return { candidates: this.listUnracedRefundCandidates() };
  }

  private async settlePendingRefunds(): Promise<void> {
    const activeEvent = this.db.getActiveEvent()!;
    const pending = this.db
      .listEventPaymentRecords(activeEvent.id)
      .filter((payment) => payment.status === "refund_pending" && payment.stripeRefundId);
    for (const payment of pending) {
      try {
        this.applyRefundUpdated(
          await this.getStripeClient().refunds.retrieve(payment.stripeRefundId!)
        );
      } catch (error) {
        // Leave it pending; the next review or Stripe's webhook settles it.
        console.warn("[stripe] pending refund check failed", {
          ...getStripeFailureDetails(error, REFUND_FAILURE),
          paymentId: payment.id
        });
      }
    }
  }

  /**
   * Refunds the candidates the host reviewed in `previewUnracedRefunds` through Stripe, one at a
   * time, and records each refund on the payment and the racer's event registration. Only the
   * reviewed `paymentIds` that are still eligible are refunded, so a racer who became eligible
   * after the review is never refunded without the host seeing them. The caller broadcasts the
   * snapshot.
   */
  async refundUnracedPayments(paymentIds: string[]): Promise<UnracedRefundResult> {
    if (this.refundRunInProgress) {
      throw new AppHttpError(
        "Refunds are already being sent. Wait for them to finish.",
        409,
        "refunds_in_progress"
      );
    }

    this.refundRunInProgress = true;
    try {
      const outcomes: UnracedRefundOutcome[] = [];
      const reviewed = new Set(paymentIds);
      const candidates = this.listUnracedRefundCandidates().filter((candidate) =>
        reviewed.has(candidate.paymentId)
      );
      for (const candidate of candidates) {
        outcomes.push(await this.refundCandidate(candidate));
      }
      return { outcomes };
    } finally {
      this.refundRunInProgress = false;
    }
  }

  private async refundCandidate(candidate: UnracedRefundCandidate): Promise<UnracedRefundOutcome> {
    const payment = this.db.getPaymentRecord(candidate.paymentId)!;
    const { paymentId, racerId, displayName, amountCents, currency } = candidate;
    const outcome = (
      status: UnracedRefundOutcome["status"],
      message: string | null
    ): UnracedRefundOutcome => ({
      paymentId,
      racerId,
      displayName,
      amountCents,
      currency,
      status,
      message
    });

    const failRefund = (code: string, message: string, refused: boolean): UnracedRefundOutcome => {
      this.db.updatePaymentRecord(payment.id, {
        status: "refund_failed",
        failureCode: code,
        failureMessage: message,
        ...(refused ? { refundAttempt: payment.refundAttempt + 1 } : {})
      });
      return outcome("refund_failed", message);
    };

    const paymentIntentId = payment.stripePaymentIntentId;
    if (!paymentIntentId) {
      return failRefund(
        "missing_payment_intent",
        "Roller Rumble has no Stripe payment reference for this payment. Refund it from the Stripe Dashboard.",
        false
      );
    }

    let refund: Stripe.Refund;
    try {
      refund = await this.getStripeClient().refunds.create(
        {
          payment_intent: paymentIntentId,
          metadata: {
            paymentId: payment.id,
            eventId: payment.eventId,
            racerId: payment.racerId
          }
        },
        // Retrying a request that never got an answer reuses the key, so it can't refund the
        // payment twice. Once Stripe refuses or fails a refund the attempt number moves on, so
        // the retry is a new request and not a replay of that answer.
        {
          idempotencyKey:
            payment.refundAttempt === 0
              ? `refund-${payment.id}`
              : `refund-${payment.id}-attempt-${payment.refundAttempt}`
        }
      );
    } catch (error) {
      // Refunded already, e.g. the app stopped after Stripe made the refund but before it was
      // recorded here, or the host refunded it from the Stripe Dashboard.
      if (valueFromRecord(error, "code") === "charge_already_refunded") {
        this.db.updatePaymentRecord(payment.id, {
          status: "refunded",
          refundIssuedAt: payment.refundIssuedAt ?? nowIso(),
          failureCode: null,
          failureMessage: null
        });
        this.markRacerRefunded(payment, payment.stripeRefundId ?? paymentIntentId);
        return outcome("refunded", "Stripe had already refunded this payment.");
      }

      const failure = getStripeFailureDetails(error, REFUND_FAILURE);
      console.warn("[stripe] refund failed", { ...failure, paymentId: payment.id });
      return failRefund(failure.code, failure.message, isDefiniteStripeRefusal(error));
    }

    // Card refunds usually settle at once; anything else waits for Stripe's refund webhook.
    const settled = refund.status === "succeeded";
    this.db.updatePaymentRecord(payment.id, {
      status: settled ? "refunded" : "refund_pending",
      stripeRefundId: refund.id,
      refundIssuedAt: nowIso(),
      failureCode: null,
      failureMessage: null
    });
    if (!settled) {
      return outcome("refund_pending", null);
    }

    this.markRacerRefunded(payment, refund.id);
    return outcome("refunded", null);
  }

  /**
   * Settles a refund this app issued from Stripe's refund webhook. Refunds made elsewhere, such
   * as the Stripe Dashboard, carry no payment id and are ignored.
   */
  applyRefundUpdated(refund: Stripe.Refund): void {
    const paymentId =
      typeof refund.metadata?.paymentId === "string" ? refund.metadata.paymentId : null;
    const payment = paymentId ? this.db.getPaymentRecord(paymentId) : null;
    if (payment?.stripeRefundId !== refund.id) {
      return;
    }

    if (refund.status === "succeeded" && payment.status === "refund_pending") {
      this.db.updatePaymentRecord(payment.id, { status: "refunded" });
      this.markRacerRefunded(payment, refund.id);
    } else if (refund.status === "failed" || refund.status === "canceled") {
      this.db.updatePaymentRecord(payment.id, {
        status: "refund_failed",
        failureCode: refund.failure_reason ?? refund.status,
        failureMessage: `Stripe could not complete the refund (${refund.failure_reason ?? refund.status}).`,
        refundAttempt: payment.refundAttempt + 1
      });
      // Only undo the "refunded" this refund put on the racer; a pending refund never set it.
      if (payment.status === "refunded") {
        this.db.updateEventRacerPayment(payment.eventId, payment.racerId, {
          status: "paid",
          note: "Stripe refund failed",
          providerReference: payment.stripePaymentIntentId ?? undefined
        });
      }
    }
  }

  private markRacerRefunded(payment: StoredPaymentRecord, refundId: string): void {
    this.db.updateEventRacerPayment(payment.eventId, payment.racerId, {
      status: "refunded",
      note: "Stripe refund",
      providerReference: refundId
    });
  }

  private listUnracedRefundCandidates(): UnracedRefundCandidate[] {
    const activeEvent = this.db.getActiveEvent()!;
    const racedRacerIds = new Set(
      this.db.listResults(activeEvent.id).map((result) => result.racerId)
    );
    return this.db
      .listEventPaymentRecords(activeEvent.id)
      .filter(
        (payment) =>
          REFUNDABLE_PAYMENT_STATUSES.has(payment.status) && !racedRacerIds.has(payment.racerId)
      )
      .map((payment) => ({
        paymentId: payment.id,
        racerId: payment.racerId,
        displayName: this.db.getRacer(payment.racerId)?.displayName ?? "Unknown racer",
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        failureMessage: payment.failureMessage ?? null
      }));
  }

  /**
   * Parses and verifies an incoming Stripe webhook payload into a typed event.
   * Throws `AppHttpError` for a missing signature or unconfigured webhook
   * secret.
   */
  parseWebhookEvent(rawBody: Buffer, signature?: string): Stripe.Event {
    if (!signature) {
      throw new AppHttpError("Missing Stripe signature.", 400, "stripe_signature_missing");
    }

    return this.getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      this.assertWebhookSecret()
    );
  }

  isWebhookProcessed(eventId: string): boolean {
    return this.db.hasProcessedWebhookEvent("stripe", eventId);
  }

  markWebhookProcessed(eventId: string, eventType: string): void {
    this.db.markWebhookEventProcessed("stripe", eventId, eventType);
  }

  private assertWebhookSecret(): string {
    const config = this.getStripeConfig();
    if (!config.webhookSecret) {
      throw new AppHttpError(
        "Stripe webhook secret is not configured.",
        503,
        "stripe_webhook_not_configured"
      );
    }
    return config.webhookSecret;
  }

  private resolvePaymentForStripeSession(
    session: Stripe.Checkout.Session
  ): StoredPaymentRecord | null {
    const paymentId =
      typeof session.metadata?.paymentId === "string" ? session.metadata.paymentId : null;
    return paymentId
      ? this.db.getPaymentRecord(paymentId)
      : this.db.getPaymentByStripeCheckoutSessionId(session.id);
  }

  /**
   * Marks the racer's payment and event registration paid for a completed
   * Checkout session. Returns the stored payment record so the caller can run
   * the queue cascade, or `null` when no matching payment is found.
   */
  applyCheckoutCompleted(session: Stripe.Checkout.Session): StoredPaymentRecord | null {
    const payment = this.resolvePaymentForStripeSession(session);
    if (!payment) {
      return null;
    }

    const providerReference =
      typeof session.payment_intent === "string" ? session.payment_intent : session.id;
    this.db.updatePaymentRecord(payment.id, {
      status: "paid",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      completedAt: nowIso(),
      failureCode: null,
      failureMessage: null
    });
    this.db.updateEventRacerPayment(payment.eventId, payment.racerId, {
      status: "paid",
      note: "Stripe Checkout",
      providerReference
    });
    return payment;
  }

  /**
   * Records that a paid Checkout could not be auto-queued. Called by the
   * orchestrator after the queue cascade throws.
   */
  markCheckoutQueueFailed(paymentId: string, error: unknown): void {
    this.db.updatePaymentRecord(paymentId, {
      status: "queue_failed",
      failureCode: error instanceof AppHttpError ? (error.code ?? "queue_failed") : "queue_failed",
      failureMessage:
        error instanceof Error
          ? error.message
          : "Payment succeeded, but the racer could not be queued automatically."
    });
  }

  applyCheckoutExpired(session: Stripe.Checkout.Session): void {
    const payment = this.resolvePaymentForStripeSession(session);
    if (!payment || payment.status === "paid") {
      return;
    }

    this.db.updatePaymentRecord(payment.id, {
      status: session.status === "expired" ? "expired" : "cancelled",
      stripeCheckoutSessionId: session.id,
      failureCode: session.status ?? "checkout_not_completed",
      failureMessage: "Stripe Checkout did not complete."
    });
  }

  /**
   * Cancels a racer's pending Checkout payment. Returns `true` when a record was
   * transitioned to cancelled so the caller can decide whether to broadcast.
   */
  cancelCheckoutPayment(racerId: string, paymentId: string): boolean {
    const payment = this.db.getPaymentRecord(paymentId);
    if (payment?.racerId !== racerId) {
      throw new AppHttpError("Payment record not found.", 404, "payment_not_found");
    }

    if (payment.status === "checkout_created") {
      this.db.updatePaymentRecord(payment.id, {
        status: "cancelled",
        failureCode: "checkout_cancelled",
        failureMessage: "The racer cancelled Stripe Checkout."
      });
      return true;
    }

    return false;
  }
}
