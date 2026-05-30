import type Stripe from "stripe";
import {
  DEFAULT_PAYMENT_CURRENCY,
  STRIPE_MIN_PAYMENT_AMOUNT_CENTS
} from "@goldsprints/shared/constants";
import type { EventRecord, Racer, RacerQueueSignupInput } from "@goldsprints/shared/types";

export interface StripeRuntimeConfig {
  configured: boolean;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  secretKey?: string;
  webhookSecret?: string;
  publicRacerUrl?: string | null;
  message: string;
}

function normalizePublicRacerBaseUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.replace(/\/$/, "");
  return trimmed.endsWith("/racer") ? trimmed.slice(0, -"/racer".length) : trimmed;
}

export function getStripeRuntimeConfig(env: NodeJS.ProcessEnv = process.env): StripeRuntimeConfig {
  const secretKey = env.GOLDSPRINTS_STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.GOLDSPRINTS_STRIPE_WEBHOOK_SECRET?.trim();
  const publicRacerUrl = normalizePublicRacerBaseUrl(
    env.GOLDSPRINTS_PUBLIC_RACER_URL?.trim() ?? null
  );
  const missing = [
    secretKey ? null : "secret key",
    webhookSecret ? null : "webhook secret",
    publicRacerUrl ? null : "public racer URL"
  ].filter((value): value is string => Boolean(value));

  return {
    configured: missing.length === 0,
    hasSecretKey: Boolean(secretKey),
    hasWebhookSecret: Boolean(webhookSecret),
    secretKey,
    webhookSecret,
    publicRacerUrl,
    message:
      missing.length === 0
        ? "Stripe Checkout is ready."
        : `Stripe Checkout is missing ${missing.join(", ")}.`
  };
}

export function normalizePaymentCurrency(currency?: string | null): string {
  const normalized = currency?.trim().toLowerCase();
  return (normalized && normalized.length > 0 ? normalized : DEFAULT_PAYMENT_CURRENCY).slice(0, 3);
}

export function assertEventPaymentConfig(event: EventRecord): {
  amountCents: number;
  currency: string;
} {
  const amountCents = event.paymentAmountCents ?? 0;
  if (!Number.isInteger(amountCents) || amountCents < STRIPE_MIN_PAYMENT_AMOUNT_CENTS) {
    throw new Error("Set an entrance fee of at least $0.50 before requiring payment.");
  }

  return {
    amountCents,
    currency: normalizePaymentCurrency(event.paymentCurrency)
  };
}

export function buildStripeCheckoutSessionParams(input: {
  event: EventRecord;
  racer: Racer;
  paymentId: string;
  amountCents: number;
  currency: string;
  publicRacerUrl: string;
  queueIntent: RacerQueueSignupInput;
}): Stripe.Checkout.SessionCreateParams {
  const racerUrl = input.publicRacerUrl.replace(/\/$/, "");
  const metadata = {
    paymentId: input.paymentId,
    eventId: input.event.id,
    racerId: input.racer.id,
    queueIntent: JSON.stringify(input.queueIntent)
  };

  return {
    mode: "payment",
    client_reference_id: `${input.event.id}:${input.racer.id}`,
    success_url: `${racerUrl}/racer?payment=success&payment_id=${input.paymentId}`,
    cancel_url: `${racerUrl}/racer?payment=cancelled&payment_id=${input.paymentId}`,
    metadata,
    payment_intent_data: {
      metadata
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.amountCents,
          product_data: {
            name: `${input.event.name} entrance fee`,
            description: `GoldSprints race entry for ${input.racer.displayName}`
          }
        }
      }
    ]
  };
}
