-- 015_facebook_waitlist.sql: Waitlist for upcoming Facebook bot
CREATE TABLE IF NOT EXISTS facebook_waitlist (
  id SERIAL PRIMARY KEY,
  facebook_handle VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(42),
  ip_address VARCHAR(64),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facebook_waitlist_handle ON facebook_waitlist (LOWER(facebook_handle));
CREATE INDEX IF NOT EXISTS idx_facebook_waitlist_wallet ON facebook_waitlist (LOWER(wallet_address));
