ALTER TABLE event_racers
ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';

ALTER TABLE event_racers
ADD COLUMN paid_at TEXT;

ALTER TABLE event_racers
ADD COLUMN payment_updated_at TEXT;

ALTER TABLE event_racers
ADD COLUMN payment_note TEXT;

ALTER TABLE event_racers
ADD COLUMN payment_provider_reference TEXT;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports_json TEXT NOT NULL,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS passkey_credentials_racer_idx
ON passkey_credentials (racer_id);
