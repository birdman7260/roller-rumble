-- Remember the intent an occurrence held before a challenge upgraded it, so
-- challenge abandonment can resolve the stranded opponent exactly (ADR-0015).
-- Existing rows migrate as NULL, which reads as "no prior intent".
ALTER TABLE queue_occurrences
ADD COLUMN prior_intent TEXT;
