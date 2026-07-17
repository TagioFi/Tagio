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

## Wave 5 — Telegram

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
TELEGRAM_BOT_TOKEN=        # Wave 5, not yet created
```

## Open items to pin down when each wave starts (not blocking the plan, flagged
so they don't get silently decided)

- Exact engagement-score formula for bullpost-airdrop (likes/retweets/replies
  weighting).
- Whether Groq's structured-output schema needs versioning as new intents (e.g.
  future non-giveaway/airdrop commands) get added to `intentParser.ts`.
- Whether `BatchDisperser` needs its own registration/fee model or is purely a
  utility contract with no fees (current assumption: no fees, TagioPay pays gas
  is out of scope per "no gas sponsorship" — the giveaway/airdrop *requester*
  signs and pays gas for the disperse tx, same as any other pending-tx sign-off).
