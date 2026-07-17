-- Lets a user see which of their tweets prompted a given pending transaction.
-- Only set for mention-triggered requests; DM-triggered ones have no public
-- tweet to link back to, so this stays null for those.
ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS tweet_url TEXT;
