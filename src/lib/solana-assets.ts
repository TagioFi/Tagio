import { useEffect, useState } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Spec Module 2: live SOL + USDC balances read straight from Solana RPC.
 *
 * Deliberately not routed through the backend -- GET /wallet/:address/balances
 * is EVM-only (viem isAddress + erc20 balanceOf against the Robinhood token
 * set), so a base58 owner 400s there. Reading base currencies client-side needs
 * no backend change at all.
 */

export const SOL_MINT = "11111111111111111111111111111111";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Both token programs -- classic SPL and Token-2022. xStocks mints are issued
// under Token-2022, so querying only the classic program would silently show a
// zero balance for every equity the wallet holds.
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export interface SolanaBalance {
  symbol: string;
  mint: string;
  native: boolean;
  decimals: number;
  /** raw base units, as a string -- same shape the dashboard already renders */
  balance: string;
}

/** Every SPL balance the wallet holds, keyed by mint. */
export async function fetchSplBalances(
  connection: Connection,
  owner: PublicKey,
): Promise<Map<string, { amount: string; decimals: number }>> {
  const results = await Promise.all(
    [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) =>
      connection
        .getParsedTokenAccountsByOwner(owner, { programId })
        .catch(() => ({ value: [] as unknown[] })),
    ),
  );

  const byMint = new Map<string, { amount: string; decimals: number }>();
  for (const res of results) {
    for (const acc of (res.value ?? []) as {
      account: {
        data: {
          parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } };
        };
      };
    }[]) {
      const info = acc?.account?.data?.parsed?.info;
      if (!info?.mint) continue;
      const prev = byMint.get(info.mint);
      // A wallet can hold several token accounts for one mint; sum them.
      const amount = (BigInt(prev?.amount ?? "0") + BigInt(info.tokenAmount.amount)).toString();
      byMint.set(info.mint, { amount, decimals: info.tokenAmount.decimals });
    }
  }
  return byMint;
}

/** Anything with a mint we can label — the xStocks directory from GET /tokens. */
export interface MintDirectoryEntry {
  symbol: string;
  mint: string;
  decimals: number;
  name?: string;
  iconUrl?: string;
}

/**
 * SOL + USDC for the connected wallet, plus every xStock it actually holds.
 *
 * The base currencies are returned even at zero so the panel doesn't collapse
 * to nothing on a fresh wallet; equities appear only when held, so this doesn't
 * turn into a wall of 714 zero-balance tickers.
 */
export async function getSolanaBalances(
  connection: Connection,
  owner: PublicKey,
  directory: MintDirectoryEntry[] = [],
): Promise<SolanaBalance[]> {
  const [lamports, splByMint] = await Promise.all([
    connection.getBalance(owner),
    fetchSplBalances(connection, owner),
  ]);

  const usdc = splByMint.get(USDC_MINT);

  const base: SolanaBalance[] = [
    {
      symbol: "SOL",
      mint: SOL_MINT,
      native: true,
      decimals: 9,
      balance: String(lamports),
    },
    {
      symbol: "USDC",
      mint: USDC_MINT,
      native: false,
      decimals: usdc?.decimals ?? 6,
      balance: usdc?.amount ?? "0",
    },
  ];

  const held: SolanaBalance[] = [];
  for (const token of directory) {
    if (token.mint === SOL_MINT || token.mint === USDC_MINT) continue;
    const entry = splByMint.get(token.mint);
    if (!entry || BigInt(entry.amount) === 0n) continue;
    held.push({
      symbol: token.symbol,
      mint: token.mint,
      native: false,
      // Trust the chain's own decimals over the directory's, so a stale
      // directory entry can't misrender a real balance by orders of magnitude.
      decimals: entry.decimals ?? token.decimals,
      balance: entry.amount,
    });
  }
  held.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return [...base, ...held];
}

export const solToNumber = (lamports: number) => lamports / LAMPORTS_PER_SOL;

/** React wrapper used by the dashboard wallet panel. */
export function useSolanaBalances(
  connection: Connection | null,
  owner: PublicKey | null,
  directory: MintDirectoryEntry[] = [],
) {
  const [balances, setBalances] = useState<SolanaBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const ownerKey = owner?.toBase58() ?? null;
  // The directory array is rebuilt on every render by its caller; keying the
  // effect on its identity would restart the 30s poll continuously.
  const directoryKey = directory.length;

  useEffect(() => {
    if (!connection || !owner) {
      setBalances([]);
      return;
    }
    let live = true;
    const load = () => {
      setLoading(true);
      getSolanaBalances(connection, owner, directory)
        .then((b) => {
          if (live) setBalances(b);
        })
        .catch(() => {
          if (live) setBalances([]);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(id);
    };
    // owner is compared by its base58 string -- the PublicKey object identity
    // changes on every render of the wallet adapter context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, ownerKey, directoryKey]);

  return { balances, loading };
}
