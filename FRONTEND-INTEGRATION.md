# TagioPay Frontend Integration Guide

Internal document for the frontend developer. Not required reading for backend/contracts work.

---

## Repo layout

Monorepo. Here's what lives where:

```
/                        ← Vite + TanStack Start frontend (your domain)
  src/routes/            ← TanStack Router routes (__root.tsx, index.tsx, dashboard.tsx)
  src/pages/             ← page-level components
  src/components/ui/     ← shadcn UI components
  src/lib/utils.ts       ← cn() utility
  src/server.ts          ← SSR entry (TanStack Start)
  .env / .env.example    ← frontend env vars (VITE_API_URL)

/backend/                ← Bun + Express API (NOT yours — do not touch)
  src/routes/            ← hashtags, resolve, transactions, auth, health
  src/services/onchain/  ← viem client + resolver ABI
  db/migrations/         ← Postgres schema

/contracts/              ← Foundry (Solidity) — NOT yours
  src/HashtagResolver.sol
  src/HashtagNFT.sol
```

> This frontend was merged in from what used to be a separate repo
> (`tik-maker5/tagio`, built via Lovable). That repo still exists and is still
> connected to Lovable — if you keep developing through Lovable, point it at
> **this** repo (`tagiopay`) instead, or changes will land in the old repo and
> need to be re-merged by hand. `.lovable/project.json` and `AGENTS.md` came
> across as-is; update `.lovable/project.json` if you reconnect Lovable here.

---

## Backend URL

**Live:**
```
VITE_API_URL=https://api.tagiopay.com
```
For local frontend dev against the live backend, use this same value — there's no
separate staging backend right now. `http://localhost:3001` still works if you're
also running the backend locally (`cd backend && bun dev`, needs its own `.env`).

---

## Contract addresses

**Live on Robinhood Chain mainnet:**

| | |
| :--- | :--- |
| Chain ID | `4663` |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| `HashtagResolver` | `0x1326bBA97a060b6c4B445E0dD83342203795725E` |
| `HashtagNFT` | `0x364469b9709D7E0E2bf6a049Aca3a8B436FbcEa3` |

This is mainnet — real funds, real gas, permanent hashtag registrations. Test
carefully; there's no testnet deployment to throw away mistakes on right now.

You'll need the resolver address + ABI to build any transactions yourself
(register/pay/update) directly from the frontend via viem/wagmi — the backend
does not submit transactions, it only reads and indexes them.

The resolver ABI (functions + events) lives at `backend/src/services/onchain/abi.ts`
and mirrors `contracts/src/HashtagResolver.sol` — copy it into your wagmi/viem config.

---

## Core flow

1. **Register/pay/update onchain directly** — the frontend calls the resolver contract
   itself (register, receivePayment, updatePayouts, updateMetadata, renewSubscription,
   transferHashtag, transferViaRecoveryPhrase). The backend does not do this for you,
   and there's no gas sponsorship — every call is sent (and its gas paid) by the user's
   own wallet.
2. **Confirm with the backend** — after every onchain action, call:

   `POST /hashtags/confirm-transaction`
   ```json
   { "tx_hash": "0x...", "hashtag_raw": "#finance" }
   ```
   The backend fetches the receipt, decodes the resolver's events, and syncs Postgres.
   Do this immediately after the transaction confirms, before reading the hashtag back.

### Things that matter for how you build the register/pay screens

- **Ownership is the NFT, not a stored field.** `hashtagOwner(hashtag)` reads the
  HashtagNFT's `ownerOf` directly. A hashtag can also change hands via a plain
  ERC-721 transfer (marketplace, wallet-to-wallet) — that's fully supported and
  reflected immediately, but it won't emit a resolver event, so the backend's DB copy
  of `owner_wallet` will look stale until the new owner touches the resolver again
  (e.g. `updateMetadata`) or you add a manual re-sync path.
- **Subscription is 30 days + a 72-hour grace period.** After that, the hashtag stops
  accepting payments (`SubscriptionExpired`) and — once past both — becomes
  registrable by *anyone*, which burns the old NFT and wipes its payouts/socials.
  Surface the expiry countdown; a lapsed hashtag isn't recoverable by re-renewing,
  it can be taken by someone else.
- **`registerHashtag` and `renewSubscription` are `payable`.** Fees are denominated
  in whatever `settlementToken` currently is: `address(0)` means native Robinhood ETH
  (send exact fee as `msg.value`), a real ERC-20 address means approve + zero
  `msg.value`. Read `resolver.settlementToken()` before building the fee-payment step.
- **`receivePayment` (native) is always available**, regardless of what
  `settlementToken` is set to. `receiveTokenPayment` only works once `settlementToken`
  points at a real ERC-20 — it reverts `SettlementTokenNotSet` while native-only.
- **Payments can be paused** by TagioPay (`whenNotPaused` on both payment functions,
  not on register/renew/metadata) — handle the `EnforcedPause` revert gracefully.

---

## Endpoints

### `GET /hashtags/check/:name`
```json
{ "available": true }
```

### `GET /hashtags/:name`
Full hashtag record:
```json
{
  "hashtag": "finance",
  "owner_wallet": "0x...",
  "name": "...",
  "image_url": "...",
  "website_url": "...",
  "active": true,
  "registered_at": "...",
  "expires_at": "...",
  "total_volume_usd": 0,
  "payouts": [{ "wallet": "0x...", "percentage_bps": 10000 }],
  "socials": [{ "key": "twitter", "value": "@linda" }]
}
```

### `GET /hashtags/resolve/:hashtag`
Fast path for payment routing / social bots (Redis-cached, 60s TTL):
```json
{
  "hashtag": "finance",
  "primaryDestination": "0x...",
  "payouts": [{ "wallet": "0x...", "percentage_bps": 10000 }],
  "expiresAt": "..."
}
```
404 if the hashtag isn't active.

### `POST /hashtags/confirm-transaction`
See "Core flow" above.

### `GET /transactions/hashtag?hashtag=...`
```json
[{ "signature": "0x...", "amount": "...", "token": "...", "is_native": true, "chain": "robinhood", "timestamp": "..." }]
```

### `POST /auth/signin`
```json
{ "walletAddress": "0x...", "signature": "0x...", "message": "Welcome to TagioPay! Please sign this message to verify your wallet ownership." }
```
→ `{ "token": "<jwt>" }`. Send back as `Authorization: Bearer <token>` on any
protected route added later.

---

## Namespace rules (client-side validation, mirrors the contract)

- Normalize: strip leading `#`, lowercase.
- Pattern: `^[a-z0-9_]{3,32}$`.
- Payout splits must sum to exactly `10000` bps before you submit `updatePayouts` onchain — the contract will revert otherwise, but validate client-side first for a good error message.
