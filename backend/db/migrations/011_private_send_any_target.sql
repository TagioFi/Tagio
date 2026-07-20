-- Wave 7 revision (2026-07-20): private send now supports the same three
-- target kinds as a plain send (@handle, #hashtag, 0xaddress), not just a
-- linked @handle. A hashtag or raw wallet address resolves to a concrete
-- recipient wallet with no X account involved at all, so recipient_x_user_id
-- can no longer be guaranteed -- it's only ever set for the @handle path
-- (needed there for the $claim fallback to find "my claimable sends" by X
-- identity; a wallet/hashtag recipient still has the dashboard's "Claim now"
-- button, which matches by wallet address instead).
ALTER TABLE private_sends ALTER COLUMN recipient_x_user_id DROP NOT NULL;
