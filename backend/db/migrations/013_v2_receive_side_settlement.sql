-- Migration 013: TagioFi v2 Receive-Side RWA Settlement on Robinhood Chain
-- Non-custodial, receive-side portfolio preferences (handles, elections, settlements, invoices)

CREATE TABLE IF NOT EXISTS v2_handles (
  id SERIAL PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  owner_wallet TEXT NOT NULL,
  x_user_id TEXT,
  x_handle TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_handles_owner_wallet ON v2_handles(LOWER(owner_wallet));
CREATE INDEX IF NOT EXISTS idx_v2_handles_x_user_id ON v2_handles(x_user_id);
CREATE INDEX IF NOT EXISTS idx_v2_handles_x_handle ON v2_handles(LOWER(x_handle));

CREATE TABLE IF NOT EXISTS v2_elections (
  id SERIAL PRIMARY KEY,
  handle_id INTEGER NOT NULL REFERENCES v2_handles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  token_address TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 18,
  basis_points INTEGER NOT NULL CHECK (basis_points > 0 AND basis_points <= 10000),
  percentage NUMERIC(5, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_elections_handle_id ON v2_elections(handle_id);

CREATE TABLE IF NOT EXISTS v2_settlements (
  id SERIAL PRIMARY KEY,
  request_id TEXT UNIQUE,
  tx_hash TEXT,
  sender_wallet TEXT NOT NULL,
  recipient_handle TEXT,
  recipient_wallet TEXT NOT NULL,
  input_token_symbol TEXT NOT NULL,
  input_token_address TEXT NOT NULL,
  input_amount TEXT NOT NULL,
  output_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'completed',
  fee_collected_usd NUMERIC(12, 6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_settlements_sender ON v2_settlements(LOWER(sender_wallet));
CREATE INDEX IF NOT EXISTS idx_v2_settlements_recipient ON v2_settlements(LOWER(recipient_wallet));
CREATE INDEX IF NOT EXISTS idx_v2_settlements_handle ON v2_settlements(LOWER(recipient_handle));

CREATE TABLE IF NOT EXISTS v2_invoices (
  id SERIAL PRIMARY KEY,
  invoice_id TEXT UNIQUE NOT NULL,
  recipient_handle TEXT REFERENCES v2_handles(handle) ON DELETE SET NULL,
  recipient_wallet TEXT NOT NULL,
  target_amount NUMERIC(18, 6) NOT NULL,
  target_token_symbol TEXT NOT NULL DEFAULT 'USDG',
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  settlement_id INTEGER REFERENCES v2_settlements(id),
  expiry_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_invoices_recipient_wallet ON v2_invoices(LOWER(recipient_wallet));
CREATE INDEX IF NOT EXISTS idx_v2_invoices_handle ON v2_invoices(LOWER(recipient_handle));
