-- Live-status notification channels (ADR-0013).
-- A notification may belong to a keyed channel; a newer record in the same
-- channel supersedes the prior one (replace-in-place) instead of stacking.
ALTER TABLE notifications ADD COLUMN channel_key TEXT;
ALTER TABLE notifications ADD COLUMN superseded_at TEXT;

-- Fast lookup of the current (non-superseded) record for a channel.
CREATE INDEX IF NOT EXISTS notifications_channel_active_idx
ON notifications (channel_key, superseded_at);
