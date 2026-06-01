CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  user_agent TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS push_subscriptions_racer_active_idx
ON push_subscriptions (racer_id, revoked_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  trigger_key TEXT UNIQUE,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  read_at TEXT,
  push_subscription_id TEXT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  push_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(notification_id, racer_id)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_racer_created_idx
ON notification_deliveries (racer_id, created_at);
