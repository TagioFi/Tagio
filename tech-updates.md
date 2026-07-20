# TagioPay — Tech Updates

Post-launch shipping plan. Builds on the live X bot (mentions/DMs, deterministic
command parsing, non-custodial pending-transaction sign-off).

Stack reference: Vite + TanStack Start frontend (root, owned by Pascal), Bun +
Express API (`backend/`), Supabase Postgres, Redis (Aiven), viem for Robinhood
Chain reads/writes, X API v2 (OAuth2 + bot polling), Groq (intent parsing only —
never reply generation, per X's automation rules), Blockscout Pro API (holder
rankings), Foundry/Solidity contracts.

---

## Wave 1 — Unclaimed transactions (foundation for giveaway/airdrop)

Must ship first: giveaway and airdrop both need to pay X accounts that have
never linked a TagioPay wallet. Without this, most winners/holders resolve to
nothing.

- **Unclaimed allocations table**
  - Backend: New `unclaimed_allocations` table — `x_user_id`, `x_handle`, `token`,
    `amount`, `source` (giveaway/airdrop/direct-send), `source_ref`, `status`
    (unclaimed/claimed/expired), `created_at`, `expires_at` (`created_at + 120
    days`, per confirmed policy).
  - Backend: `resolveTargetWallet` (in `services/x/targetResolver.ts`) already
    returns `null` for an unlinked X handle — any code path that would otherwise
    silently drop the recipient instead creates an `unclaimed_allocations` row.
  - Backend: A daily sweep (reuses the existing cron-style interval pattern from
    the bot poller) marks anything past `expires_at` as `expired`.

- **Claim-on-link hook**
  - Backend: `linkXAccount()` (`services/x/xAccountService.ts`) — after a
    successful link, query `unclaimed_allocations` for that `x_user_id`, and for
    each unclaimed row create a normal `pending_transactions` row (same shape the
    bot already produces), then mark the allocation `claimed`.
  - Frontend: Dashboard's pending-transactions view (already spec'd in
    `FRONTEND-INTEGRATION.md`) needs no new endpoint — claimed allocations arrive
    as ordinary rows in `GET /transactions/pending`. Optionally show a "🎉ount
    unlocked from a past giveaway/airdrop" badge on rows where `source !=
    'x_bot'`, using the existing `source`/`source_ref` fields already on
    `pending_transactions`.

- **Batch-disperse contract (new Solidity contract)**
  - **Backend/Contracts**: Giveaway and airdrop both pay many recipients from one
    signature — the existing `HashtagResolver` has no multi-recipient primitive
    (its `PayoutConfig` is tied to a specific hashtag's pre-configured split, not
    ad-hoc winners). Needs a new, small, standalone contract (Disperse-style):
    one function taking `(address[] recipients, uint256[] amounts)` for native
    ETH, and a token variant taking a pre-approved ERC-20, distributing to every
    recipient in a single transaction.
  - Contracts: `contracts/src/BatchDisperser.sol` + Foundry tests (empty-array
    revert, mismatched-array-length revert, correct per-recipient amounts, no
    dust left in the contract, reentrancy safety identical to
    `HashtagResolver`'s existing pattern) + `contracts/script/DeployDisperser.s.sol`.
  - Backend: `services/x/onchain/batchDisperserAbi.ts` (mirrors the new
    contract), and unsigned-tx building for giveaway/airdrop routes through this
    instead of one `UnsignedTransfer` per recipient.

---

## Wave 2 — Generic follow-up / clarification asker

Ships before giveaway and airdrop since both lean on it (bullpost-airdrop's
missing headcount is the motivating case, but this is built generic —
any future command with an ambiguous or missing parameter reuses it).

- **Clarification state**
  - Backend: New `pending_clarifications` table — `x_user_id`, `source`
    (mention/dm), `source_ref`, `partial_intent` (jsonb — whatever Groq
    extracted so far), `missing_slot` (enum, see fixed reply bank below),
    `created_at`, `expires_at` (`created_at + 30 minutes`, confirmed).
  - Backend: Before parsing a new incoming mention/DM as a fresh command, check
    for an open (non-expired) clarification from that `x_user_id` first — if one
    exists, pass the new message + the stored `partial_intent` to Groq as an
    answer-to-a-specific-slot, not a new command. Merge the result; if still
    incomplete, ask the next missing thing (extends `expires_at`); if complete,
    proceed into the normal resolve → build → pending-tx flow and delete the
    clarification row.
  - Backend: Expired clarifications are dropped silently on the next sweep — no
    reply sent (avoids spending a reply-write on a conversation the user already
    walked away from).

- **Fixed reply bank (one templated string per confusable slot — Groq only ever
  fills a slot enum, never generates the reply text itself)**
  - `missing_amount` → "How much should this send/give away in total?"
  - `missing_token` → "Which token — ETH or USDG?"
  - `missing_recipient_count` → "How many people should this go to?"
  - `ambiguous_target` → "Who should receive this — a hashtag, wallet, X account, or token holders?"
  - `missing_requirement_threshold` → "What's the minimum — likes, comments, or retweets — for this giveaway?"
  - Frontend: none — this is entirely a DM/mention-reply flow, no dashboard surface.

---

## Wave 3 — Giveaway

"@TagioPayBot send 0.0005 eth to any random 20 users in the comments," phrased
however — Groq extracts intent (action=giveaway, amount, token, winner count,
optional requirement), replies stay fixed/templated regardless of how the
request was worded.

- **Groq-based intent extraction**
  - Backend: `services/x/intentParser.ts` — replaces (for giveaway/airdrop
    specifically; plain sends keep the existing deterministic regex, since it
    already works and free-text parsing is unnecessary overhead for that path)
    free-text classification via Groq, returning a structured
    `{ intent: "giveaway" | "airdrop" | "unrecognized", ...slots }`. Output is
    consumed as data only — every user-facing reply stays a fixed template
    (compliance boundary from X's automation rules: parsing intent via AI is
    fine, generating the reply text is not, without prior written approval).
  - Backend: `GROQ_API_KEY` already added to `backend/.env` and Render — wire
    `config.groq.apiKey` into `config/index.ts`.

- **Giveaway must be a reply-in-thread**
  - Backend: The request tweet must carry `referenced_tweets`/`conversation_id`
    (a reply to the target post) — that's how we know which post's comments to
    pull winners from. A bare mention with no reply context can't run a
    giveaway; the bot replies with a fixed "reply to the post you want to run
    this on" message instead of guessing.

- **Requirement checking (likes / followers / comments / retweets — bookmarks
  dropped, no API surface for arbitrary-post bookmark lists)**
  - Backend: `services/x/giveawayRequirements.ts` — checks against
    `GET /2/tweets/:id/liking_users`, `GET /2/tweets/:id/retweeted_by`, a
    `conversation_id` search for comments, and follower-count filtering on
    candidate commenters (via `GET /2/users/:id`).
  - Backend: If the requirement is already met at request time, resolve winners
    immediately (random sample of N from the qualifying pool) and build the
    payout.

- **The "waiter"**
  - Backend: New `giveaway_requests` table — `source_post_id`,
    `requester_wallet`, `requirement_type`, `requirement_threshold`,
    `winner_count`, `amount`, `token`, `status` (waiting/fulfilled/expired),
    `created_at`, `expires_at` (`created_at + 1 hour`, confirmed hard cap).
  - Backend: A dedicated polling loop (own interval, own X rate-limit budget —
    separate from mentions/DMs/giveaway-checks, since likes/retweets/comments
    lookups are each their own endpoint with their own 15-min window) re-checks
    open `giveaway_requests` periodically. On requirement met: random-select N
    qualifying users, resolve each to a wallet (linked → normal path; unlinked →
    `unclaimed_allocations`, Wave 1), build one `BatchDisperser` call, reply
    naming the chosen winners (fixed template with interpolated handles, not
    freeform). On 1-hour expiry with requirement unmet: mark `expired`, reply
    with the fixed "giveaway requirements weren't met in time" message.
  - Distribution: **equal split** among winners (confirmed — luck-based, not
    merit-based, unlike airdrop).

- **Frontend**: No new surface beyond what Wave 1 already added — winners see
  the resulting transaction in their existing `GET /transactions/pending` view
  (linked users) or claim it after linking (unlinked users, Wave 1's hook).

---

## Wave 4 — Airdrop

Unlike giveaway, no waiting — checks are synchronous. If the requirement can't
be resolved right now (e.g. token has no holders, keyword has zero recent
posts), the bot declines immediately rather than sitting on it.

- **Hold-airdrop** — "@TagioPayBot airdrop the top 50 holders of CA 0.3 eth"
  - Backend: `services/x/blockscout.ts` — wraps
    `GET https://api.blockscout.com/4663/api/v2/tokens/{address}/holders`
    (confirmed working against USDG, `BLOCKSCOUT_API_KEY` already in
    `backend/.env`/Render pending activation). Paginate to the requested N.
  - Backend: **Balance-weighted** distribution (confirmed) — pool amount split
    proportional to each holder's balance from the same response, not equal
    split, not a separate volume/trade-history lookup.
  - Backend: Resolve each holder address — TagioPay has no reverse
    wallet→X-handle lookup, so hold-airdrop recipients are always paid directly
    by wallet address (no `unclaimed_allocations` path applies here; that
    mechanism is specifically for X-identity-based targets).

- **Bullpost-airdrop** — "@TagioPayBot airdrop users who bullposted <keyword>
  40 usdg"
  - Backend: `GET /2/tweets/search/recent` filtered by keyword, hard-capped to
    X's own 7-day search window (confirmed — this cap is a real API constraint,
    not an arbitrary choice).
  - Backend: Recipient headcount is a required slot with no sane default — if
    missing from the initial request, this is exactly the case Wave 2's
    follow-up asker handles (`missing_recipient_count`).
  - Backend: Engagement scoring per matching post (likes + retweets + replies,
    weighted — exact formula TBD, flag for a follow-up decision when this wave
    starts) → each poster's share of the pool proportional to their score
    (confirmed: **percentage-of-engagement-score** split, merit-based like
    hold-airdrop, unlike giveaway's equal split).
  - Backend: Poster resolution reuses the same linked/unlinked branching as
    giveaway (linked → normal pending tx; unlinked → `unclaimed_allocations`).

- **Requester gating**: both airdrop types require a linked TagioPay+X account
  (confirmed, same rule as normal sends and giveaway — it's their wallet funding
  the pool).

- **Frontend**: No new surface — same `GET /transactions/pending` /
  `unclaimed_allocations`-claim path as giveaway.

---

## Wave 5 — Donation / Crowdfunding

"$donate 50usdg to @RedCross" for a direct donation (plain payment, reuses the
existing send path); "$cause create/donate/leaderboard/withdraw" for a public,
ongoing fundraiser with an on-chain paper trail. Confirmed direction (2026-07-20).

- **Cause registry (new, lightweight -- not a hashtag)**
  - Contracts: `CauseRegistry.sol` -- deliberately NOT another HashtagResolver.
    A cause has no NFT, no subscription/expiry, no transfer -- just
    `createCause(name, organizer, goal, token)`, `donate(causeId, amount)`
    (tracks per-donor cumulative totals on-chain for the leaderboard, since
    that needs to be trustlessly readable), and `withdraw(causeId, amount,
    proofUrl)` restricted to the organizer, emitting a `Withdrawal(causeId,
    amount, proofUrl)` event.
  - Backend: `services/x/causeService.ts` wraps contract reads (progress,
    leaderboard, remaining balance) for the bot's reply text and a dashboard
    "Causes" view.
  - Proof images: `CLOUDINARY_URL` is already in `backend/.env` (used
    elsewhere in the QPay family) -- the bot/dashboard uploads the
    organizer's attached image there and passes the resulting URL as
    `proofUrl`, so "proof" is a real, permanent link, not a promise.

- **Bot commands**: `$donate <amount><token> to "<cause name>"` / `to
  @handle`, `$cause create "<name>" goal:<amount><token>
  wallet:0x...`, `$cause donate <amount><token> #CAUSE-<id>`, `$cause
  leaderboard #CAUSE-<id>`, `$cause withdraw #CAUSE-<id> <amount> "<reason>"`.
  Deterministic parsing (new patterns in `commandParser.ts`) -- no Groq
  needed, these commands are already fully structured.

- **Frontend**: new "Causes" nav view -- browse/search active causes, a
  progress bar + leaderboard per cause (mirrors the Trade page's read-then-
  sign pattern), and a "create a cause" form for organizers.

---

## Wave 6 — Generic Escrow

Create -> Accept -> Deliver -> Release, no on-chain dispute/jury system in
v1 (confirmed 2026-07-20 -- if delivery/release goes wrong, there's no
automated resolution yet; see the safety net note below). Generic, not
sector-specific -- freelance work is the motivating case, but any bilateral
"I pay once you deliver" agreement fits the same four states.

- **Contract**: `SimpleEscrow.sol` -- `create(counterparty, amount, token,
  description)` (creator funds it immediately, matching the image's "500USDC
  locked" on creation), `accept(escrowId)` (counterparty-only, starts a
  fixed deadline), `deliver(escrowId, proofUrl)` (counterparty-only, doesn't
  move funds yet -- just marks delivered and stamps the proof link),
  `release(escrowId)` (creator-only, pays the counterparty). A
  `cancelBeforeAccept(escrowId)` refund path covers the "counterparty never
  responds" case without needing a dispute system at all.
  - **Known gap, flagged not hidden**: once accepted, there's no way to
    resolve a disagreement (creator refuses to release, or counterparty
    delivers nothing) other than off-chain conversation -- no jury, no
    arbitrator. A cheap safety net worth adding even in v1: if the deadline
    passes with no `deliver` call, auto-refund the creator; if delivered but
    not released within a second grace window, allow the counterparty to
    force-release to themselves (protects against a creator who ghosts after
    receiving real work). Both are just timers, not real dispute resolution.
  - Real dispute resolution (jury voting, reputation-weighted, the
    `$dispute`/`$jury` flow from the original idea) is a substantially bigger
    build -- deferred, not part of this wave.

- **Bot commands**: `$escrow "<description>" <amount><token>
  @counterparty`, `$accept #<id>`, `$deliver #<id> <proof url>`, `$release
  #<id>`.

- **Frontend**: an "Escrow" nav view listing your open escrows (both sides --
  as creator and as counterparty), with the four action buttons surfaced
  contextually based on status and which side of it you're on.

---

## Wave 7 — Private Send

Shields the sender's identity from the *recipient* (confirmed 2026-07-20) --
the recipient's wallet only ever shows a transfer from the pool contract,
never the sender's own address. Worth being precise about what this is and
isn't: this is practical/casual privacy, not cryptographic anonymity. A
sophisticated chain-analysis observer could still potentially correlate a
deposit and a later claim by timing and amount, since both transactions are
fully public -- genuine unlinkability (immune to that kind of correlation)
needs real cryptographic mixing (zk-SNARK commitment/nullifier schemes, e.g.
Tornado-Cash-style), which is a much larger, separate undertaking and is
explicitly out of scope for this wave. If real anonymity turns out to matter
later, that's its own project, not an extension of this one.

- **Contract**: `PrivateSendPool.sol` (ETH + USDG) -- `send(commitment)`
  (payable/token-pulling, sender deposits tagged by an opaque commitment
  rather than the recipient's address in cleartext), `claim(commitment,
  proof)` (recipient -- or the keeper on their behalf -- withdraws to
  whichever wallet the proof authorizes). Mechanically close to
  `ClaimEscrow`, but keyed by a claim commitment instead of an X-user-id
  hash, and with a keeper path added.

- **The keeper (confirmed 2026-07-20)**: TagioPay's own backend runs an
  automated keeper -- its own hot wallet -- that watches for claimable sends
  and executes the claim on the recipient's behalf, so it lands in their
  wallet without them lifting a finger. The keeper pays real gas from its
  own wallet, funded by a **keeper fee the sender pays upfront**, bundled
  into the send amount. This is explicitly not "gas sponsorship" in the
  sense the rest of TagioPay avoids -- the sender is paying for the
  service, just not literally denominated as their own gas. The recipient
  can always self-claim manually instead (skip the keeper, pay their own
  gas), so the non-custodial path never goes away entirely.
  - **New operational surface, flagged plainly**: this is the first place
    in TagioPay where the backend itself directly signs and broadcasts
    value-moving transactions, not just off-chain attestations (compare
    `ClaimEscrow`'s attestor, which only ever signs a message, never
    broadcasts). The keeper wallet needs its own funding, balance
    monitoring, and refill process, and is a real (bounded -- only its own
    gas float, never user funds) custodial risk surface that didn't exist
    anywhere else in the system before this wave.

- **Bot commands**: `$psend <amount><token> to @handle` (sender-side,
  deterministic parsing); claiming is automatic via the keeper, with a
  manual `$claim` fallback for the recipient.

- **Frontend**: a "Private send" option alongside Send, and claimable
  private sends surface in the Pending tab like everything else, for the
  manual-claim path.

---

## Wave 8 — Telegram

The most self-contained wave — reuses the entire command-parser →
target-resolver → tx-builder → pending-transaction core already built for X,
adding Telegram purely as a second transport. Optional linking (confirmed, not
mandatory like X).

- **Telegram account linking**
  - Backend: New `telegram_accounts` table — `wallet_address`, `telegram_user_id`,
    `telegram_username`, `linked_at`. No OAuth dance needed — Telegram's Bot API
    linking pattern is a deep link (`t.me/TagioPayBot?start=<one-time-token>`);
    backend generates the token, dashboard shows/links it, bot's `/start`
    handler consumes it and calls `linkTelegramAccount()`.
  - Frontend: Dashboard settings — a "Link Telegram" button (optional, unlike
    the mandatory X link during signin) that requests a token from a new
    `POST /telegram/link-token` (auth required) and renders/deep-links it.

- **Telegram bot service**
  - Backend: Telegram's Bot API has no X-style pay-per-use billing or tight
    rate limits, so this can use long-polling (`getUpdates`) or a webhook
    without the mentions/DMs rate-limit split X needed. `services/telegram/`
    mirrors `services/x/` structure: `botClient.ts` (Telegram Bot API wrapper),
    reuses the *same* `commandParser.ts` / `intentParser.ts` (Groq) /
    `targetResolver.ts` / `txBuilder.ts` / `pendingTransactionService.ts` — no
    domain logic duplicated, only the transport layer is new.
  - Backend: `TELEGRAM_BOT_TOKEN` new env var (from @BotFather).

- **Frontend**: `GET /transactions/pending` already returns pending
  transactions regardless of source (`x_bot` vs a new `telegram_bot` source
  value) — no new dashboard surface needed beyond the link button above.

---

## New env vars this plan introduces

```
GROQ_API_KEY=              # already added to backend/.env + Render, pending activation
BLOCKSCOUT_API_KEY=        # already added to backend/.env, pending activation
CLOUDINARY_URL=            # already in backend/.env -- reused by Wave 5/6's proof-of-withdrawal/delivery images
CLAIM_ESCROW_ATTESTOR_PRIVATE_KEY=  # already in backend/.env -- never holds funds, never broadcasts
KEEPER_PRIVATE_KEY=        # already in backend/.env -- separate dedicated key from the attestor above (2026-07-20), funded hot wallet, gas float only, never holds user funds -- deployed and wired, currently unfunded (see Status)
TELEGRAM_BOT_TOKEN=        # Wave 8, not yet created
```

## Status (updated 2026-07-20)

Waves 1-7 are shipped: unclaimed transactions + `BatchDisperser.sol` +
`ClaimEscrow.sol` (the latter added mid-Wave-1 to fix a real gap -- an
unclaimed allocation needs actual escrowed funds behind it, not just a
database row), the generic follow-up asker, giveaway, both airdrop modes,
donation/crowdfunding (`CauseRegistry.sol`), generic escrow
(`SimpleEscrow.sol`, Create→Accept→Deliver→Release, no dispute/jury in v1),
and private send (`PrivateSendPool.sol`). All live-verified against the real
deployed contracts and APIs, not just typechecked: contracts deployed to
mainnet with bytecode/state read back, Foundry suites passing (135/135
across all 7 contracts as of Wave 7), backend typecheck + test suite clean,
backend routes live-hit against production Postgres/chain state (including
a full create → mark-sent → claim round trip against real disposable test
wallets, cleaned up after), frontend typecheck + build clean.

Confirmed engagement-score formula for bullpost-airdrop (the one open item
from the original plan): `score = likes×1 + replies×2 + retweets×3`, summed
per unique poster across every matching post, top-N by score paid
proportional to score. Public and stated here so it can be told to users
verbatim.

Wave 6's escrow deadlines are pinned: `DELIVER_WINDOW = 7 days` (creator can
refund themselves if the counterparty accepts but never delivers),
`RELEASE_GRACE = 3 days` (counterparty can force-release if the creator
received delivery but won't release). Both are timers, not real dispute
resolution -- they just stop either side holding funds hostage indefinitely.

Wave 7's keeper fee is pinned, revised 2026-07-20 after further discussion:
the fee is **always native ETH**, regardless of what token the send itself
is in (a USDG-denominated fee can't refill an ETH gas float, which was the
original design's real gap -- see `PrivateSendPool.sol`'s own doc comment).
Formula: `keeperFeeWei = (0.1% of the send's value, in ETH) + (live gas
price × 150000 gas)`. The percentage is TagioPay's margin; the gas term is
what actually keeps the keeper solvent as gas prices move. For a USDG send,
the 0.1% portion is converted to its ETH-equivalent via a live Uniswap quote
(quoting just the fee-sized slice, not the whole send, so large sends don't
inflate the estimate with extra price impact) -- verified live against real
mainnet gas price and pool pricing for both a native and a USDG test send.
This required a contract redesign (the original deploy paid the fee in
whatever token was sent) and a redeploy -- safe, since nothing had moved
through the prior deploy yet. `PrivateSendPool.sol` now lives at
`0x1631b69a7aD282e3EC9246C3215f10a5812B50b4`; the keeper wallet
(`0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9`) is wired up and its poll loop
is running, but it's **currently unfunded (0 ETH)** -- confirmed live via a
`keeper_low_balance` log line, which is the intended safe behavior (it skips
claiming rather than trying and failing). Until it's funded, the manual
`$claim` command and the dashboard's "Claim now" button are the only working
claim path -- both are fully functional today, so private sends work end to
end regardless, just without the automatic hands-free part until the keeper
wallet gets some ETH.

## Open items to pin down when each wave starts (not blocking the plan, flagged
so they don't get silently decided)

- Whether Groq's structured-output schema needs versioning as new intents (e.g.
  future non-giveaway/airdrop commands) get added to `intentParser.ts`.
- Whether `BatchDisperser` needs its own registration/fee model or is purely a
  utility contract with no fees (current assumption: no fees, TagioPay pays gas
  is out of scope per "no gas sponsorship" — the giveaway/airdrop *requester*
  signs and pays gas for the disperse tx, same as any other pending-tx sign-off).
- Wave 7's keeper fee: exact pricing (flat fee vs. gas-cost-plus-margin) and
  how low a keeper-wallet balance triggers an alert to refill it.
