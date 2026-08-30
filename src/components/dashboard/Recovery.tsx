import { useState } from "react";

import { EVM_RE, useSolanaWallet } from "./shared";
import {
  describeIntentState,
  encodeRecoverHashtag,
  friendlySolanaError,
  runRelayIntent,
} from "../../lib/relay-actions";
import {
  RECOVERY_WORD_COUNT,
  generateRecoveryPhrase,
  isWellFormedRecoveryPhrase,
  normalizeRecoveryPhrase,
  recoveryHash,
} from "../../lib/recovery";
import { HASHTAG_RE, normalizeHashtag } from "../../lib/tagio";

/**
 * The gas the Robinhood-side call needs, bridged from Solana as part of the
 * intent. `transferViaRecoveryPhrase` is nonpayable, so none of this reaches
 * the contract — it only funds the solver's execution, and Relay refunds what
 * isn't spent.
 */
const DEFAULT_GAS_BUDGET = "0.02";

/**
 * Spec Module 3 — Cryptographic Recovery.
 *
 * Lost the wallet that owns a handle? `transferViaRecoveryPhrase` checks the
 * phrase against the `recoveryHash` committed at registration and moves the
 * NFT to whichever address you name. It never reads `msg.sender`, which is
 * both why it works from a brand-new wallet and why it's safe to run over a
 * Relay intent (where msg.sender is the solver, not you).
 */
export function Recovery({
  toast,
  evmAddress,
}: {
  toast: (msg: string) => void;
  evmAddress?: string;
}) {
  const { wallet, connection, connected } = useSolanaWallet();

  const [hashtag, setHashtag] = useState("");
  const [phrase, setPhrase] = useState("");
  const [newOwner, setNewOwner] = useState(evmAddress ?? "");
  const [gas, setGas] = useState(DEFAULT_GAS_BUDGET);
  const [stage, setStage] = useState<
    { status: "idle" | "working"; message?: string } | { status: "done" | "error"; message: string }
  >({ status: "idle" });

  const name = normalizeHashtag(hashtag);
  const phraseOk = isWellFormedRecoveryPhrase(phrase);
  const ownerOk = EVM_RE.test(newOwner.trim());
  const ready = connected && HASHTAG_RE.test(name) && phraseOk && ownerOk && Number(gas) > 0;

  const recover = async () => {
    setStage({ status: "working", message: "Fetching a Relay quote…" });
    try {
      const result = await runRelayIntent({
        connection,
        wallet,
        currency: "SOL",
        amount: gas,
        txs: [
          encodeRecoverHashtag(
            name,
            normalizeRecoveryPhrase(phrase),
            newOwner.trim() as `0x${string}`,
          ),
        ],
        onProgress: (message) => setStage({ status: "working", message }),
      });

      const message = describeIntentState(result.state, `Recovery of #${name}`);
      setStage(
        result.state === "success" || result.state === "pending"
          ? { status: "done", message }
          : { status: "error", message },
      );
      toast(message);
    } catch (err) {
      setStage({ status: "error", message: friendlySolanaError(err) });
    }
  };

  const busy = stage.status === "working";

  return (
    <div className="grid two fade-in" style={{ alignItems: "start" }}>
      <div className="card pad-lg">
        <div className="eyebrow" style={{ marginBottom: "0.6rem" }}>
          Account recovery
        </div>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 500, marginBottom: "0.5rem" }}>
          Restore a handle to a new wallet
        </h2>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--ink-soft)",
            lineHeight: 1.55,
            marginBottom: "1rem",
          }}
        >
          Your {RECOVERY_WORD_COUNT}-word phrase proves ownership on its own — no admin approval,
          and the wallet that originally registered the handle isn't needed. Only the phrase's hash
          was ever written onchain.
        </p>

        <div className="form-row">
          <label className="field-label">Handle</label>
          <div
            style={{
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-sm)",
              padding: "0.35rem 0.35rem 0.35rem 0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span style={{ color: "var(--green)", fontSize: "1.1rem" }}>#</span>
            <input
              value={hashtag.replace(/^#/, "")}
              onChange={(e) => setHashtag(e.target.value)}
              placeholder="yourname"
              spellCheck={false}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: "1rem",
                background: "none",
              }}
            />
          </div>
        </div>

        <div className="form-row">
          <label className="field-label">Recovery phrase</label>
          <textarea
            className="input mono"
            rows={3}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={`${RECOVERY_WORD_COUNT} words, separated by spaces`}
            spellCheck={false}
            style={{ resize: "vertical", width: "100%" }}
          />
          {phrase && !phraseOk && (
            <div style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "0.35rem" }}>
              Expected {RECOVERY_WORD_COUNT} lowercase words.
            </div>
          )}
        </div>

        <div className="form-row">
          <label className="field-label">Transfer ownership to</label>
          <input
            className="input mono"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            placeholder="0x… Robinhood Chain address"
            spellCheck={false}
          />
          <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "0.35rem" }}>
            The handle is an NFT on Robinhood Chain, so its new owner is an address on that chain.
          </div>
        </div>

        <div className="form-row">
          <label className="field-label">Gas budget (SOL)</label>
          <input
            className="input mono"
            type="number"
            min="0"
            step="0.001"
            value={gas}
            onChange={(e) => setGas(e.target.value)}
          />
          <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "0.35rem" }}>
            Bridged to fund the Robinhood-side execution. Whatever isn't spent is refunded.
          </div>
        </div>

        <button
          className="btn"
          disabled={!ready || busy}
          onClick={recover}
          style={{ justifyContent: "center", width: "100%" }}
        >
          {busy ? (stage.message ?? "Working…") : "Recover handle"}
        </button>

        {!connected && (
          <div className="status" style={{ color: "var(--ink-faint)", marginTop: "0.75rem" }}>
            Connect a Solana wallet to pay for the recovery.
          </div>
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

      <PhraseGenerator toast={toast} />
    </div>
  );
}

/**
 * Standalone phrase generator, for pre-committing a recovery phrase before a
 * registration or rotating to a new one. The phrase is generated in the browser
 * and never sent anywhere — only its keccak256 hash goes onchain.
 */
export function PhraseGenerator({ toast }: { toast: (msg: string) => void }) {
  const [phrase, setPhrase] = useState("");
  const [revealed, setRevealed] = useState(false);

  const generate = () => {
    setPhrase(generateRecoveryPhrase());
    setRevealed(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      toast("Recovery phrase copied — store it somewhere safe");
    } catch {
      toast("Couldn't copy — select the phrase and copy it manually");
    }
  };

  return (
    <div className="card pad-lg">
      <div className="eyebrow" style={{ marginBottom: "0.6rem" }}>
        Generate a phrase
      </div>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--ink-soft)",
          lineHeight: 1.55,
          marginBottom: "1rem",
        }}
      >
        Generated on this device with the browser's CSPRNG. TagioPay never sees it — only
        keccak256(phrase) is committed onchain, so losing it means losing the recovery route.
      </p>

      <button className="btn ghost sm" onClick={generate}>
        {phrase ? "Generate another" : "Generate recovery phrase"}
      </button>

      {phrase && (
        <>
          <div
            className="mono"
            onClick={() => setRevealed(true)}
            style={{
              marginTop: "1rem",
              padding: "0.9rem",
              background: "var(--paper-deep)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.9rem",
              lineHeight: 1.7,
              wordSpacing: "0.25rem",
              cursor: revealed ? "text" : "pointer",
              filter: revealed ? "none" : "blur(6px)",
              userSelect: revealed ? "text" : "none",
              transition: "filter .2s ease",
            }}
          >
            {phrase}
          </div>
          {!revealed && (
            <div style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: "0.4rem" }}>
              Click to reveal — make sure nobody's looking over your shoulder.
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button className="btn sm" onClick={copy}>
              Copy
            </button>
          </div>
          <div
            className="addr-mono"
            style={{ fontSize: "0.72rem", color: "var(--ink-faint)", marginTop: "0.75rem" }}
          >
            Onchain hash: {recoveryHash(phrase).slice(0, 18)}…
          </div>
        </>
      )}
    </div>
  );
}
