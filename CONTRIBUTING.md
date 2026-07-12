# Contributing to TagioPay

## What's wanted right now

- Robinhood Chain testnet deployment scripts and address bookkeeping
- Backend: real Postgres/RPC wiring, additional resolver event coverage
- Contracts: gas optimization passes on `HashtagResolver`, additional invariant tests
- Frontend: owned by a separate developer — see `FRONTEND-INTEGRATION.md` before touching `app/` or `components/`

## Out of scope

- QPay Cards (separate repo, separate product)
- Solana/Base hashtag support — this repo targets Robinhood Chain only

## Setup

```bash
git clone <repo-url>
cd tagiopay
bun install                 # frontend
cd backend && bun install   # backend
cd ../contracts && forge install  # contracts
```

Copy `.env.example` → `.env` in the root and in `backend/`, filling in real values.

## Workflow

Fork → branch → PR. One concern per PR. Contract changes need `forge test` passing;
backend changes need `bun run check` and `bun test` passing before review.

## Commit style

Imperative, present tense, plain English. No AI attribution trailers.

## Bug reports

Include: what you did, what happened, what you expected, and repro steps
(hashtag involved, tx hash if onchain, request/response if API).

See `SECURITY.md` for vulnerability reports instead of filing a public issue.
