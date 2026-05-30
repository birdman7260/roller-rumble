ALTER TABLE queue_entries
ADD COLUMN lock_type TEXT NOT NULL DEFAULT 'flex';

ALTER TABLE queue_entries
ADD COLUMN occurrence_ids_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE queue_entries
ADD COLUMN priority_score REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS queue_occurrences (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  intent TEXT NOT NULL,
  lock_group_id TEXT,
  signup_sequence INTEGER NOT NULL,
  bump_count INTEGER NOT NULL DEFAULT 0,
  race_count_at_join INTEGER NOT NULL DEFAULT 0,
  projected_position INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS queue_occurrences_event_status_idx
ON queue_occurrences (event_id, status, signup_sequence);

CREATE INDEX IF NOT EXISTS queue_occurrences_event_racer_idx
ON queue_occurrences (event_id, racer_id, status);
