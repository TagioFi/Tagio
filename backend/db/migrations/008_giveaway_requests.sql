-- Wave 3: giveaway waiter + multi-step payouts.
--
-- A giveaway/airdrop payout may need more than "0-1 approvals then one final
-- tx" -- a mix of linked winners (paid via one BatchDisperser call) and
-- unlinked winners (each needing their own ClaimEscrow deposit, since
-- BatchDisperser can only pay concrete wallet addresses) means a variable
-- number of final steps, not just one. extra_steps holds everything after
-- the existing unsigned_to/data/value step, signed in the same order,
-- reusing the same approvals-then-steps sequencing the dashboard's Pending
-- tab already does for swaps -- just extended to more than one "final" tx.
ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS extra_steps JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS giveaway_requests (
  id                    SERIAL PRIMARY KEY,
  source_post_id        TEXT NOT NULL, -- the target post whose engagers are checked
  request_tweet_id      TEXT NOT NULL, -- the mention that invoked the bot
  requester_wallet      TEXT NOT NULL,
  requester_x_user_id   TEXT NOT NULL,
  requirement_type      TEXT NOT NULL, -- 'likes' | 'comments' | 'retweets'
  requirement_threshold INTEGER NOT NULL,
  winner_count          INTEGER NOT NULL,
  amount                TEXT NOT NULL, -- total pool, human-readable decimal string
  token                 TEXT NOT NULL, -- 'native' | 'usdg'
  status                TEXT NOT NULL DEFAULT 'waiting', -- waiting | fulfilled | expired
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_giveaway_requests_request_tweet_id ON giveaway_requests(request_tweet_id);
CREATE INDEX IF NOT EXISTS idx_giveaway_requests_waiting ON giveaway_requests(status) WHERE status = 'waiting';
