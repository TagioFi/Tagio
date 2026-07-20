-- Wave 2 revision (2026-07-20): a user is entitled to at most one follow-up
-- per unrecognized request, not a chain of one-slot-at-a-time questions --
-- so a single follow-up now has to be able to ask about every missing slot
-- at once, not just one. missing_slot (singular) becomes missing_slots
-- (a JSONB array). This table is fully transient (30-minute expiry, no
-- historical value), so existing rows are just wrapped rather than
-- migrated with any real care.
ALTER TABLE pending_clarifications ADD COLUMN IF NOT EXISTS missing_slots JSONB;
UPDATE pending_clarifications SET missing_slots = to_jsonb(ARRAY[missing_slot]) WHERE missing_slots IS NULL;
ALTER TABLE pending_clarifications ALTER COLUMN missing_slots SET NOT NULL;
ALTER TABLE pending_clarifications DROP COLUMN IF EXISTS missing_slot;
