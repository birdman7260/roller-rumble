CREATE TABLE IF NOT EXISTS racers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (type, value)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  include_all_race_data INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_racers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (event_id, racer_id)
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  position INTEGER NOT NULL,
  racer_ids_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS races (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  queue_entry_id TEXT REFERENCES queue_entries(id) ON DELETE SET NULL,
  tournament_id TEXT,
  stage_id TEXT,
  mode TEXT NOT NULL,
  format TEXT NOT NULL,
  state TEXT NOT NULL,
  target_distance_meters REAL NOT NULL,
  theme_id TEXT NOT NULL,
  participants_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  winner_racer_id TEXT,
  countdown_started_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  racer_id TEXT NOT NULL REFERENCES racers(id) ON DELETE CASCADE,
  lane TEXT NOT NULL,
  placement INTEGER NOT NULL,
  finish_time_ms INTEGER,
  distance_meters REAL NOT NULL,
  avg_speed_kph REAL NOT NULL,
  top_speed_kph REAL NOT NULL,
  max_wattage REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  preset TEXT NOT NULL,
  status TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_stages (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  settings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bracket_nodes (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES tournament_stages(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  slot_label TEXT NOT NULL,
  racer_a_id TEXT,
  racer_b_id TEXT,
  winner_racer_id TEXT,
  winner_to_node_id TEXT,
  loser_to_node_id TEXT,
  state TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES tournament_stages(id) ON DELETE CASCADE,
  racer_a_id TEXT NOT NULL,
  racer_b_id TEXT NOT NULL,
  winner_racer_id TEXT,
  score_label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
