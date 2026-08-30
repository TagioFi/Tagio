# Backend issues & recent API changes

Two open backend issues, then the API changes that landed alongside the Solana frontend
work so you know what moved and why.

| # | Issue | Status |
| :-- | :-- | :-- |
| 1 | `x_accounts` duplicate key on X account linking | open |
| 2 | Solana-authenticated `walletAddress` used where an EVM address is required | open |
| — | API changes landed frontend-side (§A–C) | done, FYI |

---

# Issue 1 — `x_accounts` duplicate key on X account linking

**Reported error**

```json
{"error":"duplicate key value violates unique constraint \"x_accounts_x_user_id_key\""}
```

This is a backend bug. Two separate problems are stacked in it: the upsert is keyed on
the wrong column, and the raw Postgres error is being returned to the client.

*(Still present as of this writing — `linkXAccount()` continues to use
`ON CONFLICT (wallet_address)`.)*

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

# Issue 2 — Solana `walletAddress` from the JWT used where an EVM address is required

Same root cause as Issue 1, surfacing somewhere with teeth. `issueJwt()` mints the token
for **whichever address signed in**, and Solana sign-in is now the primary path — so
`req.walletAddress` is frequently a base58 key. Several places treat it as EVM by
assertion rather than by check.

## 2.1 The cast

`backend/src/routes/privateSends.ts`, two places:

```ts
// line 113 — POST /private-sends
const senderWallet = req.walletAddress as `0x${string}`;

// line ~189 — POST /private-sends/:id/claim
buildUnsignedClaim(row.commitment, req.walletAddress as `0x${string}`, row.secret)
```

`as` is an assertion, not a conversion. For a Solana-authenticated caller both are
base58 strings wearing an EVM type.

## 2.2 Symptom A — a Solana user's own private sends are invisible to them

`senderWallet` is not used in calldata (`preparePrivateSend` builds the commitment from
`recipientWallet` only), so nothing mis-sends. It is persisted to
`private_sends.sender_wallet`.

But the list endpoint rejects anything that isn't EVM:

```ts
// GET /private-sends
if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) return 400;
```

and `listPrivateSendsForWallet()` matches on `sender_wallet` / `recipient_wallet`. A row
filed under a base58 sender can therefore never be returned to the person who created
it — the dashboard's "Sent by you" group is permanently empty for Solana users.

## 2.3 Symptom B — the manual claim fallback 500s

This one does reach calldata:

```ts
export function buildUnsignedClaim(commitment, recipientWallet: `0x${string}`, secret) {
  const data = encodeFunctionData({
    abi: privateSendPoolAbi, functionName: "claim",
    args: [commitment, recipientWallet, secret],   // <- `address` parameter
  });
```

viem validates `address` arguments, so a base58 string raises `InvalidAddressError`
inside the route rather than producing a bad transaction. Failing loudly is the good
outcome here, but the effect is that **`POST /private-sends/:id/claim` is broken for any
Solana-authenticated recipient** — the keeper sweep still works, the manual "claim now"
fallback does not.

There is a second, quieter hazard behind it: the commitment is
`computeCommitment(secret, recipientWallet)` and the contract checks the claim's
`recipient` against it. Passing the *caller's* address assumes caller ==
`row.recipient_wallet`. Once the address types are reconciled, that assumption should be
made explicit — claim with `row.recipient_wallet` after authorising the caller, rather
than substituting the caller's own address for it.

## 2.4 Suggested fix

`getLinkedXAccountByWallet(req.walletAddress)` is already called on both paths, and the
row it returns carries `evmWalletAddress`. So the Robinhood-side address is in hand:

```ts
const senderWallet = sender.evmWalletAddress ?? sender.walletAddress;
```

with a `409` when no EVM address is linked yet, since a Robinhood-settled private send
genuinely cannot proceed without one.

Worth deciding deliberately rather than patching: **which identity `sender_wallet` is
meant to hold.** It is a Robinhood-side column (`PrivateSendPool` lives on chain 13746),
so the EVM address is the consistent answer — but the frontend queries it with whatever
address the user has connected, so both halves have to agree. A general
`requireEvmWallet(req)` helper would close the whole class of these rather than the two
call sites above; `resolveTargetWallet()` and `/wallet/:address/*` have the same
EVM-only assumption.

Left unfixed pending that decision: it is value-adjacent code, and guessing at the
intended identity would be worse than asking.

---

# Recent API changes (landed, no action needed)

Three backend changes went in with the Solana frontend work.

## A. New — `GET /hashtags/user/:handle`

Specified in `FRONTEND-INTEGRATION.md` Module 6 but never implemented. The send box
needs it to tell "they'll get this instantly" from "this has to sit in ClaimEscrow until
they link an account".

```jsonc
// 200
{
  "handle": "jack",
  "linked": true,
  "wallet": "0x…",          // whichever wallet linked first
  "solanaWallet": "9xQe…",  // null when they can't receive a direct Solana transfer
  "hashtags": [{ "hashtag": "…", "name": "…", "total_volume_usd": 0 }]
}
```

Unlinked handles return `linked: false` with nulls rather than a 404, so the caller can
distinguish "no such link yet" from "lookup failed". Registered above `/hashtags/:name`
so the literal `user` segment isn't swallowed by the wildcard. Exposes nothing the bot's
own public replies don't already reveal.

Ownership reverse-lookup deliberately uses `evmWalletAddress ?? walletAddress`, since
`hashtags.owner_wallet` is Robinhood-side — the same distinction Issue 2 is about.

## B. `POST /relay/quote` now forwards `originChainId`, `destinationChainId`, `tradeType`

`fetchRelayQuote()` already accepted all three; the route destructured only five fields
and silently dropped them.

The frontend needs this to price a **payable** Robinhood call. `receivePayment` and
`donate` need a `msg.value` denominated in destination-chain ETH, but the user enters an
amount in SOL or USDC — so the value cannot be encoded until the bridge has been priced.
The flow is now: quote the plain bridge to `ROBINHOOD_CHAIN_ID` to read
`details.currencyOut.amount`, then re-quote with that value encoded into `txs`.

**Open question for you:** the two quotes are moments apart, so the executed value can
drift from the quoted one. If the delivered amount lands *under* the encoded
`msg.value`, the destination call reverts and the user takes a refund round-trip. Whether
Relay's own fill slippage already absorbs that, or whether we should encode a small
haircut, needs one real transaction to settle — we deliberately did **not** guess, since
a haircut applied on top of handling Relay already does would silently short every
recipient.

## C. `GetQuoteParams.destinationCurrency` is now optional

It was typed required but the route passed it through possibly-`undefined`, and Relay
rejects a quote with `destinationCurrency: undefined`. It now defaults to the
destination chain's native currency — `SOL_MINT` on Solana, the zero address on an EVM
chain — which is what a contract call wants anyway.

---

## Frontend context

Superseding the note that used to sit here: **the frontend is no longer the lagging
half.** It now executes on Solana and settles on Robinhood through Relay, per the
execution matrix in `FRONTEND-INTEGRATION.md` §3.

- Direct sends (SOL/USDC to a base58 address) and all xStocks trading are pure Solana —
  the wallet signs Solana instructions, no EVM wallet involved.
- Contract calls go out as Relay intents built in `src/lib/relay-actions.ts`.

One constraint is worth knowing, because it shapes what can ever move to Relay:

> Relay executes `txs` from its **solver's multicaller**, so on the Robinhood side
> `msg.sender` is the solver, never the user.

Verified against `contracts/src/HashtagResolver.sol`, that splits the surface in two:

| Relay-safe (value-only, or beneficiary named explicitly) | Sender-bound (reads `msg.sender` for ownership) |
| :-- | :-- |
| `renewSubscription` — contract comment: *"Callable by anyone"* | `registerHashtag` — `nftContract.mint(msg.sender, …)`, so the NFT would mint **to the solver** |
| `receivePayment` — distributes to the payout table | `updatePayouts` / `updateMetadata` — `onlyHashtagOwner`, would revert `NotOwner` |
| `transferViaRecoveryPhrase` — authorises on the phrase, takes `newOwner` as an argument | the whole `SimpleEscrow` lifecycle, `CauseRegistry.withdraw` |
| `ClaimEscrow.deposit*`, `CauseRegistry.donate`, `PrivateSendPool.send` | |

Only the left column is routed through Relay. The right column still runs against the
user's own Robinhood wallet — `RELAY_SAFE_CALLS` in `src/lib/chain.ts` plus an
`assertRelaySafe()` guard make that boundary a runtime error rather than a comment
someone can drift past. **No contract change is requested here**; it is recorded so the
constraint isn't rediscovered later, and so nobody "helpfully" routes a registration
through Relay and mints handles to a solver.

Contracts remain Solidity on chain 4663; there are no Anchor programs, which is why
handle ownership and the escrow/cause lifecycles are still EVM-addressed — and why
Issue 2 matters.
