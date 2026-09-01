/**
 * RWA trading terminal — non-custodial swaps between the verified Robinhood
 * Chain assets (tokenized equities, USDG, ETH/WETH).
 *
 * The backend quotes Uniswap V3 and V4 in parallel and hands back an ordered
 * `steps` array. A cross-asset quote arrives as `approve` → `swap`, so the
 * router that needs the allowance is the **swap** step's `to`, never the first
 * step's (that one is the token contract). Everything the wallet signs comes
 * straight from that payload; the UI only decides *when* to send it.
 */

import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useBalance,
  useReadContract,
  useReadContracts,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { toast } from "sonner";

import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { TagioMark } from "@/components/tf/brand";
import { WalletButton } from "@/components/tf/wallet-button";
import { useV2Assets, useV2PendingTransaction, useV2SingleQuote } from "@/hooks/useTagioV2";
import { friendlyError } from "@/lib/tagio-api";
import { explorerTxUrl, robinhoodChain } from "@/lib/wagmi";
import { cn } from "@/lib/utils";
import type { V2QuoteStep, V2TokenInfo } from "@/types/tagio-v2";

/**
 * `id` and `amount` stay `string | number` on purpose. The router parses search
 * values as JSON, so coercing a numeric `?id=123` to a string makes the
 * serializer re-quote it (`?id=%22123%22`) and bounce every bot link through a
 * redirect. Leaving the parsed type alone round-trips cleanly.
 */
export interface TradeSearch {
  id?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  amount?: string | undefined;
}

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "TagioFi · Trade RWA Stocks on Robinhood Chain" },
      {
        name: "description",
        content:
          "Instant, non-custodial swaps between tokenized equities, ETFs, USDG, and ETH on Robinhood Chain with single-signature atomic execution.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): TradeSearch => ({
    id: search["id"] ? String(search["id"]) : undefined,
    from: search["from"] ? String(search["from"]) : undefined,
    to: search["to"] ? String(search["to"]) : undefined,
    amount: search["amount"] ? String(search["amount"]) : undefined,
  }),
  component: TradePage,
});

/* ── Verified asset allowlist ───────────────────────────────────────────────
 *
 * The strict list from the v2 trading spec. Nothing outside it is selectable,
 * quotable, or displayed — the registry endpoint may only refresh metadata for
 * these addresses, never add to them.
 */

const TRADE_ASSETS: V2TokenInfo[] = [
  {
    symbol: "USDG",
    name: "Global Dollar",
    address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    decimals: 6,
    isBaseCurrency: true,
    assetType: "stablecoin",
    iconUrl: "https://assets.coingecko.com/coins/images/51281/standard/GDN_USDG_Token_200x200.png",
  },
  {
    symbol: "ETH",
    name: "Ether",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    isNative: true,
    isBaseCurrency: true,
    assetType: "native",
    iconUrl: "https://assets.relay.link/icons/1/light.png",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    decimals: 18,
    isBaseCurrency: true,
    assetType: "native",
    iconUrl: "https://assets.relay.link/icons/1/light.png",
  },
  {
    symbol: "SPCX",
    name: "SpaceX (Space Exploration Technologies)",
    underlyingTicker: "SPCX",
    address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
    decimals: 18,
    assetType: "equity",
    iconUrl:
      "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68497d354d7140b01657a793_Ticker%3DSPCX.svg",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corp. Token",
    underlyingTicker: "NVDA",
    address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    decimals: 18,
    assetType: "equity",
    iconUrl: "https://cryptologos.cc/logos/nvidia-logo.png",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc. Token",
    underlyingTicker: "AAPL",
    address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    decimals: 18,
    assetType: "equity",
    iconUrl: "https://cryptologos.cc/logos/apple-logo.png",
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc. Token",
    underlyingTicker: "TSLA",
    address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    decimals: 18,
    assetType: "equity",
    iconUrl: "https://cryptologos.cc/logos/tesla-motors-logo.png",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc. Token",
    underlyingTicker: "GOOGL",
    address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
    decimals: 18,
    assetType: "equity",
    iconUrl: "https://cryptologos.cc/logos/google-logo.png",
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc. Token",
    underlyingTicker: "AMZN",
    address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
    decimals: 18,
    assetType: "equity",
    iconUrl: "https://cryptologos.cc/logos/amazon-logo.png",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp. Token",
    underlyingTicker: "MSFT",
    address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
    decimals: 18,
    assetType: "equity",
    iconUrl: "https://cryptologos.cc/logos/microsoft-logo.png",
  },
  {
    symbol: "META",
    name: "Meta Platforms Inc. Token",
    underlyingTicker: "META",
    address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
    decimals: 18,
    assetType: "equity",
    iconUrl: "https://cryptologos.cc/logos/meta-logo.png",
  },
  {
    symbol: "COIN",
    name: "Coinbase Global Inc. Token",
    underlyingTicker: "COIN",
    address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b",
    decimals: 18,
    assetType: "equity",
    iconUrl: "https://cryptologos.cc/logos/coinbase-logo.png",
  },
];

const ALLOWED_ADDRESSES = new Set(TRADE_ASSETS.map((token) => token.address.toLowerCase()));
const ALLOWED_SYMBOLS = new Set(TRADE_ASSETS.map((token) => token.symbol));

/** Native MAX leaves this much ETH behind so the swap itself can still pay gas. */
const NATIVE_GAS_BUFFER = parseUnits("0.0005", 18);

const SLIPPAGE_PRESETS = [0.5, 1.0, 2.5] as const;

  // Form State
  const [fromSymbol, setFromSymbol] = useState<string>("USDG");
  const [toSymbol, setToSymbol] = useState<string>("SPCX");
  const [amountIn, setAmountIn] = useState<string>("50");
  const [slippage, setSlippage] = useState<number>(1.0); // 1.0%

/* ── Token registry ─────────────────────────────────────────────────────── */

/**
 * The allowlist, with live metadata layered on where the registry knows the
 * same address. Assets the API reports that aren't on the list are dropped.
 */
function useTradeTokens(): V2TokenInfo[] {
  const { data } = useV2Assets();

  return useMemo(() => {
    const live = new Map<string, V2TokenInfo>();
    for (const asset of [
      ...(data?.baseCurrencies ?? []),
      ...(data?.featured ?? []),
      ...(data?.assets ?? []),
    ]) {
      const key = asset.address?.toLowerCase();
      if (!key || !ALLOWED_ADDRESSES.has(key) || live.has(key)) continue;
      live.set(key, asset);
    }

    return TRADE_ASSETS.map((token): V2TokenInfo => {
      const match = live.get(token.address.toLowerCase());
      if (!match) return token;
      // Keep our own address casing, and our icon when the registry has none.
      const merged: V2TokenInfo = { ...token, ...match, address: token.address };
      if (!match.iconUrl && token.iconUrl) merged.iconUrl = token.iconUrl;
      return merged;
    });
  }, [data]);
}


  // Balances
  const { data: nativeBalance } = useBalance({
    address,
    chainId: robinhoodChain.id,
  });

  const erc20Tokens = useMemo(
    () => HARDCODED_ASSETS.filter((t) => !t.isNative),
    [],
  );

  const balanceContracts = useMemo(() => {
    if (!address) return [];
    return erc20Tokens.map((t) => ({
      address: t.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }));
  }, [address, erc20Tokens]);

  const { data: erc20Balances, refetch: refetchBalances } = useReadContracts({
    contracts: balanceContracts,
  });

  const tokenBalances = useMemo(() => {
    const map: Record<string, string> = {};
    if (nativeBalance) {
      map["ETH"] = parseFloat(nativeBalance.formatted).toFixed(4);
    }
    if (erc20Balances) {
      erc20Tokens.forEach((t, i) => {
        const res = erc20Balances[i];
        if (res && res.result !== undefined) {
          const val = formatUnits(res.result as bigint, t.decimals);
          map[t.symbol] = parseFloat(val).toFixed(4);
        }
      });
    }
    return map;
  }, [nativeBalance, erc20Balances, erc20Tokens]);

  const currentFromBalance = tokenBalances[fromToken.symbol] || "0.00";
  const currentToBalance = tokenBalances[toToken.symbol] || "0.00";

/* ── Page ───────────────────────────────────────────────────────────────── */

function TradePage() {
  const search: TradeSearch = useSearch({ from: "/trade" });
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const tokens = useTradeTokens();
  const { balances, refetch: refetchBalances } = useTokenBalances(tokens, address);


  const [fromSymbol, setFromSymbol] = useState("USDG");
  const [toSymbol, setToSymbol] = useState("SPCX");
  const [amountIn, setAmountIn] = useState("50");
  const [slippage, setSlippage] = useState<number>(1.0);

    fromToken: fromToken.symbol,
    toToken: toToken.symbol,
    amount: amountIn,
    userWallet: address,
  });

  // Check allowance for ERC20
  const quoteSteps = (quote?.steps as any[]) || [];
  const swapSpender = quoteSteps[0]?.items?.[0]?.data?.to || "0x0000000000000000000000000000000000000002";
  const { data: allowanceData, refetch: refetchAllowance } = useReadContracts({
    contracts: [
      {
        address: fromToken.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address || "0x0000000000000000000000000000000000000000", swapSpender as `0x${string}`],
      },
    ],
  });

  const needsApproval = useMemo(() => {
    if (fromToken.isNative) return false;
    if (!amountIn || isNaN(Number(amountIn)) || Number(amountIn) <= 0) return false;
    if (!allowanceData?.[0]?.result) return true;
    const required = parseUnits(amountIn, fromToken.decimals);
    const allowed = allowanceData[0].result as bigint;
    return allowed < required;
  }, [fromToken, amountIn, allowanceData]);

  // Actions
  const { writeContractAsync: writeApprove, isPending: isApproving } = useWriteContract();
  const { sendTransactionAsync: sendSwap, isPending: isSwapping } = useSendTransaction();
  const [activeTxHash, setActiveTxHash] = useState<string | null>(null);

  const { isLoading: isWaitingReceipt } = useWaitForTransactionReceipt({
    hash: activeTxHash as `0x${string}` | undefined,
  });

  const selectFrom = (symbol: string) => {
    if (symbol === toSymbol) setToSymbol(fromSymbol);
    setFromSymbol(symbol);
  };

  const selectTo = (symbol: string) => {
    if (symbol === fromSymbol) setFromSymbol(toSymbol);
    setToSymbol(symbol);
  };

  const flip = () => {
    const previousFrom = fromSymbol;
    setFromSymbol(toSymbol);
    setToSymbol(previousFrom);
    // The old output is the natural new input.
    if (quote?.amountOutFormatted) setAmountIn(trimAmount(quote.amountOutFormatted));
  };

  /** Percentage pills work off base units so MAX never rounds past the balance. */
  };

  const handleApprove = async () => {
    if (!address) return;
    try {
      const approveAmount = parseUnits("1000000000", fromToken.decimals);
      const hash = await writeApprove({
        address: fromToken.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [swapSpender as `0x${string}`, approveAmount],
      });
      toast.info("Approval submitted...", { description: `Tx: ${hash.slice(0, 10)}...` });
      setActiveTxHash(hash);
      setTimeout(() => {
        refetchAllowance();
        toast.success(`Approved ${fromToken.symbol} for trading!`);
      }, 4000);
    } catch (err: any) {
      toast.error("Approval failed", { description: err.shortMessage || err.message });
    }
  };

  const handleExecuteTrade = async () => {
    if (!isConnected) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (chainId !== robinhoodChain.id) {
      switchChain({ chainId: robinhoodChain.id });
      return;
    }
    if (!quote || !quoteSteps || quoteSteps.length === 0) {
      toast.error("No executable swap step available for this pair");
      return;
    }

    try {
      const swapStep = quoteSteps.find((s: any) => s.id === "swap" || s.id === "transfer") || quoteSteps[0];
      const itemData = swapStep?.items?.[0]?.data;

      if (!itemData) {
        toast.error("Invalid swap transaction calldata");
        return;
      }

      const txHash = await sendSwap({
        to: itemData.to,
        data: itemData.data,
        value: BigInt(itemData.value || "0"),
      });

      setActiveTxHash(txHash);
      toast.success("Trade broadcasted to Robinhood Chain!", {
        description: `Swapped ${amountIn} ${fromToken.symbol} → ${quote.amountOutFormatted} ${toToken.symbol}`,
        action: {
          label: "View Explorer",
          onClick: () => window.open(explorerTxUrl(txHash), "_blank"),
        },
      });

      setTimeout(() => {
        refetchBalances();
      }, 5000);
    } catch (err: any) {
      toast.error("Trade failed", { description: err.shortMessage || err.message });
    }
  };

  const isBusy = isApproving || isSwapping || isWaitingReceipt;

  return (
    <PageShell>
      <SpotlightBackground />
      <Aurora />

      <section className="relative mx-auto max-w-4xl px-6 pb-16 pt-32">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Trade RWA Stocks.
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-balance text-sm leading-relaxed text-ink/65 sm:text-base">
            Instant, non-custodial swaps between tokenized equities, ETFs, USDG, and ETH. Executed
            atomically in a single signature on Robinhood Chain.
          </p>
        </div>

        {/* Pending Twitter Trade Banner */}
        {pendingTxData?.transaction && (
          <SpotlightCard className="mt-8 border-lime/50 bg-lime/10 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <TagioMark className="size-7 text-lime-deep" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-lime-deep">
                    Pending Trade from Twitter (@TagioPayBot)
                  </span>
                  <div className="text-sm font-semibold text-ink">
                    Swap {pendingTxData.transaction.amount} {pendingTxData.transaction.token} →{" "}
                    {pendingTxData.transaction.target_value}
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-cream px-3 py-1 text-xs font-bold text-ink/70">
                Ready to Sign
              </span>
            </div>
          </SpotlightCard>
        )}

        {/* Main Swap Terminal Card */}
        <div className="mt-8">
          <SpotlightCard className="p-6 sm:p-8">
            <div className="flex items-center justify-between pb-4">
              <h2 className="text-lg font-bold tracking-tight text-ink">Swap Terminal</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink/40">Slippage:</span>
                {[0.5, 1.0, 2.5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlippage(s)}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-bold transition-all",
                      slippage === s
                        ? "bg-ink text-cream"
                        : "bg-cream-deep text-ink/60 hover:text-ink",
                    )}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>

            {/* Token In Input */}
            <div className="rounded-2xl border border-ink/10 bg-cream/70 p-4 transition-all focus-within:border-ink/25">
              <div className="flex items-center justify-between text-xs font-semibold text-ink/50">
                <span>You Pay</span>
                <span>
                  Balance:{" "}
                  <span className="font-mono text-ink font-bold">{currentFromBalance}</span>
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-4">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-mono text-2xl font-extrabold text-ink outline-none sm:text-3xl"
                />

                <TokenSelector
                  tokens={tokens}
                  balances={balances}
                  value={fromToken}
                  onSelect={selectFrom}
                  label="Select the token you pay with"
                />
              </div>

              <div className="mt-3 flex gap-2">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      const maxNum = parseFloat(currentFromBalance) || 0;
                      const calculated = ((maxNum * pct) / 100).toFixed(4);
                      setAmountIn(calculated);
                    }}
                    className="rounded-md border border-ink/10 bg-cream-deep/60 px-2 py-0.5 text-xs font-semibold text-ink/60 hover:bg-cream-deep hover:text-ink"
                  >
                    {pct === 100 ? "MAX" : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Flip */}
            <div className="relative my-2 flex justify-center">
              <button
                type="button"
                onClick={flip}
                aria-label="Switch the pair around"
                title="Switch assets"
                className="flex size-9 items-center justify-center rounded-full border border-ink/15 bg-cream text-ink shadow-md transition-all hover:rotate-180 hover:bg-cream-deep"
              >
                ⇅
              </button>
            </div>

            {/* Token Out Input */}
            <div className="rounded-2xl border border-ink/10 bg-cream/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-ink/50">
                <span>You Receive</span>
                <span>
                  Balance:{" "}
                  <span className="font-mono text-ink font-bold">{currentToBalance}</span>
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-4">
                <div className="w-full font-mono text-2xl font-extrabold text-ink sm:text-3xl">
                  {isQuoteLoading ? (
                    <span className="text-ink/30 animate-pulse">Quoting...</span>
                  ) : quote?.amountOutFormatted ? (
                    parseFloat(quote.amountOutFormatted).toFixed(4)
                  ) : (
                    "0.00"
                  )}
                </div>

                <TokenSelector
                  tokens={tokens}
                  balances={balances}
                  value={toToken}
                  onSelect={selectTo}
                  label="Select the token you receive"
                />
              </div>
            </div>

            {/* Quote Details Breakdown */}
            {quote && (
              <div className="mt-5 space-y-2 rounded-xl border border-ink/8 bg-cream-deep/40 p-4 text-xs font-medium text-ink/70">
                <div className="flex justify-between">
                  <span>Exchange Rate</span>
                  <span className="font-mono font-bold text-ink">
                    1 {fromToken.symbol} ≈ {parseFloat(quote.rate || "1").toFixed(4)} {toToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Price Impact</span>
                  <span
                    className={cn(
                      "font-mono font-bold",
                      quote.priceImpactPct > 2
                        ? "text-rose-600"
                        : quote.priceImpactPct > 0.5
                          ? "text-amber-600"
                          : "text-emerald-600",
                    )}
                  >
                    {quote.priceImpactPct > 0 ? `${quote.priceImpactPct.toFixed(2)}%` : "< 0.05%"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Protocol Settlement Fee</span>
                  <span className="font-bold text-ink">
                    {fromToken.symbol === toToken.symbol ? "0.00% (Free Direct)" : "0.15% (Bounded)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Execution Routing</span>
                  <span className="font-bold text-emerald-700">Atomic Best-Route Settlement</span>
                </div>
              </div>
            )}

            {/* Execution Buttons */}
            <div className="mt-6">
              {!isConnected ? (
                <div className="text-center">
                  <p className="text-xs font-semibold text-ink/60 mb-2">Connect wallet to trade on Robinhood Chain</p>
                  <Link
                    to="/app"
                    className="block w-full rounded-full bg-ink py-4 text-center text-sm font-bold text-cream transition-all hover:bg-ink/90"
                  >
                    Connect Wallet in Studio
                  </Link>
                </div>
              ) : needsApproval ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleApprove}
                  className="w-full rounded-full bg-lime py-4 text-sm font-bold text-ink transition-all hover:shadow-lg hover:shadow-lime/30 disabled:opacity-50"
                >
                  {isApproving ? "Approving in Wallet..." : `Approve ${fromToken.symbol} for Trading`}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy || isQuoteLoading || !Number(amountIn)}
                  onClick={handleExecuteTrade}
                  className="w-full rounded-full bg-ink py-4 text-sm font-bold text-cream transition-all hover:shadow-xl hover:shadow-ink/40 disabled:opacity-50"
                >
                  {isSwapping || isWaitingReceipt ? "Executing Swap..." : `Swap ${fromToken.symbol} → ${toToken.symbol}`}
                </button>
              )}
            </div>
          </SpotlightCard>
        </div>

        {/* RWA Holdings Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold tracking-tight text-ink">Your Robinhood RWA Holdings</h3>
            <span className="text-xs font-semibold text-ink/40">Chain ID: 4663</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HARDCODED_ASSETS.map((asset) => {
              const bal = tokenBalances[asset.symbol] || "0.00";
              const hasBal = parseFloat(bal) > 0;
              return (
                <SpotlightCard
                  key={asset.symbol}
                  className={cn(
                    "p-4 transition-all",
                    hasBal ? "border-lime/40 bg-lime/5" : "opacity-80",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="rounded bg-cream-deep px-1.5 py-0.5 font-mono text-xs font-bold text-ink">
                        {asset.symbol}
                      </span>
                      <div className="mt-1 text-xs text-ink/60 truncate max-w-[140px]">
                        {asset.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-ink">{bal}</div>
                      {hasBal ? (
                        <button
                          type="button"
                          onClick={() => {
                            setFromSymbol(asset.symbol);
                            setToSymbol("USDG");
                            setAmountIn(bal);
                          }}
                          className="mt-1 text-xs font-bold text-lime-deep hover:underline"
                        >
                          Sell for USDG
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setFromSymbol("USDG");
                            setToSymbol(asset.symbol);
                            setAmountIn("50");
                          }}
                          className="mt-1 text-xs font-bold text-ink/50 hover:text-ink"
                        >
                          Buy with USDG
                        </button>
                      )}
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
/* ── Token selector ─────────────────────────────────────────────────────── */

function TokenIcon({ token, className }: { token: V2TokenInfo; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!token.iconUrl || failed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-ink/10 font-mono text-[0.6rem] font-bold text-ink/60",
          className,
        )}
        aria-hidden="true"
      >
        {token.symbol.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={token.iconUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-cream object-contain", className)}
    />
  );
}

/**
 * Searchable picker over the allowlist, with each asset's live balance so the
 * user can see what they hold without closing the sheet.
 */
function TokenSelector({
  tokens,
  balances,
  value,
  onSelect,
  label,
}: {
  tokens: V2TokenInfo[];
  balances: Record<string, bigint>;
  value: V2TokenInfo;
  onSelect: (symbol: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tokens;
    return tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(needle) ||
        token.name.toLowerCase().includes(needle) ||
        (token.underlyingTicker?.toLowerCase().includes(needle) ?? false),
    );
  }, [tokens, query]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="flex items-center gap-2 rounded-full border border-ink/15 bg-cream px-3 py-1.5 font-bold text-ink shadow-sm outline-none transition-colors hover:border-ink/30"
      >
        <TokenIcon token={value} className="size-5" />
        {value.symbol}
        <span className="text-[0.6rem] text-ink/40" aria-hidden="true">
          ▼
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-ink/12 bg-card shadow-[0_24px_60px_-24px_rgba(23,23,26,0.55)]">
          <div className="border-b border-ink/8 p-2.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search SPCX, Apple, USDG…"
              aria-label="Search verified assets"
              className="w-full rounded-xl border border-ink/12 bg-cream/70 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/35"
            />
          </div>

          <ul role="listbox" className="max-h-72 overflow-y-auto p-1.5">
            {results.map((token) => (
              <li key={token.symbol}>
                <button
                  type="button"
                  role="option"
                  aria-selected={token.symbol === value.symbol}
                  onClick={() => {
                    onSelect(token.symbol);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    token.symbol === value.symbol ? "bg-ink/6" : "hover:bg-ink/5",
                  )}
                >
                  <TokenIcon token={token} className="size-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{token.symbol}</span>
                    <span className="block truncate text-xs text-ink/50">{token.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs font-semibold text-ink/60">
                    {formatBalance(balances[token.symbol], token.decimals)}
                  </span>
                </button>
              </li>
            ))}

            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-ink/45">
                Nothing matches. Only the {tokens.length} verified Robinhood Chain assets are
                tradable here.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

