-- An event can cap how many racers register, and plan when its tournament starts so the host
-- gets a heads-up to close the queue in time. The heads-up is dismissed once per planned start.
-- Existing events migrate with no cap and no planned start.
ALTER TABLE events
ADD COLUMN registration_limit INTEGER;

ALTER TABLE events
ADD COLUMN tournament_starts_at TEXT;

ALTER TABLE events
ADD COLUMN tournament_start_check_dismissed_at TEXT;
