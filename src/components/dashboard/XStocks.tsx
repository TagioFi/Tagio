import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getSwapPlan,
  getSwapQuote,
  getSwapTokens,
  isSolanaSwapPlan,
  swapRouteLabel,
  type SolanaTokenInfo,
  type SwapQuote,
} from "../../lib/tagio";
import { BASE_CURRENCIES, PROTOCOL_FEE_BPS } from "../../lib/chain";
import { describeIntentState, friendlySolanaError } from "../../lib/relay-actions";
import { executeRelayQuote, waitForRelayIntent } from "../../lib/solana-exec";
import { TokenIcon, filterStocks, fmtAmount, stockDisplayName, useSolanaWallet } from "./shared";

type Stage =
  | { status: "idle" }
  | { status: "working"; message: string }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

/**
 * Spec Module 7 — 714+ tokenized US equities trading natively as Solana SPL
 * tokens. Both directions run through Relay's same-chain Solana route (the
 * backend's /swap/plan), which collects the 0.15% app fee and hands back
 * Solana instructions for the wallet to sign. Nothing here touches an EVM
 * chain; the previous version of this view signed the plan with wagmi, which
 * no longer matches what the API returns.
 */
export function XStocks({ toast }: { toast: (msg: string) => void }) {
  const { wallet, connection, address, connected } = useSolanaWallet();

  // The directory is a static ~714-entry list, so it's cached for the session
  // rather than refetched per mount. Both slices are memoised because the `??`
  // fallback would otherwise mint a fresh array each render and re-run every
  // hook downstream that depends on them.
  const tokensQuery = useQuery({
    queryKey: ["swap-tokens"],
    queryFn: () => getSwapTokens(),
    staleTime: 60 * 60 * 1000,
  });
  const featured = useMemo(() => tokensQuery.data?.stocks ?? [], [tokensQuery.data]);
  const allStocks = useMemo(() => tokensQuery.data?.allStocks ?? [], [tokensQuery.data]);

  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [currency, setCurrency] = useState("USDC");
  const [stockSymbol, setStockSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [quote, setQuote] = useState<SwapQuote | null | "none">(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState<Stage>({ status: "idle" });

  useEffect(() => {
    if (!stockSymbol && featured.length > 0) setStockSymbol(featured[0].symbol);
  }, [featured, stockSymbol]);

  useEffect(() => {
    setQuote(null);
    setStage({ status: "idle" });
  }, [direction, currency, stockSymbol, amount]);

  const stock: SolanaTokenInfo | undefined = useMemo(
    () =>
      allStocks.find((t) => t.symbol === stockSymbol) ??
      featured.find((t) => t.symbol === stockSymbol),
    [allStocks, featured, stockSymbol],
  );

  const results = useMemo(() => filterStocks(allStocks, search).slice(0, 60), [allStocks, search]);

  const fromSymbol = direction === "buy" ? currency : stockSymbol;
  const toSymbol = direction === "buy" ? stockSymbol : currency;
  const amt = Number(amount) || 0;

  // abs(), not just > 3: on a thin pool the reference quote itself can swing
  // sharply negative rather than near zero. That's the metric breaking down on
  // low depth — exactly what this warning exists to catch.
  const highImpact = quote && quote !== "none" && Math.abs(Number(quote.priceImpactPct) || 0) > 3;

  const doQuote = async () => {
    setQuoting(true);
    try {
      const q = await getSwapQuote({ data: { fromSymbol, toSymbol, amountIn: amt } });
      setQuote(q ?? "none");
    } catch (err) {
      toast(friendlySolanaError(err));
    } finally {
      setQuoting(false);
    }
  };

  const doSwap = async () => {
    if (!address) return;
    setStage({ status: "working", message: "Building the trade…" });
    try {
      const plan = await getSwapPlan({
        data: { fromSymbol, toSymbol, amountIn: amt, walletAddress: address },
      });
      if (!plan) {
        setStage({ status: "error", message: "No route for this pair right now" });
        return;
      }
      if (!isSolanaSwapPlan(plan)) {
        // Only reachable if the API resolved this pair to the legacy Robinhood
        // engine, which needs an EVM signer this Solana-only view doesn't have.
        setStage({
          status: "error",
          message: "That pair routed to the Robinhood engine, which this view can't sign.",
        });
        return;
      }

      const signatures = await executeRelayQuote(
        connection,
        wallet,
        { requestId: plan.requestId, steps: plan.steps },
        (message) => setStage({ status: "working", message }),
      );

      setStage({ status: "working", message: "Settling…" });
      const state = await waitForRelayIntent(plan.requestId);
      const message = describeIntentState(state, `Swap ${fromSymbol} → ${toSymbol}`);

      setStage(
        state === "success" || state === "pending"
          ? { status: "done", message: `${message} · ${signatures.length} signature(s)` }
          : { status: "error", message },
      );
      toast(message);
    } catch (err) {
      setStage({ status: "error", message: friendlySolanaError(err) });
    }
  };

  const busy = stage.status === "working";

  return (
    <div className="card pad-lg">
      <div className="section-title">
        <div>
          <div className="eyebrow">Tokenized equities</div>
          <h2>Trade xStocks on Solana</h2>
        </div>
        <span className="pill ok">
          <span className="dot"></span>
          {allStocks.length || "—"} listed
        </span>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", margin: "0.75rem 0 1rem" }}>
        <button
          className={"btn sm" + (direction === "buy" ? "" : " ghost")}
          onClick={() => setDirection("buy")}
        >
          Buy
        </button>
        <button
          className={"btn sm" + (direction === "sell" ? "" : " ghost")}
          onClick={() => setDirection("sell")}
        >
          Sell
        </button>
      </div>

      <div className="form-row">
        <label className="field-label">{direction === "buy" ? "Pay with" : "Receive"}</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {BASE_CURRENCIES.map((c) => (
            <button
              key={c.symbol}
              className={"btn sm" + (currency === c.symbol ? "" : " ghost")}
              onClick={() => setCurrency(c.symbol)}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <TokenIcon symbol={c.symbol} size="1rem" />
              {c.symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label className="field-label">{direction === "buy" ? "Buy" : "Sell"}</label>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <TokenIcon symbol={stockSymbol} iconUrl={stock?.iconUrl} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{stockSymbol || "—"}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>
              {stock ? stockDisplayName(stock) : "Pick an equity"}
            </div>
          </div>
          <button className="btn ghost sm" onClick={() => setBrowsing((b) => !b)}>
            {browsing ? "Close" : "Browse all"}
          </button>
        </div>
      </div>

      {browsing && (
        <div
          style={{
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-sm)",
            padding: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search 714+ equities — AAPL, Tesla, S&P 500…"
            spellCheck={false}
          />
          <div style={{ maxHeight: "16rem", overflowY: "auto", marginTop: "0.5rem" }}>
            {tokensQuery.isLoading && (
              <p style={{ fontSize: "0.85rem", color: "var(--ink-faint)" }}>Loading directory…</p>
            )}
            {!tokensQuery.isLoading && results.length === 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--ink-faint)" }}>
                Nothing matches “{search}”.
              </p>
            )}
            {results.map((t) => (
              <button
                key={t.mint}
                className="route-line"
                onClick={() => {
                  setStockSymbol(t.symbol);
                  setBrowsing(false);
                  setSearch("");
                }}
                style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
              >
                <div
                  className="who"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <TokenIcon symbol={t.symbol} iconUrl={t.iconUrl} size="1.4rem" />
                  <span>
                    <b style={{ fontWeight: 500 }}>{t.symbol}</b>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.78rem",
                        color: "var(--ink-faint)",
                      }}
                    >
                      {stockDisplayName(t)}
                    </span>
                  </span>
                </div>
                <span className="addr-mono" style={{ fontSize: "0.75rem" }}>
                  {t.underlyingTicker ?? ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-row">
        <label className="field-label">Amount ({fromSymbol || "…"})</label>
        <input
          className="input mono"
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>

      <button
        className="btn"
        disabled={amt <= 0 || !stockSymbol || quoting}
        onClick={doQuote}
        style={{ justifyContent: "center", width: "100%" }}
      >
        {quoting ? "Getting quote…" : "Get quote"}
      </button>

      {quote === "none" && (
        <div className="split-total bad" style={{ marginTop: "1rem" }}>
          No route for this pair right now.
        </div>
      )}

      {quote && quote !== "none" && (
        <div className="send-preview">
          <div className="route-line">
            <div className="who">
              <b>You'll receive</b>
            </div>
            <span className="amt" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <TokenIcon
                symbol={toSymbol}
                iconUrl={direction === "buy" ? stock?.iconUrl : undefined}
                size="1rem"
              />
              ≈ {fmtAmount(quote.amountOut)} {toSymbol}
            </span>
          </div>
          <div className="route-line">
            <div className="who">
              <b>Route</b>
            </div>
            <span style={{ fontSize: "0.85rem", color: "var(--ink-faint)" }}>
              {swapRouteLabel(quote)}
            </span>
          </div>
          <div className="route-line">
            <div className="who">
              <b>App fee</b>
            </div>
            <span style={{ fontSize: "0.85rem", color: "var(--ink-faint)" }}>
              {(PROTOCOL_FEE_BPS / 100).toFixed(2)}% · collected by Relay
            </span>
          </div>

          {highImpact && (
            <div className="split-total bad" style={{ marginTop: "0.5rem" }}>
              High price impact (~
              {Math.abs(Number(quote.priceImpactPct)).toFixed(2)}%) — this pool has limited
              liquidity, so the actual fill may differ from this quote.
            </div>
          )}

          {stage.status !== "done" && (
            <button
              className="btn"
              disabled={busy || !connected}
              onClick={doSwap}
              style={{ justifyContent: "center", width: "100%", marginTop: "1rem" }}
            >
              {busy ? stage.message : connected ? "Swap" : "Connect a Solana wallet"}
            </button>
          )}

          {stage.status === "error" && (
            <div className="split-total bad" style={{ marginTop: "0.75rem" }}>
              {stage.message}
            </div>
          )}
          {stage.status === "done" && (
            <div className="split-total ok" style={{ marginTop: "0.75rem" }}>
              {stage.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
