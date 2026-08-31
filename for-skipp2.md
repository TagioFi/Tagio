# For Skipp — round 2: the unmock landed, settlement still can't sign

Follow-up to [for-skipp.md](./for-skipp.md), verified against the live API and
against Relay directly on 2026-08-31, after `55a7d15` / `6b97c52`.

**TL;DR:** The fix is real and the mock is properly dead. Base-currency routing
now returns genuine executable quotes — the first in this project. But the
tokenized stocks are **not routable on Relay** (their side, not ours), and the
same-asset path still produces a quote with no steps, which is now the failure
almost every user will hit.

---

## What you actually fixed

Confirmed, not assumed:

| Change | Verification |
| :--- | :--- |
| Chain ID `13746` → `4663` | Correct — Relay's own `/chains` lists Robinhood Chain as `4663` |
| Placeholder → real addresses | Every new address resolves in Relay's `currencies/v2` index |
| USDG corrected to `0x5fc5…d168` | Matches Relay's record exactly |
| Mock fallback removed | `quoteSingleSwap` now throws instead of fabricating |
| Per-leg safe-settle | `quotePortfolioSettlement` wraps each leg and falls back to USDG — right shape |

**Base-currency routing genuinely works now.** Straight to Relay, no backend
involved:

```
ETH  → USDG  (chain 4663, 0.1 ETH)  → requestId 0x1788…acad + steps[] ✅
USDG → WETH  (chain 4663, 100 USDG) → requestId 0x1788…9978 + approve step ✅
```

Real `requestId`, real encoded transactions. That path is done.

---

## What still blocks settlement

### 1. The tokenized stocks are not routable — and this one isn't yours to fix

Direct to Relay, bypassing the backend entirely:

```
POST https://api.relay.link/quote/v2
  originChainId 4663, destinationChainId 4663
  USDG (0x5fc5…d168) → AAPL (0xaf3d…93f9)
→ {"message":"Unsupported currency","errorCode":"UNSUPPORTED_CURRENCY"}
```

The addresses are right — `currencies/v2` returns each one with its correct
name ("Apple • Robinhood Tokenized Stock"). They are **indexed but have no
solver support**, so no quote can be produced for them at any size.

Consequence: `POST /v2/settle/quote` for any RWA leg now returns **500** rather
than a fabricated number. That is a strict improvement — it fails loudly — but
the product premise still cannot execute. Nothing in our backend changes this;
it needs Relay to enable those pairs on 4663. Worth asking them directly what
the timeline is, because the roadmap hangs off the answer.

### 2. Same-asset quotes still carry no executable steps — highest-impact item

The zero-fee short circuit at the top of `quoteSingleSwap` returns a 1:1 result
with no `requestId` and no `steps`:

```
POST /v2/settle/election-quote  {"recipientHandle":"nobody","fromSymbolOrAddress":"USDG","amountIn":100}
→ rate "1.0", isFallbackUsdg false, no requestId, no steps
```

`collectSettlementSteps()` in `src/lib/relay.ts` finds nothing, and
`executeSettlement` throws *"This quote carried no executable steps."*

This is now the **most likely** path in the whole system, because USDG is both:
- the default receive-mix for every newly claimed tag, and
- the safe-settle fallback for every RWA leg that fails (which is currently all of them).

So essentially all traffic funnels into the one case that cannot be signed.

**Fix:** for the same-token case, encode a plain ERC20 `transfer(recipient, amount)`
(or a native send when the token is ETH) and return it in the same `steps[]`
shape Relay uses. The frontend needs no change — it will execute it as-is. This
is the single change that turns "quotes but never settles" into a working demo,
and unlike #1 it is entirely in our control.

### 3. Existing elections point at the dead USDG

`@nobody`'s stored election still carries the old address:

```
GET /v2/handles/nobody → "symbol":"USDG","tokenAddress":"0x2D92D94a45aFe77f6b0f191D5F4b11f7A2d1D50f"
```

Real USDG is `0x5fc5360d0400a0fd4f2af552add042d716f1d168`. Every handle claimed
before this deploy quotes against a token that no longer exists. Needs a
migration over the elections table, not just a registry swap.

### 4. SPCX is mislabeled as the S&P 500 — it's SpaceX

`backend/src/v2/lib/robinhoodTokens.ts:48-51`:

```ts
symbol: "SPCX",
name: "SPDR S&P 500 ETF Token",
underlyingTicker: "SPY",
address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
```

Relay's record for that exact contract:

```
"symbol":"spacex","name":"SpaceX (Robinhood Tokenized Stock)"
```

It is SpaceX equity, not an S&P 500 ETF. The alias map at line 138-139 makes it
worse — `SPY: "SPCX"` and `SPYR: "SPCX"` mean anyone electing "SPY" silently
gets SpaceX. Wrong name, wrong icon (`spdr-s-and-p-500` logo), wrong asset. This
one is a mislabel of a real financial instrument, so it's worth fixing before
anyone sees the UI.

### 5. Frontend still names the deleted symbols

The rename (`SPYR→SPCX`, `AAPLR→AAPL`, …) didn't reach the frontend:

- `src/components/tf/assets-section.tsx:25-32` — SPYR, GLDR, NVDAR, AAPLR, TSLAR, QQQR
- `src/components/tf/intent-demo.tsx:63` — `{ symbol: "NVDAR", basisPoints: 7000 }`
- `src/routes/index.tsx:97-135` — SPYR/USDG/GLDR split panel copy

Also note **GLDR and QQQR were dropped entirely** in the unmock — there is no
tokenized gold and no Nasdaq token any more. Any copy promising them needs
rewriting, not just re-symboling.

---

## Suggested order

1. **Same-asset ERC20 transfer steps** (#2) — unblocks the default path today.
2. **Elections migration** (#3) — small, but every pre-existing tag is broken until it runs.
3. **SPCX naming + alias** (#4) — 5 minutes, and it's a factual error about a security.
4. **Frontend symbols** (#5) — cosmetic, but visible on the landing page.
5. **Ask Relay about RWA solver support on 4663** (#1) — everything strategic depends on the answer.

Still open from round 1, unchanged: `POST /v2/auth/signin` is not wired, so
`PUT /v2/handles/:handle/elections` remains unauthenticated — anyone who knows a
tag can repoint that tag's portfolio.
