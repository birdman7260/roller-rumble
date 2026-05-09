CREATE TABLE booth_captures (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  racer_id TEXT NOT NULL REFERENCES racers (id) ON DELETE CASCADE,
  booth_id TEXT NOT NULL,
  original_url TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX booth_captures_event_racer_idx
ON booth_captures (event_id, racer_id, captured_at DESC);
