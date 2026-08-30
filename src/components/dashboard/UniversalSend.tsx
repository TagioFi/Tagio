import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  getXAccount,
  resolveHashtag,
  type HashtagResolution,
  type XAccountLookup,
} from "../../lib/tagio";
import { BASE_CURRENCIES, currencyInfo } from "../../lib/chain";
import {
  describeIntentState,
  encodePayHashtag,
  friendlySolanaError,
  previewRoute,
  quoteRobinhoodValue,
  runRelayIntent,
} from "../../lib/relay-actions";
import { sendNativeSol, sendSplToken } from "../../lib/solana-exec";
import {
  RoutePreviewRows,
  TokenIcon,
  classifyRecipient,
  fmtAmount,
  recipientLabel,
  shortAddr,
  useSolanaWallet,
  type RecipientKind,
} from "./shared";

type Stage =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "resolved" }
  | { status: "working"; message: string }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

interface Resolution {
  kind: RecipientKind;
  value: string;
  hashtag?: HashtagResolution;
  xAccount?: XAccountLookup | null;
  /** Where a direct Solana transfer would land, when one is possible. */
  directTo?: string;
  /** Copy explaining why this recipient can't be paid from here, if it can't. */
  blocked?: string;
}

/**
 * Spec Module 6 — one recipient box that accepts a #hashtag, an @handle, or a
 * base58 Solana address, and routes each down the path the spec's execution
 * matrix assigns it:
 *
 *   base58 address → pure Solana transfer, no bridge and no protocol fee
 *   #hashtag       → Relay intent into HashtagResolver.receivePayment, so the
 *                    onchain percentage splits fan out atomically
 *   @handle        → direct Solana transfer when they've linked a Solana
 *                    wallet; otherwise it needs the X bot (see below)
 */
export function UniversalSend({ toast }: { toast: (msg: string) => void }) {
  const { wallet, connection, address, connected } = useSolanaWallet();

  const [recipient, setRecipient] = useState("");
  const [currency, setCurrency] = useState<string>("USDC");
  const [amount, setAmount] = useState("");
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [stage, setStage] = useState<Stage>({ status: "idle" });

  const parsed = classifyRecipient(recipient);
  const amt = Number(amount) || 0;
  const info = currencyInfo(currency);

  // Anything typed invalidates a previous resolution — paying the last
  // recipient after the box has changed is exactly the mistake to prevent.
  useEffect(() => {
    setResolution(null);
    setStage({ status: "idle" });
  }, [recipient, currency, amount]);

  const path: "solana" | "relay" = resolution?.kind === "hashtag" ? "relay" : "solana";
  const preview = previewRoute(path, amount || "0");

  const resolve = async () => {
    setStage({ status: "resolving" });
    try {
      if (parsed.kind === "hashtag") {
        const record = await resolveHashtag({ data: parsed.value });
        if (!record) {
          setStage({
            status: "error",
            message: `#${parsed.value} isn't registered, or its subscription has lapsed`,
          });
          return;
        }
        setResolution({ kind: "hashtag", value: parsed.value, hashtag: record });
      } else if (parsed.kind === "x_account") {
        const account = await getXAccount({ data: parsed.value });
        if (!account?.linked) {
          setResolution({
            kind: "x_account",
            value: parsed.value,
            xAccount: account,
            // ClaimEscrow keys deposits by keccak256(xUserId), and an account
            // that has never authorized TagioPay has no stored X user id for
            // us to hash. The bot looks it up through the X API at command
            // time, which is why that path can do this and the dApp can't.
            blocked:
              `@${parsed.value} hasn't linked a wallet yet. Funds for an unlinked account are held in ` +
              `ClaimEscrow keyed to their X user id, which only the bot can look up — send ` +
              `"$send ${amount || "10"} ${currency} to @${parsed.value}" to @TagioPayBot and it'll stage the deposit for you to sign.`,
          });
        } else if (account.solanaWallet) {
          setResolution({
            kind: "x_account",
            value: parsed.value,
            xAccount: account,
            directTo: account.solanaWallet,
          });
        } else {
          setResolution({
            kind: "x_account",
            value: parsed.value,
            xAccount: account,
            blocked:
              `@${parsed.value} has linked a Robinhood wallet but not a Solana one, so a direct ` +
              `Solana transfer has nowhere to land. Pay one of their #handles instead.`,
          });
        }
      } else if (parsed.kind === "solana") {
        setResolution({ kind: "solana", value: parsed.value, directTo: parsed.value });
      } else if (parsed.kind === "evm") {
        setResolution({
          kind: "evm",
          value: parsed.value,
          blocked:
            "That's a Robinhood Chain address. Direct sends settle on Solana — use a #handle, " +
            "which routes across automatically, or a base58 Solana address.",
        });
      }
      setStage({ status: "resolved" });
    } catch (err) {
      setStage({ status: "error", message: friendlySolanaError(err) });
    }
  };

  const send = async () => {
    if (!resolution || !address) return;
    try {
      if (resolution.directTo) {
        setStage({ status: "working", message: "Confirm the transfer in your wallet…" });
        const signature = info.native
          ? await sendNativeSol(connection, wallet, resolution.directTo, amount)
          : await sendSplToken(connection, wallet, {
              recipient: resolution.directTo,
              mint: info.mint,
              amount,
              decimals: info.decimals,
            });
        setStage({ status: "done", message: `Sent · ${shortAddr(signature, 8, 8)}` });
        toast(`Sent ${fmtAmount(amt)} ${currency} on Solana`);
        return;
      }

      if (resolution.kind === "hashtag") {
        setStage({ status: "working", message: "Pricing the Robinhood leg…" });
        const { valueWei } = await quoteRobinhoodValue({ user: address, currency, amount });

        const result = await runRelayIntent({
          connection,
          wallet,
          currency,
          amount,
          txs: [encodePayHashtag(resolution.value, valueWei)],
          onProgress: (message) => setStage({ status: "working", message }),
        });

        const message = describeIntentState(result.state, `Payment to #${resolution.value}`);
        setStage(
          result.state === "success" || result.state === "pending"
            ? { status: "done", message }
            : { status: "error", message },
        );
        toast(message);
      }
    } catch (err) {
      setStage({ status: "error", message: friendlySolanaError(err) });
    }
  };

  const canResolve = connected && amt > 0 && parsed.kind !== "empty" && parsed.kind !== "invalid";
  const busy = stage.status === "resolving" || stage.status === "working";
  const payable = resolution && !resolution.blocked;

  return (
    <div className="card pad-lg">
      <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>
        Send
      </div>

      <div className="form-row">
        <label className="field-label">To</label>
        <input
          className="input mono"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="#handle, @xuser, or a Solana address"
          spellCheck={false}
        />
        <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "0.4rem" }}>
          {parsed.kind === "empty" && "Paste an address or type a name — TagioPay works out which."}
          {parsed.kind === "invalid" && (
            <span style={{ color: "var(--danger)" }}>
              Not a recognizable handle or address yet.
            </span>
          )}
          {parsed.kind !== "empty" && parsed.kind !== "invalid" && (
            <span style={{ color: "var(--green-deep)" }}>
              Detected: {recipientLabel(parsed.kind)}
            </span>
          )}
        </div>
      </div>

      <div className="form-row">
        <label className="field-label">Currency</label>
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
        <label className="field-label">Amount ({currency})</label>
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
        disabled={!canResolve || busy}
        onClick={resolve}
        style={{ justifyContent: "center", width: "100%" }}
      >
        {stage.status === "resolving" ? "Resolving…" : "Preview route"}
      </button>

      {!connected && (
        <div className="status" style={{ color: "var(--ink-faint)", marginTop: "0.75rem" }}>
          Connect a Solana wallet to send.
        </div>
      )}

      {stage.status === "error" && (
        <div className="split-total bad" style={{ marginTop: "1rem" }}>
          {stage.message}
        </div>
      )}

      {resolution?.blocked && (
        <div className="send-preview">
          <div className="eyebrow" style={{ marginBottom: "0.5rem" }}>
            Can't route this one
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", lineHeight: 1.55 }}>
            {resolution.blocked}
          </p>
          {resolution.xAccount?.hashtags?.length ? (
            <div style={{ marginTop: "0.75rem" }}>
              <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
                Their handles
              </div>
              {resolution.xAccount.hashtags.map((h) => (
                <button
                  key={h.hashtag}
                  className="link-btn"
                  onClick={() => setRecipient("#" + h.hashtag)}
                  style={{ display: "block", marginBottom: "0.25rem" }}
                >
                  #{h.hashtag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {payable && (
        <div className="send-preview">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.75rem",
            }}
          >
            <span className="eyebrow">Route · live</span>
            <span className="pill ok">
              <span className="dot"></span>
              {resolution.kind === "hashtag"
                ? "#" + resolution.value
                : recipientLabel(resolution.kind)}
            </span>
          </div>

          {resolution.directTo && (
            <div className="route-line">
              <span style={{ color: "var(--ink-soft)" }}>Lands at</span>
              <span className="addr-mono">{shortAddr(resolution.directTo, 6, 6)}</span>
            </div>
          )}

          {resolution.hashtag && (
            <>
              <div className="route-line">
                <span style={{ color: "var(--ink-soft)" }}>Primary destination</span>
                <span className="addr-mono">
                  {shortAddr(resolution.hashtag.primaryDestination, 6, 4)}
                </span>
              </div>
              {resolution.hashtag.payouts.map((p, i) => (
                <div className="route-line" key={p.wallet + i}>
                  <div className="who">
                    <b>Recipient {i + 1}</b>
                    <span className="addr-mono">{shortAddr(p.wallet, 6, 4)}</span>
                  </div>
                  <span className="amt">
                    {fmtAmount((amt * p.percentage_bps) / 10000)} {currency}
                    <span
                      style={{ color: "var(--ink-faint)", fontWeight: 400, fontSize: "0.8rem" }}
                    >
                      {" "}
                      · {(p.percentage_bps / 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
              ))}
            </>
          )}

          <RoutePreviewRows
            path={path}
            amount={amount}
            currency={currency}
            feeAmount={preview.feeAmount}
            netAmount={preview.netAmount}
            etaSeconds={preview.etaSeconds}
          />

          {stage.status !== "done" && (
            <button
              className="btn"
              disabled={busy}
              onClick={send}
              style={{ justifyContent: "center", width: "100%", marginTop: "1rem" }}
            >
              {stage.status === "working" ? stage.message : `Send ${fmtAmount(amt)} ${currency}`}
            </button>
          )}

          {stage.status === "done" && (
            <div className="split-total ok" style={{ marginTop: "0.75rem" }}>
              {stage.message}
            </div>
          )}

          {resolution.hashtag && (
            <Link
              className="btn ghost"
              to="/h/$name"
              params={{ name: resolution.value }}
              style={{ justifyContent: "center", width: "100%", marginTop: "0.75rem" }}
            >
              View #{resolution.value} record
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
