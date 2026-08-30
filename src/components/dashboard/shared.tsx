import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import type { Connection } from "@solana/web3.js";
import { useMemo } from "react";

import { fromBaseUnits, type SolanaSigner } from "../../lib/solana-exec";
import type { SolanaTokenInfo } from "../../lib/tagio";

/* ---------- recipient classification (spec Module 6) ---------- */

export const HANDLE_RE = /^[a-z0-9_]{3,32}$/;
/** Base58 excludes 0, O, I and l — a 32-44 char key is what a wallet shows. */
export const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * A Solana public key is 32 *bytes*, not 32-44 characters — and the character
 * range alone is ambiguous with this product's own namespace: a 32-character
 * hashtag drawn from base58-safe letters (say "abcdefghijkmnpqrstuvwxyzabcdefgh")
 * satisfies BASE58_RE while decoding to only 24 bytes. Matching on the regex
 * alone therefore classified such a handle as an address and made it unpayable.
 * Decoding is the definitive test, so it's what decides.
 */
export function isSolanaPublicKey(value: string): boolean {
  if (!BASE58_RE.test(value)) return false;
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

export type RecipientKind = "hashtag" | "x_account" | "solana" | "evm" | "empty" | "invalid";

/**
 * Classifies whatever the user typed into the one unified recipient box.
 * Prefix wins when present, so "#alice" is never mistaken for an @handle and a
 * pasted address is never mistaken for a name.
 */
export function classifyRecipient(raw: string): { kind: RecipientKind; value: string } {
  const input = raw.trim();
  if (!input) return { kind: "empty", value: "" };

  if (input.startsWith("#")) {
    const value = input.slice(1).toLowerCase();
    return { kind: HANDLE_RE.test(value) ? "hashtag" : "invalid", value };
  }
  if (input.startsWith("@")) {
    const value = input.slice(1).toLowerCase();
    return { kind: /^[a-z0-9_]{1,15}$/.test(value) ? "x_account" : "invalid", value };
  }
  if (EVM_RE.test(input)) return { kind: "evm", value: input };
  if (isSolanaPublicKey(input)) return { kind: "solana", value: input };
  // Bare text is read as a hashtag — the primary namespace of the product.
  const value = input.toLowerCase();
  return { kind: HANDLE_RE.test(value) ? "hashtag" : "invalid", value };
}

export const recipientLabel = (kind: RecipientKind): string => {
  switch (kind) {
    case "hashtag":
      return "TagioPay handle";
    case "x_account":
      return "X account";
    case "solana":
      return "Solana address";
    case "evm":
      return "Robinhood address";
    default:
      return "";
  }
};

/* ---------- wallet ---------- */

export interface SolanaWalletContext {
  wallet: SolanaSigner;
  connection: Connection;
  address: string | null;
  connected: boolean;
}

/** One place the wallet-adapter context is shaped into what solana-exec wants. */
export function useSolanaWallet(): SolanaWalletContext {
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();

  const wallet = useMemo<SolanaSigner>(
    () => ({
      publicKey,
      signTransaction: signTransaction as SolanaSigner["signTransaction"],
      sendTransaction: sendTransaction as SolanaSigner["sendTransaction"],
    }),
    [publicKey, signTransaction, sendTransaction],
  );

  return {
    wallet,
    connection,
    address: publicKey?.toBase58() ?? null,
    connected: Boolean(publicKey),
  };
}

/* ---------- formatting ---------- */

export const shortAddr = (a: string | null | undefined, lead = 4, tail = 4) =>
  a ? (a.length <= lead + tail + 1 ? a : a.slice(0, lead) + "…" + a.slice(-tail)) : "";

export const fmtAmount = (value: number | string, maxFractionDigits = 6) => {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
};

export const fmtBase = (base: string | bigint, decimals: number, maxFractionDigits = 6) =>
  fmtAmount(fromBaseUnits(base, decimals), maxFractionDigits);

/* ---------- token icon ---------- */

const LOCAL_ICONS: Record<string, string> = {
  SOL: "/sol.png",
  USDC: "/usdc.png",
  ETH: "/eth.png",
  USDG: "/usdg.png",
};

/**
 * xStocks ship a remote iconUrl in the token directory; base currencies use the
 * local assets in /public. Falls back to the "#" glyph so an icon that fails to
 * load never leaves a broken image in a row of balances.
 */
export function TokenIcon({
  symbol,
  iconUrl,
  size = "1.2rem",
}: {
  symbol: string;
  iconUrl?: string;
  size?: string;
}) {
  const src = LOCAL_ICONS[symbol] ?? iconUrl;
  if (!src) {
    return (
      <span className="hash" style={{ width: size, height: size, fontSize: `calc(${size} * 0.7)` }}>
        #
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
      }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        background: "var(--paper-deep)",
      }}
    />
  );
}

/* ---------- route preview (spec Module 6) ---------- */

export function RoutePreviewRows({
  path,
  amount,
  currency,
  feeAmount,
  netAmount,
  etaSeconds,
}: {
  path: "solana" | "relay";
  amount: string;
  currency: string;
  feeAmount: string;
  netAmount: string;
  etaSeconds: number;
}) {
  return (
    <>
      <div className="route-line">
        <span style={{ color: "var(--ink-soft)" }}>Execution</span>
        <span>
          {path === "solana" ? "Direct on Solana" : "Relay.link intent → Robinhood Chain"}
        </span>
      </div>
      <div className="route-line">
        <span style={{ color: "var(--ink-soft)" }}>Protocol fee</span>
        <span>
          {path === "solana" ? (
            <span style={{ color: "var(--green-deep)" }}>None — no bridge</span>
          ) : (
            <>
              0.15% · {feeAmount} {currency}
            </>
          )}
        </span>
      </div>
      <div className="route-line">
        <span style={{ color: "var(--ink-soft)" }}>Recipient receives</span>
        <b>
          {path === "solana" ? amount : netAmount} {currency}
        </b>
      </div>
      <div className="route-line">
        <span style={{ color: "var(--ink-soft)" }}>Estimated arrival</span>
        <span>&lt;{etaSeconds}s</span>
      </div>
    </>
  );
}

/* ---------- xStock directory helpers ---------- */

export const stockDisplayName = (t: SolanaTokenInfo) =>
  t.name?.replace(/\s*xStock$/i, "") || t.symbol;

export function filterStocks(stocks: SolanaTokenInfo[], query: string): SolanaTokenInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return stocks;
  return stocks.filter(
    (t) =>
      t.symbol.toLowerCase().includes(q) ||
      (t.underlyingTicker ?? "").toLowerCase().includes(q) ||
      (t.name ?? "").toLowerCase().includes(q),
  );
}
