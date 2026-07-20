-- Fixes a real gap in Wave 1's original unclaimed_allocations design: a
-- database row recording "X owes Y" isn't the same as actually escrowing
-- the sender's funds. kind='deposit' rows (sender -> ClaimEscrow, tagged by
-- a hash of the recipient's X user id) and kind='claim' rows (linked
-- recipient -> sweeps their ClaimEscrow balance) both need to know which
-- X user id they're for -- target_value already holds a display handle for
-- 'deposit' rows, but the actual xUserId used to build the escrow calldata
-- needs its own column since it isn't always the same as the handle.
ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS target_x_user_id TEXT;
