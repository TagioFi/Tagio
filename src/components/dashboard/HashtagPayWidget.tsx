import { useEffect, useMemo, useState } from "react";

import { QrCode } from "../QrCode";
import { BASE_CURRENCIES } from "../../lib/chain";
import {
  describeIntentState,
  encodePayHashtag,
  friendlySolanaError,
  previewRoute,
  quoteRobinhoodValue,
  runRelayIntent,
} from "../../lib/relay-actions";
import type { Payout } from "../../lib/tagio";
import { RoutePreviewRows, TokenIcon, fmtAmount, useSolanaWallet } from "./shared";
import { WalletControl } from "../WalletControl";

/** Used for the first (server) render so hydration matches; see `origin` below. */
const CANONICAL_ORIGIN = "https://tagiopay.com";

type Stage =
  | { status: "idle" }
  | { status: "working"; message: string }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

/**
 * Spec Module 4 — the embeddable Direct Pay widget and its dynamic QR.
 *
 * Anyone (connected or not) can read the routing; paying needs a Solana wallet.
 * The payment itself is the same Relay intent the dashboard's Send box uses, so
 * a payment made from a public profile fans out through the handle's onchain
 * splits identically.
 */
export function HashtagPayWidget({
  hashtag,
  displayName,
  payouts,
  active,
}: {
  hashtag: string;
  displayName?: string | null;
  payouts: Payout[];
  active: boolean;
}) {
  const { wallet, connection, address, connected } = useSolanaWallet();

  const [currency, setCurrency] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>({ status: "idle" });

  useEffect(() => setStage({ status: "idle" }), [amount, currency]);

  const amt = Number(amount) || 0;
  const preview = previewRoute("relay", amount || "0");

  // Held in state rather than read inline during render: reading
  // window.location.origin at render time makes the server (which has no
  // window) and the first client render disagree, and since the origin is
  // encoded into the QR that mismatch lands on the rendered SVG path itself.
  // Starting from the canonical origin keeps hydration identical, then the
  // real one takes over after mount for self-hosted or preview deployments.
  const [origin, setOrigin] = useState(CANONICAL_ORIGIN);

  // A hashtag has no Solana address of its own — it resolves on Robinhood — so
  // the QR carries this profile's pay link rather than a `solana:` URI. Scanning
  // it opens the widget with the amount pre-filled, which is what a payer
  // actually needs; a solana: URI would have nowhere valid to point.
  const payUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (amt > 0) params.set("amount", amount);
    params.set("currency", currency);
    const query = params.toString();
    return `${origin}/h/${hashtag}${query ? "?" + query : ""}`;
  }, [origin, hashtag, amount, amt, currency]);

  // Let a shared link pre-fill the widget, which is what makes the QR round-trip.
  useEffect(() => {
    setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    const a = params.get("amount");
    const c = params.get("currency");
    if (a && Number(a) > 0) setAmount(a);
    if (c && BASE_CURRENCIES.some((b) => b.symbol === c)) setCurrency(c);
  }, []);

  const pay = async () => {
    if (!address) return;
    try {
      setStage({ status: "working", message: "Pricing the Robinhood leg…" });
      const { valueWei } = await quoteRobinhoodValue({ user: address, currency, amount });

      const result = await runRelayIntent({
        connection,
        wallet,
        currency,
        amount,
        txs: [encodePayHashtag(hashtag, valueWei)],
        onProgress: (message) => setStage({ status: "working", message }),
      });

      const message = describeIntentState(result.state, `Payment to #${hashtag}`);
      setStage(
        result.state === "success" || result.state === "pending"
          ? { status: "done", message }
          : { status: "error", message },
      );
    } catch (err) {
      setStage({ status: "error", message: friendlySolanaError(err) });
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(payUrl);
      setStage({ status: "done", message: "Pay link copied" });
    } catch {
      setStage({ status: "error", message: "Couldn't copy the link" });
    }
  };

  const busy = stage.status === "working";

  return (
    <div className="card pad-lg">
      <div className="section-title">
        <div>
          <div className="eyebrow">Direct pay</div>
          <h2>Pay {displayName || "#" + hashtag}</h2>
        </div>
      </div>

      {!active && (
        <div className="split-total bad" style={{ marginTop: "0.75rem" }}>
          This handle's subscription has lapsed, so it can't accept payments until it's renewed.
        </div>
      )}

      <div className="pay-widget" style={{ marginTop: "0.9rem" }}>
        <div className="currency-toggle">
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

        <input
          className="input mono"
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Amount in ${currency}`}
        />

        <div className="qr-frame">
          <QrCode value={payUrl} size={168} />
        </div>
        <div style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--ink-faint)" }}>
          {amt > 0
            ? `Scan to pay ${fmtAmount(amt)} ${currency}`
            : "Scan to open this profile — set an amount to bake it into the code"}
        </div>
        <div className="pay-uri">{payUrl}</div>

        <button className="btn ghost sm" onClick={copyLink} style={{ alignSelf: "flex-start" }}>
          Copy pay link
        </button>

        {amt > 0 && payouts.length > 0 && (
          <div style={{ marginTop: "0.25rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.4rem" }}>
              Splits this payment
            </div>
            {payouts.map((p, i) => (
              <div className="route-line" key={p.wallet + i}>
                <span className="addr-mono">
                  {p.wallet.slice(0, 6)}…{p.wallet.slice(-4)}
                </span>
                <span className="amt">
                  {fmtAmount((amt * p.percentage_bps) / 10000)} {currency}
                  <span style={{ color: "var(--ink-faint)", fontWeight: 400, fontSize: "0.8rem" }}>
                    {" "}
                    · {(p.percentage_bps / 100).toFixed(1)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {amt > 0 && (
          <div>
            <RoutePreviewRows
              path="relay"
              amount={amount}
              currency={currency}
              feeAmount={preview.feeAmount}
              netAmount={preview.netAmount}
              etaSeconds={preview.etaSeconds}
            />
          </div>
        )}

        {connected ? (
          stage.status !== "done" && (
            <button
              className="btn"
              disabled={amt <= 0 || busy || !active}
              onClick={pay}
              style={{ justifyContent: "center", width: "100%" }}
            >
              {busy ? stage.message : `Pay ${amt > 0 ? fmtAmount(amt) + " " + currency : ""}`}
            </button>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
              Connect a Solana wallet to pay.
            </div>
            <WalletControl />
          </div>
        )}

        {stage.status === "error" && <div className="split-total bad">{stage.message}</div>}
        {stage.status === "done" && <div className="split-total ok">{stage.message}</div>}
      </div>
    </div>
  );
}
