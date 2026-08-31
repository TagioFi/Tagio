# For Skipp — v2 settlement is quoting, but it can never execute

**TL;DR:** The frontend rail is built and the API is live, but **no settlement
transaction can ever be signed today.** Every tokenized RWA in the registry has a
placeholder contract address, so Relay rejects the quote, the backend silently
swallows the error and returns a fabricated quote with no transaction steps, and
the Settle button throws the moment anyone clicks it.

Found while walking the flow end-to-end against `https://api.tagiopay.com` on
2026-08-31.

---

## What actually works

Verified live, not from reading code:

| Step | Endpoint | Result |
| :--- | :--- | :--- |
| Claim a tag | `POST /v2/handles/register` | Works — `@nobody` is handle id 1, owner `0x8c34…83a9` |
| Read handle | `GET /v2/handles/nobody` | Works — `totalBasisPoints: 10000`, elections hydrated with token metadata |
| Asset registry | `GET /v2/assets?featured=true` | Works — 12 assets returned |
| Portfolio quote | `POST /v2/settle/election-quote` | Returns 200 with a well-formed multi-leg body |

The claim → elect → quote path is genuinely sound. The problem is one layer
deeper than a 200 response.

---

## The bug

### 1. Every RWA address is a placeholder

`GET /v2/assets?featured=true` returns:

```
SPYR    0x1111111111111111111111111111111111111111
QQQR    0x2222222222222222222222222222222222222222
GLDR    0x3333333333333333333333333333333333333333
AAPLR   0x4444444444444444444444444444444444444444
TSLAR   0x5555555555555555555555555555555555555555
NVDAR   0x6666666666666666666666666666666666666666
GOOGLR  0x7777777777777777777777777777777777777777
AMZNR   0x8888888888888888888888888888888888888888
MSFTR   0x9999999999999999999999999999999999999999
COINR   0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Only `ETH` and `USDG` (`0x2D92D94a45aFe77f6b0f191D5F4b11f7A2d1D50f`) are real.
Relay has no such tokens, so `POST https://api.relay.link/quote/v2` fails for
every non-stable leg.

### 2. The failure is swallowed and replaced with invented numbers

`backend/src/v2/services/relaySwapService.ts` — the `catch` in `quoteSingleSwap`:

```ts
} catch (err: any) {
  // Graceful fallback for mock / development liquidity simulation
  const simulatedRate = params.toToken.assetType === "stablecoin" ? 2500 : 0.0004;
  const estimatedOut = params.amountIn * simulatedRate;
  ...
  return { ...,  rate: simulatedRate.toString(), priceImpactPct: 0.05, timeEstimate: 2 };
}
```

Three problems with this block:

- **It returns no `requestId` and no `steps`.** Those are the only executable
  part of a quote.
- **It is indistinguishable from a real quote on the wire.** Same shape, same
  field names, no flag. The frontend cannot tell simulated from live.
- **The numbers are fabricated and wrong.** `0.0004` for anything non-stable:
  100 USDG "buys" 0.04 SPYR, implying SPY trades at $2,500. And any
  stablecoin-typed destination gets a rate of `2500`, which is not a rounding
  error — it's off by three orders of magnitude in the other direction.

Live proof:

```
POST /v2/settle/quote  {"fromSymbolOrAddress":"USDG","toSymbolOrAddress":"SPYR","amountIn":100}
→ {"amountOut":"40000000000000000","amountOutFormatted":"0.040000",
   "rate":"0.0004","priceImpactPct":0.05,"timeEstimate":2}
   ^ no requestId, no steps
```

### 3. The frontend then throws on click

`src/lib/relay.ts` → `collectSettlementSteps()` walks `leg.quote.steps[].items[].data`.
With no steps, it collects nothing, and `executeSettlement` throws:

```
"This quote carried no executable steps. Refresh and try again."
```

Meanwhile `src/routes/pay.$target.tsx:354` enables the Settle button on any
truthy quote:

```tsx
disabled={!isConnected || !walletClient || isWrongNetwork || !quote || isSettling}
```

A simulated quote is truthy. So the button is live, the user signs nothing, and
they get an error that tells them to *refresh and try again* — which will fail
identically, forever.

### Why nobody has hit it yet

The default receive-mix on a fresh tag is **100% USDG**. A USDG payment into a
USDG election takes the same-asset zero-fee short circuit at the top of
`quoteSingleSwap` and never calls Relay at all. The bug only appears the moment
someone adds a single RWA leg to their mix.

---

## Suggested fix, in order

1. **Flag the fallback.** Add `isSimulated: true` to the fallback return, thread
   it through `SingleSwapQuoteResult` → `PortfolioQuoteLegResult`, and in the pay
   page disable Settle with *"Preview pricing — no liquidity on this route yet"*
   rather than letting it throw. ~30 lines across both sides. This is the
   difference between a demo that reads as honest and one that reads as broken.
2. **Stop the silent swallow.** Log the Relay error server-side. Right now a real
   Relay outage and a fake token address are the same code path, which means the
   day the addresses become real, a genuine outage will still look like a
   working quote.
3. **Reconsider the invented rates.** If a simulated quote is worth keeping for
   demos, it should be priced off something defensible rather than two hardcoded
   constants — or it should return no price at all and simply say "unavailable".
4. **Then answer the real question:** are there real Robinhood Chain token
   addresses to swap in, or is v2 a preview until that chain has liquidity?
   Everything downstream — auth, `route-intent`, the docs page — is smaller than
   this one.

## Also missing from the v2 spec (lower priority)

- **§4.F auth is not wired at all.** No `POST /v2/auth/signin` call, no X OAuth
  callback route on the frontend. `PUT /v2/handles/:handle/elections` currently
  goes out unauthenticated with `ownerWallet` in the body — so anyone who knows a
  tag can repoint that tag's portfolio. This is the one item here that is a
  security issue rather than a gap.
- **`POST /v2/bot/route-intent`** — the hook exists in `src/hooks/useTagioV2.ts`
  but nothing calls it. The landing-page demo parses intent and stops there.
- **Assets page and docs** are nav links to a static `/site/docs.html` and an
  anchor, not real routes.
