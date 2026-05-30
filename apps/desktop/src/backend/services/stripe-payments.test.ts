import { describe, expect, it } from "vitest";
import type { EventRecord, Racer } from "@goldsprints/shared/types";
import {
  assertEventPaymentConfig,
  buildStripeCheckoutSessionParams,
  getStripeRuntimeConfig
} from "./stripe-payments";

const event: EventRecord = {
  id: "event-1",
  name: "Friday Finals",
  includeAllRaceData: false,
  paymentRequiredForQueue: true,
  paymentAmountCents: 1000,
  paymentCurrency: "usd",
  active: true,
  createdAt: "now",
  updatedAt: "now"
};

const racer: Racer = {
  id: "racer-1",
  displayName: "Bird",
  avatarUrl: null,
  createdAt: "now",
  updatedAt: "now",
  identities: []
};

describe("Stripe payment helpers", () => {
  it("reports missing runtime config without exposing secrets", () => {
    expect(getStripeRuntimeConfig({})).toMatchObject({
      configured: false,
      hasSecretKey: false,
      hasWebhookSecret: false,
      publicRacerUrl: null
    });
  });

  it("normalizes public racer URLs that already include /racer", () => {
    expect(
      getStripeRuntimeConfig({
        GOLDSPRINTS_STRIPE_SECRET_KEY: "sk_test",
        GOLDSPRINTS_STRIPE_WEBHOOK_SECRET: "whsec_test",
        GOLDSPRINTS_PUBLIC_RACER_URL: "https://goldsprints.example/racer"
      }).publicRacerUrl
    ).toBe("https://goldsprints.example");
  });

  it("requires a usable event payment amount", () => {
    expect(() =>
      assertEventPaymentConfig({
        ...event,
        paymentAmountCents: 49
      })
    ).toThrow("Set an entrance fee");
  });

  it("builds a Stripe Checkout Session tied to event, racer, and queue intent", () => {
    const params = buildStripeCheckoutSessionParams({
      event,
      racer,
      paymentId: "payment-1",
      amountCents: 1000,
      currency: "usd",
      publicRacerUrl: "https://goldsprints.example/",
      queueIntent: { requestedType: "solo" }
    });

    expect(params).toMatchObject({
      mode: "payment",
      client_reference_id: "event-1:racer-1",
      success_url: "https://goldsprints.example/racer?payment=success&payment_id=payment-1",
      cancel_url: "https://goldsprints.example/racer?payment=cancelled&payment_id=payment-1",
      metadata: {
        paymentId: "payment-1",
        eventId: "event-1",
        racerId: "racer-1"
      }
    });
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(1000);
  });
});
