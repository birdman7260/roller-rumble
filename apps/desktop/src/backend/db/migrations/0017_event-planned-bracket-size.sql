-- An event remembers the bracket size the host picked for its tournament, so the projector can show
-- its bracket cutoff during open time trial. Existing events migrate with no plan.
ALTER TABLE events
ADD COLUMN planned_bracket_size INTEGER;
