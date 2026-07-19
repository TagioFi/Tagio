import { erc20Abi, getAddress, isAddress } from "viem";
import { config } from "../config";
import { getPublicClient } from "../services/onchain/client";

// Same curated allowlist plainly already verified for Robinhood Chain
// (backend/src/lib/tokens.ts there) -- ticker recognition for the X bot and
// the dapp's Trade token picker, so "GOOGL"/"NVDA"/etc. resolve without the
// user ever typing a contract address.
export interface TokenInfo {
  symbol: string;
  address: `0x${string}`;
  // True for native ETH, represented internally by its WETH address for
  // quoting purposes (Uniswap pools are always WETH-denominated) -- swap
  // planning branches on this to skip approval and use the native value/
  // unwrap paths.
  native?: boolean;
  // Confirmed directly on-chain (2026-07-19) for every entry below --
  // avoids a live decimals() read anywhere this list is already known
  // (e.g. the wallet balances endpoint).
  decimals: number;
}

export const USDG: TokenInfo = {
  symbol: "USDG",
  address: config.robinhood.usdgAddress,
  decimals: 6,
};

export const ETH: TokenInfo = {
  symbol: "ETH",
  address: config.uniswap.wethAddress,
  native: true,
  decimals: 18,
};

export const STOCK_TOKENS: TokenInfo[] = [
  { symbol: "AAPL", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", decimals: 18 },
  { symbol: "TSLA", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", decimals: 18 },
  { symbol: "NVDA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", decimals: 18 },
  { symbol: "GOOGL", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", decimals: 18 },
  { symbol: "AMZN", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", decimals: 18 },
  { symbol: "MSFT", address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", decimals: 18 },
  { symbol: "META", address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", decimals: 18 },
  { symbol: "COIN", address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", decimals: 18 },
  // The deployed token's own symbol() is "SPCX", not "SPACEX" -- confirmed
  // directly on-chain (2026-07-19); plainly's allowlist had this wrong, and
  // ticker-only lookups (findToken) only match on the exact symbol here.
  { symbol: "SPCX", address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", decimals: 18 },
];

// Alternate tickers people actually type for a listed symbol -- resolved to
// the real allowlisted symbol before lookup. SPY -> SPCX: people commonly
// call SpaceX stock "SPY" in conversation even though the deployed token's
// own symbol() is SPCX (see STOCK_TOKENS above).
const TICKER_ALIASES: Record<string, string> = {
  SPY: "SPCX",
};

// Fast, no-RPC allowlist lookup -- the common path for both the bot's ticker
// parsing and the dapp's token picker.
export function findToken(symbol: string): TokenInfo | undefined {
  const upper = TICKER_ALIASES[symbol.toUpperCase()] ?? symbol.toUpperCase();
  if (upper === USDG.symbol) return USDG;
  if (upper === ETH.symbol) return ETH;
  return STOCK_TOKENS.find((t) => t.symbol === upper);
}

// Allowlist first; if that misses and the input is a valid address, resolve
// it directly on-chain instead of rejecting it -- lets a real ERC20 be
// swapped even when it isn't one of the curated 9, without ever guessing at
// an address ourselves.
export async function resolveToken(input: string): Promise<TokenInfo | undefined> {
  const known = findToken(input);
  if (known) return known;

  const trimmed = input.trim();
  if (!isAddress(trimmed)) return undefined;

  const address = getAddress(trimmed);
  const client = getPublicClient();

  try {
    const [decimals, symbol] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
      client
        .readContract({ address, abi: erc20Abi, functionName: "symbol" })
        .catch(() => address.slice(0, 8)),
    ]);
    if (typeof decimals !== "number") return undefined;
    return { symbol: String(symbol), address, decimals };
  } catch {
    // Not a real ERC20 contract at this address, or the RPC call failed.
    return undefined;
  }
}
