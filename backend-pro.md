# Backend issues & recent API changes

Status update on backend issues and architectural alignment for the Solana frontend integration.

| # | Issue | Status | Resolution |
| :-- | :-- | :-- | :-- |
| 1 | `x_accounts` duplicate key on X account linking | **CLOSED (Fixed)** | Upsert switched to `ON CONFLICT (x_user_id)` + 409 error handling |
| 2 | Solana-authenticated `walletAddress` used where an EVM address is required | **CLOSED (Fixed)** | `GET /private-sends` accepts base58/0x; linked EVM addresses resolved for contract calls |
| — | API changes landed frontend-side (§A–C) | **CONFIRMED** | All verified and live on `https://api.tagiopay.com` |

---

# Issue 1 — `x_accounts` duplicate key on X account linking (RESOLVED)

**Fixed in `backend/src/services/x/xAccountService.ts` (`linkXAccount`)**

```sql
INSERT INTO x_accounts (wallet_address, solana_wallet_address, evm_wallet_address, x_user_id, x_handle)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (x_user_id) DO UPDATE SET 
  x_handle              = EXCLUDED.x_handle,
  solana_wallet_address = COALESCE(EXCLUDED.solana_wallet_address, x_accounts.solana_wallet_address),
  evm_wallet_address    = COALESCE(EXCLUDED.evm_wallet_address,    x_accounts.evm_wallet_address)
```

* **Error Sanitization**: Added a `try/catch` catching SQLSTATE `23505` to throw a clean `409 Conflict` (`"This wallet address or X account is already linked to another user."`) instead of leaking raw Postgres constraint names to the client.

---

# Issue 2 — Solana `walletAddress` in EVM Endpoints (RESOLVED)

**Fixed in `backend/src/routes/privateSends.ts`**

1. **`GET /private-sends`**:
   * Accepts both Solana base58 and EVM `0x` addresses (`wallet` query param).
   * Automatically resolves all cross-chain bound addresses (`solana_wallet_address`, `evm_wallet_address`, `wallet_address`) via `getLinkedXAccountByWallet()`, returning the merged private send history.
2. **`POST /private-sends`**:
   * Resolves the caller's and recipient's linked EVM addresses (`sender.evmWalletAddress` and `recipientAccount.evmWalletAddress`).
   * Returns clean `409` if either party has not yet linked an EVM address for Robinhood settlement.
3. **`POST /private-sends/:id/claim`**:
   * Resolves the caller's bound address against `row.recipient_wallet`.
   * Calls `buildUnsignedClaim(row.commitment, row.recipient_wallet, row.secret)` using the exact recorded `recipient_wallet` so onchain commitment verification succeeds with 0 type/address errors.

---

# API Alignment & Answers to Open Questions

## A. `GET /hashtags/user/:handle`
* Fully confirmed and live. Registered above `/hashtags/:name` to prevent route collision.

## B. `POST /relay/quote` & Destination Value Slippage
* `fetchRelayQuote()` forwards `originChainId`, `destinationChainId`, `tradeType`, and `appFees` (with the **0.15% fee**).
* **On Slippage / Reverts**: Relay's quote solver buffers routing variance under `tradeType: "EXACT_INPUT"`. The frontend flow of quoting the bridge to read `details.currencyOut.amount` and re-quoting with encoded `txs` is the correct, standard Relay pattern.

## C. `destinationCurrency` Defaulting
* Confirmed: defaults to the destination chain's native token (`SOL_MINT` on Solana, `0x0000000000000000000000000000000000000000` on EVM).

---

# Architecture: Relay Solver vs Sender-Bound Execution

The frontend's division in `src/lib/chain.ts` (`RELAY_SAFE_CALLS`) is **100% correct**:

| Execution Path | Actions | Method |
| :--- | :--- | :--- |
| **Relay Solver (Cross-Chain)** | `receivePayment`, `renewSubscription`, `ClaimEscrow.deposit`, `CauseRegistry.donate`, `transferViaRecoveryPhrase` | Routed via Relay `/relay/quote` from Solana with 0.15% fee |
| **Pure Solana Execution** | Direct Sends (SOL/USDC), xStocks Trading (`AAPLx`, `TSLAx`) | Direct Solana transfer / Relay same-chain Jupiter swap |
| **Owner-Bound / Recovery** | `registerHashtag`, `updatePayouts`, `updateMetadata` | Signed directly with bound wallet or executed via `transferViaRecoveryPhrase` |
