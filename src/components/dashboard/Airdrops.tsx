import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { BATCH_DISPERSER_ADDRESS } from "../../lib/chain";
import { shortAddr } from "./shared";

type Mode = "giveaway" | "airdrop-holders" | "airdrop-posters";

const BOT_HANDLE = "@TagioPay";

/**
 * Spec Module 12 — Mass Airdrops & Giveaways (BatchDisperser).
 *
 * Creation genuinely runs through the X bot, not the dApp: the winner set is
 * derived from X engagement (retweets, replies, likes) and, for free-text
 * requests, a Groq intent parse — both of which need the bot's authenticated X
 * API access and its server-side rule verification. There is no REST endpoint
 * to start one from here, so rather than fake a form that can't work, this
 * composes the exact command to post and then tracks the resulting payout,
 * which lands in Pending as a `disperse` row for the organizer to sign.
 */
export function Airdrops({
  toast,
  pendingRows,
  onGoToPending,
}: {
  toast: (msg: string) => void;
  pendingRows: Array<{
    id: number;
    kind: string;
    amount: string;
    token: string;
    target_value: string;
  }>;
  onGoToPending: () => void;
}) {
  const [mode, setMode] = useState<Mode>("giveaway");
  const [amount, setAmount] = useState("0.0005");
  const [currency, setCurrency] = useState("eth");
  const [winners, setWinners] = useState("20");
  const [action, setAction] = useState("retweeted");
  const [tokenAddress, setTokenAddress] = useState("");
  const [topic, setTopic] = useState("");

  const command = useMemo(() => {
    if (mode === "giveaway") {
      return `send ${amount} ${currency} to any random ${winners} users who ${action} this`;
    }
    if (mode === "airdrop-holders") {
      return `airdrop the top ${winners} holders of ${tokenAddress || "0xTOKEN…"} ${amount} ${currency}`;
    }
    return `airdrop users who bullposted ${topic || "$TICKER"} ${amount} ${currency}`;
  }, [mode, amount, currency, winners, action, tokenAddress, topic]);

  const disperseRows = pendingRows.filter((r) => r.kind === "disperse");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${BOT_HANDLE} ${command}`);
      toast("Command copied — post it on X to start the payout");
    } catch {
      toast("Couldn't copy — select the command and copy it manually");
    }
  };

  const intent = encodeURIComponent(`${BOT_HANDLE} ${command}`);

  return (
    <div className="fade-in">
      <div className="card pad-lg" style={{ marginBottom: "1rem" }}>
        <div className="section-title">
          <div>
            <div className="eyebrow">Mass payouts</div>
            <h2>Airdrops &amp; giveaways</h2>
          </div>
          <span className="pill ok">
            <span className="dot"></span>BatchDisperser
          </span>
        </div>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--ink-soft)",
            lineHeight: 1.6,
            marginTop: "0.5rem",
          }}
        >
          Winners are drawn from X engagement, so the rules are verified against the X API by the
          bot rather than in your browser. Compose the command here, post it, and the finished
          payout comes back to your <b>Pending</b> tab as a single <code>BatchDisperser</code>{" "}
          transaction covering every winner at once.
        </p>
      </div>

      <div className="card pad-lg claim" style={{ marginBottom: "1rem" }}>
        <div className="eyebrow" style={{ marginBottom: "0.6rem" }}>
          Compose
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button
            className={"btn sm" + (mode === "giveaway" ? "" : " ghost")}
            onClick={() => setMode("giveaway")}
          >
            Random giveaway
          </button>
          <button
            className={"btn sm" + (mode === "airdrop-holders" ? "" : " ghost")}
            onClick={() => setMode("airdrop-holders")}
          >
            Airdrop holders
          </button>
          <button
            className={"btn sm" + (mode === "airdrop-posters" ? "" : " ghost")}
            onClick={() => setMode("airdrop-posters")}
          >
            Airdrop posters
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ flex: "1 1 7rem" }}
            type="number"
            min="0"
            step="0.0001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount each"
          />
          <select
            className="input"
            style={{ flex: "0 1 7rem" }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="eth">ETH</option>
            <option value="usdg">USDG</option>
            <option value="usdc">USDC</option>
          </select>

          {mode !== "airdrop-posters" && (
            <input
              className="input"
              style={{ flex: "1 1 7rem" }}
              type="number"
              min="1"
              value={winners}
              onChange={(e) => setWinners(e.target.value)}
              placeholder={mode === "giveaway" ? "Winners" : "Top N holders"}
            />
          )}

          {mode === "giveaway" && (
            <select
              className="input"
              style={{ flex: "1 1 10rem" }}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="retweeted">retweeted this</option>
              <option value="commented">commented</option>
              <option value="liked">liked this</option>
            </select>
          )}

          {mode === "airdrop-holders" && (
            <input
              className="input mono"
              style={{ flex: "2 1 14rem" }}
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="0x token address"
              spellCheck={false}
            />
          )}

          {mode === "airdrop-posters" && (
            <input
              className="input"
              style={{ flex: "2 1 12rem" }}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="$HOOD or a topic"
              spellCheck={false}
            />
          )}
        </div>

        {action === "liked" && mode === "giveaway" && (
          <div className="status" style={{ color: "var(--amber)", marginTop: "0.6rem" }}>
            Likes are the least reliable signal on the X API right now — retweets or comments
            resolve more dependably.
          </div>
        )}

        <div className="cmd-block" style={{ marginTop: "1rem" }}>
          {BOT_HANDLE} {command}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn sm" onClick={copy}>
            Copy command
          </button>
          <a
            className="btn ghost sm"
            href={`https://x.com/intent/post?text=${intent}`}
            target="_blank"
            rel="noreferrer"
          >
            Post on X
          </a>
          <Link className="btn ghost sm" to="/x-commands-list">
            All commands
          </Link>
        </div>

        <div
          style={{
            fontSize: "0.78rem",
            color: "var(--ink-faint)",
            marginTop: "0.9rem",
            lineHeight: 1.55,
          }}
        >
          Reply with this command to the post you're drawing winners from. Payouts settle through{" "}
          <span className="addr-mono">{shortAddr(BATCH_DISPERSER_ADDRESS, 6, 4)}</span>; winners who
          haven't linked a wallet get a ClaimEscrow deposit instead, so nobody's prize is lost.
        </div>
      </div>

      <div className="card pad-lg">
        <div className="section-title">
          <h2>Payouts waiting on you</h2>
          {disperseRows.length > 0 && (
            <button className="btn sm" onClick={onGoToPending}>
              Review &amp; sign
            </button>
          )}
        </div>
        {disperseRows.length === 0 ? (
          <p style={{ fontSize: "0.9rem", color: "var(--ink-faint)" }}>
            No batch payouts staged right now. Once a giveaway's conditions are met, it shows up
            here and in Pending.
          </p>
        ) : (
          disperseRows.map((row) => (
            <div className="route-line" key={row.id}>
              <div className="who">
                <b style={{ fontWeight: 500 }}>
                  {row.amount} {row.token} · {row.target_value}
                </b>
              </div>
              <span className="pill warn">needs signature</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
