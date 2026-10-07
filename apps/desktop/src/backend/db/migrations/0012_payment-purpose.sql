-- A payment either pays the entry fee on the way into the queue (the stored queue intent is
-- queued once Stripe confirms it) or pays the entry fee alone from the registration wizard,
-- which must never queue the racer.
ALTER TABLE payments
ADD COLUMN purpose TEXT NOT NULL DEFAULT 'queue';
