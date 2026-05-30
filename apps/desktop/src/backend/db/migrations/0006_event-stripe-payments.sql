ALTER TABLE events
ADD COLUMN payment_required_for_queue INTEGER NOT NULL DEFAULT 0;

ALTER TABLE events
ADD COLUMN payment_amount_cents INTEGER;

ALTER TABLE events
ADD COLUMN payment_currency TEXT NOT NULL DEFAULT 'usd';

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  checkout_url TEXT,
  queue_intent_json TEXT NOT NULL,
  failure_code TEXT,
  failure_message TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS payments_event_racer_idx
ON payments (event_id, racer_id);

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
