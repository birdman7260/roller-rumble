-- Racer contact details live on the racer row (ADR-0024). They are plain, nullable, and
-- deliberately not unique: they are operator-only and never used to look a racer up.
ALTER TABLE racers
ADD COLUMN real_name TEXT;

ALTER TABLE racers
ADD COLUMN email TEXT;

ALTER TABLE racers
ADD COLUMN phone TEXT;
