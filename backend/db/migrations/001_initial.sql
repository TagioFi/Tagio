CREATE TABLE IF NOT EXISTS hashtags (
  hashtag              TEXT PRIMARY KEY,
  owner_wallet          TEXT NOT NULL,
  name                  TEXT,
  image_url             TEXT,
  website_url           TEXT,
  chain                 TEXT NOT NULL DEFAULT 'robinhood',
  nft_token_id          NUMERIC,
  recovery_hash         TEXT,
  registered_at         TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  active                BOOLEAN NOT NULL DEFAULT true,
  total_volume_usd      NUMERIC NOT NULL DEFAULT 0,
  last_interaction_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payout_recipients (
  id              SERIAL PRIMARY KEY,
  hashtag         TEXT NOT NULL REFERENCES hashtags(hashtag) ON DELETE CASCADE,
  wallet          TEXT NOT NULL,
  percentage_bps  INTEGER NOT NULL CHECK (percentage_bps > 0 AND percentage_bps <= 10000)
);

CREATE INDEX IF NOT EXISTS idx_payout_recipients_hashtag ON payout_recipients(hashtag);

CREATE TABLE IF NOT EXISTS social_links (
  id        SERIAL PRIMARY KEY,
  hashtag   TEXT NOT NULL REFERENCES hashtags(hashtag) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_social_links_hashtag ON social_links(hashtag);

CREATE TABLE IF NOT EXISTS transactions (
  id            SERIAL PRIMARY KEY,
  tx_hash       TEXT NOT NULL,
  hashtag       TEXT NOT NULL REFERENCES hashtags(hashtag) ON DELETE CASCADE,
  amount        NUMERIC NOT NULL,
  token         TEXT NOT NULL,
  is_native     BOOLEAN NOT NULL DEFAULT false,
  chain         TEXT NOT NULL DEFAULT 'robinhood',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_hashtag ON transactions(hashtag);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);

CREATE TABLE IF NOT EXISTS users (
  wallet_address  TEXT PRIMARY KEY,
  chain           TEXT NOT NULL DEFAULT 'robinhood',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
