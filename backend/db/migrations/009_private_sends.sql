-- Wave 7: private send. Unlike ClaimEscrow's deposit flow (where the DB row
-- only needs to exist once the deposit is confirmed broadcast, since
-- xUserIdHash is deterministic from a known X id), PrivateSendPool.send()
-- needs a commitment = keccak256(secret, recipient, pool, chainId) baked
-- into the unsigned tx's calldata *before* the sender ever signs -- so the
-- secret has to be generated and stored at command time, not after
-- broadcast. What still waits for confirmed broadcast is `status` flipping
-- to 'sent' (see /transactions/pending/:id/broadcast) -- that's what makes a
-- row eligible for the keeper to pick up.
CREATE TABLE IF NOT EXISTS private_sends (
  id                      SERIAL PRIMARY KEY,
  pending_transaction_id  INTEGER REFERENCES pending_transactions(id) ON DELETE CASCADE,
  commitment              TEXT NOT NULL UNIQUE,
  secret                  TEXT NOT NULL, -- bytes32 hex, backend-only, never returned to any client except the recipient's own claim flow
  sender_wallet           TEXT NOT NULL,
  sender_x_user_id        TEXT NOT NULL,
  recipient_wallet        TEXT NOT NULL,
  recipient_x_user_id     TEXT NOT NULL,
  token                   TEXT NOT NULL, -- 'native' | 'usdg'
  amount                  TEXT NOT NULL, -- human-readable decimal string
  amount_base_units       TEXT NOT NULL,
  keeper_fee_base_units   TEXT NOT NULL DEFAULT '0',
  status                  TEXT NOT NULL DEFAULT 'pending_send', -- pending_send | sent | claimed | failed
  sent_tx_hash            TEXT,
  claimed_tx_hash         TEXT,
  claimed_by              TEXT, -- 'keeper' | 'self'
  keeper_attempts         INTEGER NOT NULL DEFAULT 0,
  keeper_last_error       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_private_sends_claimable ON private_sends(status) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_private_sends_recipient ON private_sends(recipient_x_user_id);
CREATE INDEX IF NOT EXISTS idx_private_sends_sender ON private_sends(sender_x_user_id);
