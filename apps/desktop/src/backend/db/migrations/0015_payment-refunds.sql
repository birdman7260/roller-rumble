-- The host refunds entrance fees after the event for paid racers who never got to race.
-- The Stripe refund id ties the payment to Stripe's refund webhooks, refund_issued_at records
-- when the refund was sent, and refund_attempt numbers the refund's idempotency key so a retry
-- after Stripe refused a refund is a new request instead of a replay of the refusal.
ALTER TABLE payments
ADD COLUMN stripe_refund_id TEXT;

ALTER TABLE payments
ADD COLUMN refund_issued_at TEXT;

ALTER TABLE payments
ADD COLUMN refund_attempt INTEGER NOT NULL DEFAULT 0;
