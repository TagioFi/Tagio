-- Wave 1: unclaimed transactions -- lets giveaway/airdrop/direct-send pay X
-- accounts that haven't linked a TagioPay wallet yet, instead of silently
-- dropping the recipient. Claimed automatically once they link (see
-- claimAllocationsForXUser, called from routes/xAuthCallback.ts).
CREATE TABLE IF NOT EXISTS unclaimed_allocations (
  id                SERIAL PRIMARY KEY,
  x_user_id         TEXT NOT NULL,
  x_handle          TEXT NOT NULL,
  token             TEXT NOT NULL, -- 'native' | 'usdg'
  amount            TEXT NOT NULL, -- human-readable decimal string
  amount_base_units TEXT NOT NULL,
  source            TEXT NOT NULL, -- 'giveaway' | 'airdrop' | 'direct-send'
  source_ref        TEXT, -- tweet/DM id that created this allocation
  status            TEXT NOT NULL DEFAULT 'unclaimed', -- unclaimed | claimed | expired
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT now() + interval '120 days'
);

CREATE INDEX IF NOT EXISTS idx_unclaimed_allocations_x_user_id ON unclaimed_allocations(x_user_id);
-- A giveaway/airdrop event allocates to many winners under the same
-- source_ref -- uniqueness has to be per (source_ref, x_user_id), not per
-- source_ref alone, or the second winner's insert would silently no-op.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unclaimed_allocations_source_ref_user
  ON unclaimed_allocations(source_ref, x_user_id) WHERE source_ref IS NOT NULL;

-- Lets a claimed allocation's resulting pending_transactions row carry its
-- real origin (giveaway/airdrop/direct-send) instead of the generic 'x_bot'
-- default, so the dashboard can show a "unlocked from a past X" badge.
ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'x_bot';
