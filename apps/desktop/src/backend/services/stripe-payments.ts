import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";
import type Stripe from "stripe";
import {
  DEFAULT_PAYMENT_CURRENCY,
  STRIPE_MIN_PAYMENT_AMOUNT_CENTS
} from "@roller-rumble/shared/constants";
import type { EventRecord, Racer, RacerQueueSignupInput } from "@roller-rumble/shared/types";

export interface StripeRuntimeConfig {
  configured: boolean;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  hasExtraCaCertFile: boolean;
  secretKey?: string;
  webhookSecret?: string;
  extraCaCertFile?: string | null;
  publicRacerUrl?: string | null;
  message: string;
}

export class StripeCaCertificateError extends Error {
  readonly code = "stripe_ca_file_unreadable";

  constructor(filePath: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Stripe extra CA certificate file could not be read: ${filePath}. ${detail}`);
  }
}

function normalizePublicRacerBaseUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.replace(/\/$/, "");
  return trimmed.endsWith("/racer") ? trimmed.slice(0, -"/racer".length) : trimmed;
}

export function getStripeRuntimeConfig(env: NodeJS.ProcessEnv = process.env): StripeRuntimeConfig {
  const secretKey = env.ROLLER_RUMBLE_STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.ROLLER_RUMBLE_STRIPE_WEBHOOK_SECRET?.trim();
  const extraCaCertFile = env.ROLLER_RUMBLE_STRIPE_EXTRA_CA_CERT_FILE?.trim();
  const publicRacerUrl = normalizePublicRacerBaseUrl(
    env.ROLLER_RUMBLE_PUBLIC_RACER_URL?.trim() ?? null
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
    hasExtraCaCertFile: Boolean(extraCaCertFile),
    secretKey,
    webhookSecret,
    extraCaCertFile,
    publicRacerUrl,
    message:
      missing.length === 0
        ? "Stripe Checkout is ready."
        : `Stripe Checkout is missing ${missing.join(", ")}.`
  };
}

export function createStripeHttpAgent(extraCaCertFile?: string | null): https.Agent | undefined {
  if (!extraCaCertFile) {
    return undefined;
  }

  try {
    const extraCaCert = fs.readFileSync(extraCaCertFile, "utf8");
    return new https.Agent({
      ca: [...tls.rootCertificates, extraCaCert]
    });
  } catch (error) {
    throw new StripeCaCertificateError(extraCaCertFile, error);
  }
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
            description: `Roller Rumble race entry for ${input.racer.displayName}`
          }
        }
      }
    ]
  };
}
