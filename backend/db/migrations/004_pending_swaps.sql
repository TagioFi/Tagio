-- Extends pending_transactions to also carry bot-initiated swaps (RWA stock
-- tokens <-> ETH/USDG via Uniswap v3/v4), alongside the existing hashtag/
-- wallet/x_account payment rows. A swap plan needs up to 2 approval txs
-- signed and confirmed before the swap tx itself -- those live in the new
-- `approvals` column; the existing unsigned_to/unsigned_data/unsigned_value
-- columns are reused for the final swap tx, same as they already are for a
-- plain payment.
ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'payment'; -- 'payment' | 'swap'
ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS approvals JSONB NOT NULL DEFAULT '[]';
ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS quote_route TEXT;
ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS price_impact_pct NUMERIC;

-- For kind='swap' rows: target_type is 'swap', token is the symbol being
-- spent (ETH or USDG -- no hashtag balances), target_value is the RWA
-- ticker being bought, resolved_to_wallet equals requested_by_wallet (a
-- swap's output always returns to the same wallet that paid for it).
