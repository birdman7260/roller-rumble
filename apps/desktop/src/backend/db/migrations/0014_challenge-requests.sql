-- A challenge can be sent as a request the challenged racer must accept before it
-- is raced. The pending answer lives on the challenged racer's occurrence, and the
-- projected queue entry names whose answer it is waiting on. Existing rows migrate
-- as already answered.
ALTER TABLE queue_occurrences
ADD COLUMN awaiting_challenge_response INTEGER NOT NULL DEFAULT 0;

ALTER TABLE queue_entries
ADD COLUMN awaiting_racer_id TEXT;
