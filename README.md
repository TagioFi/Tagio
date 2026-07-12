![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.x-000000?logo=bun&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![Foundry](https://img.shields.io/badge/Foundry-Solidity-black?logo=ethereum&logoColor=white)

# TagioPay

TagioPay replaces cryptographic hex wallet addresses with human-readable, programmable
onchain `#hashtag` handles. A hashtag resolves to a payment destination, a set of
payout splits, and linked social identities — all enforced onchain, on **Robinhood
Chain** (EVM L2, Arbitrum Nitro stack).

This is the Robinhood Chain rebuild of the hashtag identity product previously shipped
as QPay Hashtag on Solana and Base. QPay Cards (crypto → gift cards) is a related but
separate sibling product and is not part of this repo.

## Core features

| Feature | Description |
| :--- | :--- |
| Hashtag registry | One NFT per hashtag, subscription-based (annual renewal + grace period), lowercase `[a-z0-9_]{3,32}` namespace |
| Programmable payouts | Register a split of wallets (basis points, must sum to 10000) — every payment to the hashtag fans out automatically |
| Social binding | Link Twitter/X, Telegram, Discord handles via a signed-message verification handshake |
| Recovery phrase | Hashtag ownership can be recovered via a pre-committed recovery phrase hash, independent of the original wallet |
| Fast resolution | `GET /hashtags/resolve/:hashtag` — Redis-cached (60s), sub-50ms target for payment routing and social bots |

## How it works

1. Owner registers a hashtag onchain (mints an NFT, pays a registration fee in the settlement token).
2. Owner configures payout splits and social links via the resolver contract.
3. Anyone pays `#hashtag` — the resolver contract splits the payment across the configured wallets in one transaction.
4. The frontend calls `POST /hashtags/confirm-transaction` after every onchain action; the backend decodes the resolver's event logs and syncs Postgres.

## Repo structure

```
/                 Next.js frontend (owned by a separate frontend developer)
/backend          Bun + Express + Postgres API
/contracts        Foundry — HashtagResolver + HashtagNFT (Solidity)
/technical-docs   Product/PRD documents
FRONTEND-INTEGRATION.md   API + ABI handoff doc for the frontend developer
```

## Getting started

### Backend
```bash
cd backend
bun install
cp .env.example .env   # fill in DATABASE_URL, ROBINHOOD_RPC_URL, contract addresses
bun run check           # typecheck
bun test                # unit tests
bun dev                  # local dev server (needs real Postgres + RPC)
```

### Contracts
```bash
cd contracts
forge install
forge build
forge test
```

### Frontend
```bash
bun install
cp .env.example .env
bun dev
```

## Roadmap

- [x] HashtagResolver + HashtagNFT contracts (Foundry, tested)
- [x] Backend scaffold (Postgres schema, event-sync service, resolve/auth/transactions routes)
- [ ] Deploy contracts to Robinhood Chain testnet
- [ ] Wire real Postgres + RPC credentials, deploy backend
- [ ] Frontend build-out (separate developer)
- [ ] Social verification bot layer (Telegram/X)

## Tech stack

Next.js 15 · Tailwind · Bun · Express · PostgreSQL · viem · Foundry/Solidity · Robinhood Chain (EVM L2)
