ALTER TABLE queue_entries
ADD COLUMN requested_type TEXT NOT NULL DEFAULT 'solo';

UPDATE queue_entries
SET requested_type = CASE
  WHEN type = 'match' THEN 'match'
  ELSE 'solo'
END;
