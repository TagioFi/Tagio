# Backend issue: `x_accounts` duplicate key on X account linking

**Reported error**

```json
{"error":"duplicate key value violates unique constraint \"x_accounts_x_user_id_key\""}
```

This is a backend bug. Two separate problems are stacked in it: the upsert is keyed on
the wrong column, and the raw Postgres error is being returned to the client.

---

## 1. The upsert guards the wrong column

`backend/src/services/x/xAccountService.ts` → `linkXAccount()`:

```sql
INSERT INTO x_accounts (wallet_address, solana_wallet_address, evm_wallet_address, x_user_id, x_handle)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (wallet_address) DO UPDATE SET
  x_user_id = EXCLUDED.x_user_id,
  x_handle  = EXCLUDED.x_handle,
  solana_wallet_address = COALESCE(EXCLUDED.solana_wallet_address, x_accounts.solana_wallet_address),
  evm_wallet_address    = COALESCE(EXCLUDED.evm_wallet_address,    x_accounts.evm_wallet_address)
```

The `ON CONFLICT` target is `wallet_address`. But the table also carries a unique
constraint on `x_user_id` (`x_accounts_x_user_id_key`), and that one is unguarded.

So whenever an **X account that already exists** is linked from a **wallet address that
does not**, there is no conflict on `wallet_address`, Postgres proceeds with a plain
`INSERT`, and the `x_user_id` unique index rejects it.

**Repro**

1. Link X user `123` from wallet `A` → row created, fine.
2. Link X user `123` from wallet `B` → no `wallet_address` conflict, `INSERT` attempted,
   `x_accounts_x_user_id_key` violated.

## 2. Why the Solana migration makes this fire constantly

`linkXAccount()` already takes `chainType: "solana" | "robinhood"` and writes into
`solana_wallet_address` / `evm_wallet_address` separately. That schema clearly intends
**one row per X user, holding both of that person's chain addresses**.

But `wallet_address` is the conflict key, so the same person linking the same X account
from their Solana wallet and then their EVM wallet produces two different
`wallet_address` values — and the second one is guaranteed to trip the constraint. The
`COALESCE(...)` branches that were written to merge the two addresses onto one row can
never be reached from a second wallet, which is exactly the case they were written for.

## 3. What the schema actually allows

From `002_x_integration.sql`:

```sql
CREATE TABLE IF NOT EXISTS x_accounts (
  wallet_address  TEXT PRIMARY KEY REFERENCES users(wallet_address) ON DELETE CASCADE,
  x_user_id       TEXT NOT NULL UNIQUE,     -- <- x_accounts_x_user_id_key
  ...
);
```

`wallet_address` is not merely unique — it is the **primary key and a foreign key into
`users`**. That constrains the fix: the conflict target can move, but `wallet_address`
cannot be freely reassigned on an existing row without rewriting the PK and satisfying
the FK for the new address.

`012_solana_and_evm_x_binding.sql` then added `solana_wallet_address` /
`evm_wallet_address` with partial unique indexes, backfilled `evm_wallet_address` from
`wallet_address`, and states its intent in the header: *"binding both Solana and EVM
wallets to an X account."* So one row per X user, carrying both addresses, is the
documented design — the `linkXAccount()` conflict target just never caught up with it.

## 4. Suggested fix

Move the conflict target to `x_user_id` and update only the per-chain columns, leaving
the PK where it is:

```sql
INSERT INTO x_accounts (wallet_address, solana_wallet_address, evm_wallet_address, x_user_id, x_handle)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (x_user_id) DO UPDATE SET
  x_handle              = EXCLUDED.x_handle,
  solana_wallet_address = COALESCE(EXCLUDED.solana_wallet_address, x_accounts.solana_wallet_address),
  evm_wallet_address    = COALESCE(EXCLUDED.evm_wallet_address,    x_accounts.evm_wallet_address)
```

`wallet_address` stays as whichever wallet linked first, and the second chain's address
lands in its own column — which is what migration 012 was written to support.

Decisions worth making explicitly before applying that:

- **Both directions still need defining.** With the target on `x_user_id`, linking a
  *different* X account from an *already-present* `wallet_address` now trips the PK
  instead. Presumably that should be a clean "this wallet is already linked to
  @handle" error rather than a crash.
- **The two partial unique indexes can still fire.** If wallet `B` tries to link an X
  account while `B` is already in someone else's `solana_wallet_address`,
  `idx_x_accounts_solana_wallet` rejects it. Same treatment needed.
- **Is `wallet_address`-as-PK still worth keeping?** Now that both chain addresses have
  their own columns, the natural key is `x_user_id`. Repointing the PK is a bigger
  migration (the FK to `users` and anything referencing it), so probably not now — but
  it is the shape this is drifting toward.

## 5. Separately: stop leaking the raw DB error

The client is currently receiving the Postgres constraint name verbatim. Whatever the
resolution above, the route should catch SQLSTATE `23505` and return a `409` with a
message a user can act on — e.g. *"That X account is already linked to a different
wallet."* Leaking constraint and column names to the client is both unhelpful and an
information disclosure.

---

## Frontend context (FYI, no action needed from you)

The frontend is mid-migration from Robinhood Chain to Solana, and it is currently the
lagging half:

- **Your side is ahead.** `backend/src/routes/auth.ts` → `verifyWalletSignature()`
  already branches on `isSolanaAddress` and verifies ed25519 via tweetnacl/bs58, with a
  viem `verifyMessage` fallback for EVM. Solana sign-in works server-side today.
- **The frontend cannot follow yet.** All 8 contracts in `contracts/src/` are still
  Solidity, `src/lib/chain.ts` holds viem ABIs and five `0x` addresses, and
  `src/lib/resolver-actions.ts` runs 14 exported actions over ~27 wagmi calls against
  chain id 4663. Until there are Anchor programs to call, the app still needs an EVM
  wallet for every transaction.
- **Consequence for you:** users will keep arriving with *both* address types for a
  while. That is precisely the situation in §2, so it is worth fixing the upsert before
  the Solana rollout widens rather than after.

Marketing copy on the site now says Solana. In-app strings that describe live behaviour
(`0x` address validation, the network chip, "not registered on …") were deliberately
left EVM-accurate so the UI does not claim a network it is not transacting on.
