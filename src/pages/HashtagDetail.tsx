import { useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  confirmTransaction,
  type HashtagRecord,
  type HashtagTransaction,
} from "../lib/tagio";
import { friendlyError, renewOnchain } from "../lib/resolver-actions";
import { WalletControl } from "../components/WalletControl";

const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_MS = 30 * DAY_MS;
const GRACE_MS = 72 * 60 * 60 * 1000;

const short = (a: string | null | undefined) =>
  a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function expiryStatus(record: HashtagRecord) {
  const expires = new Date(record.expires_at).getTime();
  const msLeft = expires - Date.now();
  if (msLeft > 0) {
    const days = Math.floor(msLeft / DAY_MS);
    const hours = Math.floor((msLeft % DAY_MS) / (60 * 60 * 1000));
    return {
      kind: days < 7 ? ("warn" as const) : ("ok" as const),
      pill: days < 7 ? "Renew soon" : "Active",
      countdown: `${days}d ${hours}h left`,
      pct: Math.max(2, Math.min(100, (msLeft / SUBSCRIPTION_MS) * 100)),
    };
  }
  if (msLeft > -GRACE_MS) {
    const hoursLeft = Math.ceil((GRACE_MS + msLeft) / (60 * 60 * 1000));
    return {
      kind: "warn" as const,
      pill: "Grace period",
      countdown: `payments stopped · claimable by anyone in ~${hoursLeft}h`,
      pct: 2,
    };
  }
  return {
    kind: "bad" as const,
    pill: "Expired",
    countdown: "lapsed — registrable by anyone",
    pct: 0,
  };
}

function TxAmount({ tx }: { tx: HashtagTransaction }) {
  if (tx.is_native) {
    const eth = Number(tx.amount) / 1e18;
    return (
      <span className="amt">
        {Number.isFinite(eth) ? eth.toLocaleString("en-US", { maximumFractionDigits: 6 }) : tx.amount}{" "}
        ETH
      </span>
    );
  }
  return (
    <span className="amt">
      {tx.amount} <span className="addr-mono">{short(tx.token)}</span>
    </span>
  );
}

function RenewButton({ hashtag }: { hashtag: string }) {
  const router = useRouter();
  const [state, setState] = useState<
    { status: "idle" | "busy" | "done" } | { status: "error"; message: string }
  >({ status: "idle" });

  const renew = async () => {
    setState({ status: "busy" });
    try {
      await renewOnchain({ hashtag });
      setState({ status: "done" });
      await router.invalidate();
    } catch (err) {
      setState({ status: "error", message: friendlyError(err) });
    }
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <button
        className="btn sm"
        disabled={state.status === "busy"}
        onClick={renew}
      >
        {state.status === "busy" ? "Confirm in wallet…" : "Renew subscription (+30 days)"}
      </button>
      {state.status === "done" && (
        <div className="split-total ok" style={{ marginTop: "0.75rem" }}>
          Subscription renewed onchain
        </div>
      )}
      {state.status === "error" && (
        <div className="split-total bad" style={{ marginTop: "0.75rem" }}>
          {state.message}
        </div>
      )}
    </div>
  );
}

function SyncTransaction({ hashtag }: { hashtag: string }) {
  const router = useRouter();
  const [txHash, setTxHash] = useState("");
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "syncing" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const valid = /^0x[0-9a-fA-F]{64}$/.test(txHash.trim());

  const sync = async () => {
    setState({ status: "syncing" });
    try {
      await confirmTransaction({ data: { txHash: txHash.trim(), hashtag } });
      setState({ status: "done" });
      setTxHash("");
      await router.invalidate();
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Sync failed — try again",
      });
    }
  };

  return (
    <div className="card pad-lg">
      <div className="eyebrow" style={{ marginBottom: "0.6rem" }}>
        Sync a transaction
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginBottom: "0.9rem", lineHeight: 1.5 }}>
        After any onchain action (register, pay, renew, update), paste the transaction
        hash here. The backend decodes the resolver events and refreshes this record.
      </p>
      <div className="form-row" style={{ marginBottom: "0.75rem" }}>
        <input
          className="input"
          style={{ fontFamily: "ui-monospace,monospace", fontSize: "0.85rem" }}
          value={txHash}
          onChange={(e) => {
            setTxHash(e.target.value);
            if (state.status !== "idle") setState({ status: "idle" });
          }}
          placeholder="0x… transaction hash"
          spellCheck={false}
        />
      </div>
      <button
        className="btn"
        disabled={!valid || state.status === "syncing"}
        onClick={sync}
        style={{ justifyContent: "center", width: "100%" }}
      >
        {state.status === "syncing" ? "Syncing…" : "Confirm with backend"}
      </button>
      {state.status === "done" && (
        <div className="split-total ok" style={{ marginTop: "0.75rem" }}>
          Transaction synced — record refreshed
        </div>
      )}
      {state.status === "error" && (
        <div className="split-total bad" style={{ marginTop: "0.75rem" }}>
          {state.message}
        </div>
      )}
    </div>
  );
}

export default function HashtagDetail({
  record,
  transactions,
}: {
  record: HashtagRecord;
  transactions: HashtagTransaction[];
}) {
  useEffect(() => {
    document.documentElement.style.fontSize = "16px";
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, []);

  const exp = expiryStatus(record);

  return (
    <div id="app">
      <div style={{ maxWidth: "70rem", margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        <div className="topbar" style={{ padding: "0 0 1.25rem" }}>
          <div className="title">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h1>
                <span style={{ color: "var(--green-mid)" }}>@</span>
                {record.hashtag}
              </h1>
              <span className={"pill " + (exp.kind === "ok" ? "ok" : "warn")}>
                {exp.pill}
              </span>
            </div>
            <p>{record.name || "Onchain hashtag record · Robinhood Chain"}</p>
          </div>
          <div className="actions">
            <WalletControl />
            <Link to="/dashboard" className="btn ghost sm">
              ← Dashboard
            </Link>
          </div>
        </div>

        <div className="grid two" style={{ alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="card pad-lg">
              <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>
                Record
              </div>
              <div className="route-line">
                <span style={{ color: "var(--ink-soft)" }}>Owner</span>
                <span className="addr-mono">{record.owner_wallet}</span>
              </div>
              <div className="route-line">
                <span style={{ color: "var(--ink-soft)" }}>Registered</span>
                <span>{fmtDate(record.registered_at)}</span>
              </div>
              <div className="route-line">
                <span style={{ color: "var(--ink-soft)" }}>Expires</span>
                <span>{fmtDate(record.expires_at)}</span>
              </div>
              <div className="route-line">
                <span style={{ color: "var(--ink-soft)" }}>Total volume</span>
                <span className="amt">
                  ${Number(record.total_volume_usd ?? 0).toLocaleString("en-US")}
                </span>
              </div>
              {record.website_url && (
                <div className="route-line">
                  <span style={{ color: "var(--ink-soft)" }}>Website</span>
                  <a
                    href={record.website_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--green-deep)" }}
                  >
                    {record.website_url}
                  </a>
                </div>
              )}
              <div style={{ marginTop: "1.1rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.78rem",
                    color: "var(--ink-faint)",
                    marginBottom: "0.35rem",
                  }}
                >
                  <span>Subscription</span>
                  <span>{exp.countdown}</span>
                </div>
                <div className="lease-bar">
                  <span style={{ width: exp.pct + "%" }}></span>
                </div>
              </div>
              <RenewButton hashtag={record.hashtag} />
            </div>

            <div className="card pad-lg">
              <div className="section-title">
                <div>
                  <div className="eyebrow">Routing</div>
                  <h2>Payout splits</h2>
                </div>
              </div>
              {record.payouts.length === 0 && (
                <p style={{ fontSize: "0.9rem", color: "var(--ink-faint)" }}>
                  No payout recipients configured — payments go to the owner wallet.
                </p>
              )}
              {record.payouts.map((p, i) => (
                <div className="route-line" key={i}>
                  <span className="addr-mono">{p.wallet}</span>
                  <span className="amt">
                    {(p.percentage_bps / 100).toFixed(2)}%{" "}
                    <span style={{ color: "var(--ink-faint)", fontWeight: 400, fontSize: "0.8rem" }}>
                      · {p.percentage_bps} bps
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <div className="card pad-lg">
              <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>
                Socials
              </div>
              {record.socials.length === 0 && (
                <p style={{ fontSize: "0.9rem", color: "var(--ink-faint)" }}>
                  No social links attached to this hashtag.
                </p>
              )}
              {record.socials.map((s, i) => (
                <div className="route-line" key={i}>
                  <b style={{ fontWeight: 500, textTransform: "capitalize" }}>{s.key}</b>
                  <span>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="card pad-lg">
              <div className="section-title">
                <h2>Payments</h2>
                <span className="pill ok">{transactions.length} indexed</span>
              </div>
              {transactions.length === 0 && (
                <p style={{ fontSize: "0.9rem", color: "var(--ink-faint)" }}>
                  No payments indexed for this hashtag yet.
                </p>
              )}
              {transactions.slice(0, 12).map((tx) => (
                <div className="route-line" key={tx.signature}>
                  <div className="who">
                    <b className="addr-mono">{short(tx.signature)}</b>
                    <span style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>
                      {tx.chain} · {fmtDate(tx.timestamp)}
                    </span>
                  </div>
                  <TxAmount tx={tx} />
                </div>
              ))}
            </div>

            <SyncTransaction hashtag={record.hashtag} />
          </div>
        </div>
      </div>
    </div>
  );
}
