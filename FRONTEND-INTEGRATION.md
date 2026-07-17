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
  **Both fees are currently live: `resolver.registrationFee()` and
  `resolver.renewalFee()` are each `540000000000000` wei (0.00054 ETH, targeting
  ~$1 at the time this was set) — don't hardcode this, read it live from the
  contract, since it's a flat wei amount the owner adjusts manually as ETH price
  moves, not a live oracle peg. `msg.value` must match exactly or the tx reverts
  (`IncorrectNativeFee`).**
- **`receivePayment` (native) is always available**, regardless of what
  `settlementToken` is set to. `receiveTokenPayment` only works once `settlementToken`
  points at a real ERC-20 — it reverts `SettlementTokenNotSet` while native-only.
- **Payments can be paused** by TagioPay (`whenNotPaused` on both payment functions,
  not on register/renew/metadata) — handle the `EnforcedPause` revert gracefully.

---

## Endpoints

### `GET /hashtags?owner=0x...`
List hashtags owned by a wallet. Added specifically because the NFT isn't
enumerable onchain, so this is the only way to answer "what handles does this
wallet own" — no need for the localStorage-tracking workaround. Returns the same
row shape as `GET /hashtags/:name` (`active` ones only), as an array.
```json
[{ "hashtag": "tagiopay", "owner_wallet": "0x...", "name": "TagioPay", "...": "..." }]
```
400 if `owner` is missing or not a valid `0x`-address.

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

### `POST /auth/signin` — now two-step, read the response shape carefully
```json
{ "walletAddress": "0x...", "signature": "0x...", "message": "Welcome to TagioPay! Please sign this message to verify your wallet ownership." }
```
Two possible responses:
- **Already linked**: `{ "token": "<jwt>", "xLinked": true, "xHandle": "..." }` — same as before, use the token immediately.
- **Not linked yet**: `{ "needsXLink": true, "authorizeUrl": "https://x.com/i/oauth2/authorize?..." }` — **no token yet.** Redirect the browser (`window.location.href = authorizeUrl`, full-page redirect, not a fetch) to that URL. X handles auth, then redirects back to `${FRONTEND_URL}/auth/callback` on our backend, which itself redirects to **your** frontend at:
  - Success: `/auth/callback#token=<jwt>` (fragment, not query string — read via `location.hash`, never sent to any server)
  - Failure: `/auth/callback?error=<reason>`

  You need an `/auth/callback` route that reads one or the other and finishes the login (store the token, or show the error). There's no separate "check if linked" endpoint — just re-attempt `/auth/signin` after the redirect completes and you'll get the token branch this time.

### X-bot pending transactions (auth required — `Authorization: Bearer <token>`)

Background: our X bot lets users message it ("send 5 usdg to @friend") to request a
transfer. The bot never signs anything — it resolves the request and stores an
**unsigned** transaction, which the requesting user must review and sign themselves
in the dashboard with their own connected wallet.

#### `GET /transactions/pending`
Lists the current user's pending bot-created requests:
```json
[{
  "id": 1,
  "target_type": "x_account",
  "target_value": "friend",
  "resolved_to_wallet": "0x...",
  "token": "usdg",
  "amount": "5",
  "unsigned_to": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  "unsigned_data": "0xa9059cbb...",
  "unsigned_value": "0",
  "tweet_url": "https://x.com/i/status/1234567890",
  "status": "pending",
  "created_at": "..."
}]
```
To sign one: call `sendTransaction` (viem/wagmi) with `{ to: unsigned_to, data: unsigned_data, value: unsigned_value }` directly — no ABI needed, it's already-encoded calldata. `token: "native"` rows have `unsigned_data: "0x"` (plain value transfer); `token: "usdg"` rows are ERC-20 `transfer()` calldata aimed at the USDG contract, not the recipient — that's expected, don't send value there.

`tweet_url` links to the tweet that prompted the request (nice-to-have: show it as "requested from this post" on the pending-tx card) — it's `null` for DM-triggered requests, since there's no public tweet to point to.

#### `POST /transactions/pending/:id/broadcast`
After the user signs and the tx confirms, report it back:
```json
{ "tx_hash": "0x..." }
```
Backend verifies the receipt succeeded onchain before marking it done. 409 if it's not still `pending` (already broadcast/cancelled), 400 if the tx reverted.

#### `POST /transactions/pending/:id/cancel`
No body. Lets the user dismiss a request without signing it.

---

## Namespace rules (client-side validation, mirrors the contract)

- Normalize: strip leading `#`, lowercase.
- Pattern: `^[a-z0-9_]{3,32}$`.
- Payout splits must sum to exactly `10000` bps before you submit `updatePayouts` onchain — the contract will revert otherwise, but validate client-side first for a good error message.
