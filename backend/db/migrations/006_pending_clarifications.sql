-- Wave 2: generic follow-up/clarification asker. Any command with an
-- ambiguous or missing parameter (giveaway/airdrop, Wave 3/4) can ask a
-- fixed, templated follow-up instead of declining outright. Not consumed by
-- the existing deterministic send/swap parsers -- they never produce a
-- partial result, they either match a full command or don't.
CREATE TABLE IF NOT EXISTS pending_clarifications (
  id             SERIAL PRIMARY KEY,
  x_user_id      TEXT NOT NULL,
  source         TEXT NOT NULL, -- 'mention' | 'dm'
  source_ref     TEXT NOT NULL, -- the tweet/DM id that started this clarification thread
  partial_intent JSONB NOT NULL, -- whatever Groq extracted so far
  missing_slot   TEXT NOT NULL, -- one of the fixed reply-bank keys (see clarificationService.ts)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 minutes'
);

-- At most one open clarification per user -- a new one replaces whatever
-- was open before, same as a user only ever having one live conversation
-- thread with the bot at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_clarifications_x_user_id ON pending_clarifications(x_user_id);
