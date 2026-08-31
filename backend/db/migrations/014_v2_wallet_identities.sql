-- 014_v2_wallet_identities.sql: Wallet-level X identity binding
CREATE TABLE IF NOT EXISTS v2_wallet_identities (
  wallet_address VARCHAR(42) PRIMARY KEY,
  x_user_id VARCHAR(64) NOT NULL,
  x_handle VARCHAR(64) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_wallet_identities_x_user_id ON v2_wallet_identities (x_user_id);
CREATE INDEX IF NOT EXISTS idx_v2_wallet_identities_x_handle ON v2_wallet_identities (LOWER(x_handle));
