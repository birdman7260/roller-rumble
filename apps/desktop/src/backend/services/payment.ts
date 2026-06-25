import Stripe from "stripe";
import {
  DEFAULT_PAYMENT_CURRENCY,
  STRIPE_MIN_PAYMENT_AMOUNT_CENTS
} from "@roller-rumble/shared/constants";
import type {
  Racer,
  RacerQueueSignupInput,
  StripeConnectionTestResult,
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

function getStripeFailureDetails(error: unknown): StripeFailureDetails {
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
    code: stripeCode ?? "stripe_checkout_failed",
    message: `Could not start Stripe Checkout. ${message}`,
    requestId: typeof requestId === "string" ? requestId : null,
    type: stripeType
  };
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
      status: "unpaid" | "paid" | "waived";
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
   * Creates a Stripe Checkout session for a racer's queue signup and records the
   * pending payment. Returns the payment id and hosted checkout URL; the caller
   * assembles the queue-signup response and snapshot.
   */
  async createCheckoutForQueue(
    racer: Racer,
    input: RacerQueueSignupInput
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
      queueIntent: input
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
          queueIntent: input
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
