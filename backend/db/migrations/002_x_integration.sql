-- X (Twitter) account linking, required as a second auth factor before JWT issuance.
CREATE TABLE IF NOT EXISTS x_accounts (
  wallet_address  TEXT PRIMARY KEY REFERENCES users(wallet_address) ON DELETE CASCADE,
  x_user_id       TEXT NOT NULL UNIQUE,
  x_handle        TEXT NOT NULL,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rotating OAuth 2.0 tokens for the bot's own X account. Single-row table --
-- refresh tokens rotate on every use, so the live value must live here, not in .env.
CREATE TABLE IF NOT EXISTS x_bot_token (
  id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracks the last-seen mention/DM id per stream so polling doesn't reprocess old events.
CREATE TABLE IF NOT EXISTS x_bot_cursor (
  stream         TEXT PRIMARY KEY, -- 'mentions' | 'dms'
  last_seen_id   TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unsigned transaction payloads created by the X bot on a user's behalf. The bot
-- never signs anything; the requester reviews and signs these in the dashboard
-- with their own wallet, then reports back the resulting tx_hash.
CREATE TABLE IF NOT EXISTS pending_transactions (
  id                     SERIAL PRIMARY KEY,
  requested_by_wallet    TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  requested_by_x_user_id TEXT NOT NULL,
  source                 TEXT NOT NULL DEFAULT 'x_bot',
  source_ref             TEXT, -- tweet id or DM event id that created this (idempotency + reply threading)
  target_type            TEXT NOT NULL, -- 'hashtag' | 'wallet' | 'x_account'
  target_value           TEXT NOT NULL, -- raw hashtag/address/handle as given in the command
  resolved_to_wallet      TEXT NOT NULL,
  token                  TEXT NOT NULL, -- 'native' | 'usdg'
  amount                 TEXT NOT NULL, -- human-readable decimal string, e.g. "5"
  amount_base_units      TEXT NOT NULL, -- wei (native) or token base units (USDG)
  unsigned_to            TEXT NOT NULL,
  unsigned_data           TEXT NOT NULL DEFAULT '0x',
  unsigned_value         TEXT NOT NULL DEFAULT '0',
  status                 TEXT NOT NULL DEFAULT 'pending', -- pending | broadcast | failed | cancelled | expired
  tx_hash                TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_pending_tx_requester ON pending_transactions(requested_by_wallet);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_tx_source_ref ON pending_transactions(source_ref) WHERE source_ref IS NOT NULL;
