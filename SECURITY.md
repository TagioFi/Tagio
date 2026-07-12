# Security Policy

## Scope

In scope: `contracts/` (HashtagResolver, HashtagNFT), `backend/` (API, event-sync
service, auth), and the resolution/caching layer. Out of scope: the frontend
(owned by a separate developer) and third-party infra (RPC providers, Postgres host).

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Send a report to: **david.nzube.official22@gmail.com**

Include: affected component, reproduction steps, and impact (funds at risk,
data exposure, etc.). We'll acknowledge within 48 hours and aim to patch
critical issues within 7 days.

## Reporter expectations

Good-faith security research against this project will not result in legal
action. Reporters are credited in the fix unless they ask otherwise.

## Known attack surfaces

- **Payout split manipulation** — `updatePayouts` must be owner-gated and enforce `sum(percentageBps) == 10000`; a bypass would let an attacker redirect payments.
- **Recovery-phrase brute forcing** — `recoveryHash` is a single `keccak256` commitment; weak phrases are guessable. Frontend must enforce high-entropy phrases.
- **Reentrancy on payment splitting** — `receivePayment`/`receiveTokenPayment` push funds to multiple external wallets in a loop; both are `nonReentrant` but any future change to the distribution logic must preserve checks-effects-interactions.
- **Event-sync trust boundary** — `POST /hashtags/confirm-transaction` decodes onchain events and writes them verbatim to Postgres; the backend must always re-derive state from the receipt/contract, never trust client-supplied metadata.
- **Subscription-expiry griefing** — anyone can call `renewSubscription`, so it must never be gated in a way that lets a third party lock out the actual owner.

## Deployed contract addresses

Not yet deployed. Will be added here once live on Robinhood Chain testnet/mainnet.
