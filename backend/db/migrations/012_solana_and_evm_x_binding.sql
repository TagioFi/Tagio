-- Migration 012: Support binding both Solana and EVM wallets to an X (Twitter) account
-- Allows the frontend to operate seamlessly with Solana as the primary interface while preserving Robinhood settlement.

-- 1. Extend users table to record chain type
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS chain_type TEXT DEFAULT 'solana';

-- 2. Extend x_accounts to record both Solana and EVM addresses per X identity
ALTER TABLE x_accounts 
  ADD COLUMN IF NOT EXISTS solana_wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS evm_wallet_address TEXT;

-- Backfill existing accounts into evm_wallet_address if null
UPDATE x_accounts 
SET evm_wallet_address = wallet_address 
WHERE evm_wallet_address IS NULL;

-- Create unique indexes for 1:1 binding per chain
CREATE UNIQUE INDEX IF NOT EXISTS idx_x_accounts_solana_wallet ON x_accounts(solana_wallet_address) WHERE solana_wallet_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_x_accounts_evm_wallet ON x_accounts(evm_wallet_address) WHERE evm_wallet_address IS NOT NULL;

-- 3. Track Relay.link execution & protocol fees on pending transactions
ALTER TABLE pending_transactions 
  ADD COLUMN IF NOT EXISTS origin_chain TEXT DEFAULT 'solana',
  ADD COLUMN IF NOT EXISTS relay_request_id TEXT,
  ADD COLUMN IF NOT EXISTS protocol_fee_bps INTEGER DEFAULT 15; -- 0.15%
