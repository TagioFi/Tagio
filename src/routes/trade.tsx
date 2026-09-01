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

/* ── Helpers ────────────────────────────────────────────────────────────── */

function isAllowedSymbol(symbol: string | null | undefined): boolean {
  return Boolean(symbol && ALLOWED_SYMBOLS.has(symbol.toUpperCase()));
}

/** Drops trailing zeros so "12.500000" reads as "12.5" in the amount field. */
function trimAmount(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function formatBalance(raw: bigint | undefined, decimals: number): string {
  if (raw === undefined) return "0";
  if (raw === 0n) return "0";
  const value = Number(formatUnits(raw, decimals));
  if (value > 0 && value < 0.0001) return "<0.0001";
  return value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 4 });
}

function formatOut(value: string | undefined): string {
  if (!value) return "0.00";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n > 0 && n < 0.000001) return "<0.000001";
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 4 });
}

/**
 * The transaction the user actually signs. `approve` is stripped: allowances
 * are handled separately so a wallet that is already approved skips straight
 * to the swap.
 */
function findSwapStep(steps: V2QuoteStep[] | undefined): V2QuoteStep | undefined {
  if (!steps?.length) return undefined;
  const byId =
    steps.find((step) => step.id === "swap") ?? steps.find((step) => step.id === "transfer");
  if (byId) return byId;
  const executable = steps.filter((step) => step.id !== "approve" && step.items?.[0]?.data?.to);
  return executable[executable.length - 1];
}

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

/** Live balances for every allowlisted asset, kept in base units. */
function useTokenBalances(tokens: V2TokenInfo[], address: `0x${string}` | undefined) {
  const erc20Tokens = useMemo(() => tokens.filter((token) => !token.isNative), [tokens]);

  const native = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });

  const erc20 = useReadContracts({
    contracts: erc20Tokens.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
      chainId: robinhoodChain.id,
    })),
    query: { enabled: Boolean(address) },
  });

  const balances = useMemo(() => {
    const map: Record<string, bigint> = {};
    const nativeToken = tokens.find((token) => token.isNative);
    if (nativeToken && native.data) map[nativeToken.symbol] = native.data.value;

    erc20Tokens.forEach((token, index) => {
      const result = erc20.data?.[index];
      if (result?.status === "success" && typeof result.result === "bigint") {
        map[token.symbol] = result.result;
      }
    });
    return map;
  }, [tokens, erc20Tokens, native.data, erc20.data]);

  const refetch = () => {
    void native.refetch();
    void erc20.refetch();
  };

  return { balances, refetch };
}

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

  /* ── Quote ── */

  const amountNumber = Number(amountIn);
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const samePair = fromToken.symbol === toToken.symbol;

  const quoteQuery = useV2SingleQuote({
    fromToken: fromToken.symbol,
    toToken: toToken.symbol,
    amount: amountIn,
    userWallet: address,
    slippageBps: Math.round(slippage * 100),
  });
  const quote = quoteQuery.data;

  const amountInBaseUnits = useMemo(() => {
    if (!amountValid) return 0n;
    try {
      return parseUnits(amountIn, fromToken.decimals);
    } catch {
      return 0n;
    }
  }, [amountIn, amountValid, fromToken.decimals]);

  const insufficientBalance =
    Boolean(address) &&
    amountInBaseUnits > 0n &&
    fromBalance !== undefined &&
    amountInBaseUnits > fromBalance;

  /* ── Allowance ── */

  const swapStep = findSwapStep(quote?.steps);
  const spender = swapStep?.items?.[0]?.data?.to;
  // A same-asset settle comes back as a plain ERC20 `transfer` the user sends
  // from their own balance — there is no router to approve.
  const needsAllowance = Boolean(spender) && swapStep?.id !== "transfer" && !fromToken.isNative;

  const allowanceQuery = useReadContract({
    address: fromToken.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address && needsAllowance) },
  });

  const needsApproval = useMemo(() => {
    if (!needsAllowance || amountInBaseUnits === 0n) return false;
    const allowance = allowanceQuery.data;
    if (allowance === undefined) return false; // unknown yet — don't flash "Approve"
    return allowance < amountInBaseUnits;
  }, [needsAllowance, amountInBaseUnits, allowanceQuery.data]);

  /* ── Execution ── */

  const { writeContractAsync: writeApprove, isPending: isApproving } = useWriteContract();
  const { sendTransactionAsync: sendSwap, isPending: isSwapping } = useSendTransaction();

  const [approvalHash, setApprovalHash] = useState<`0x${string}` | null>(null);
  const [swapHash, setSwapHash] = useState<`0x${string}` | null>(null);

  const approvalReceipt = useWaitForTransactionReceipt({
    hash: approvalHash ?? undefined,
    query: { enabled: Boolean(approvalHash) },
  });
  const swapReceipt = useWaitForTransactionReceipt({
    hash: swapHash ?? undefined,
    query: { enabled: Boolean(swapHash) },
  });

  // Receipts land once; the refs stop the refetch below from re-triggering
  // itself when the query object changes identity.
  const settledApproval = useRef<string | null>(null);
  useEffect(() => {
    if (!approvalHash || !approvalReceipt.isSuccess) return;
    if (settledApproval.current === approvalHash) return;
    settledApproval.current = approvalHash;
    void allowanceQuery.refetch();
    toast.success(`${fromToken.symbol} approved`, { description: "You can send the swap now." });
  }, [approvalHash, approvalReceipt.isSuccess, allowanceQuery, fromToken.symbol]);

  const settledSwap = useRef<string | null>(null);
  useEffect(() => {
    if (!swapHash || !swapReceipt.isSuccess) return;
    if (settledSwap.current === swapHash) return;
    settledSwap.current = swapHash;
    refetchBalances();
    void quoteQuery.refetch();
    toast.success("Swap confirmed", {
      description: "Your balances are updating.",
      action: {
        label: "View on explorer",
        onClick: () => window.open(explorerTxUrl(swapHash), "_blank"),
      },
    });
  }, [swapHash, swapReceipt.isSuccess, refetchBalances, quoteQuery]);

  const wrongNetwork = isConnected && chainId !== robinhoodChain.id;
  const isBusy =
    isApproving || isSwapping || approvalReceipt.isLoading || swapReceipt.isLoading || isSwitching;

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
  const applyPercent = (percent: number) => {
    if (fromBalance === undefined) return;
    let usable = fromBalance;
    if (fromToken.isNative) {
      usable = fromBalance > NATIVE_GAS_BUFFER ? fromBalance - NATIVE_GAS_BUFFER : 0n;
    }
    const portion = (usable * BigInt(percent)) / 100n;
    setAmountIn(portion === 0n ? "0" : trimAmount(formatUnits(portion, fromToken.decimals)));
  };

  const handleApprove = async () => {
    if (!spender) return;
    try {
      const hash = await writeApprove({
        address: fromToken.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, parseUnits("1000000000", fromToken.decimals)],
        chainId: robinhoodChain.id,
      });
      setApprovalHash(hash);
      toast.info(`Approving ${fromToken.symbol}…`, { description: "Waiting for confirmation." });
    } catch (err) {
      toast.error("Approval failed", { description: txErrorMessage(err) });
    }
  };

  const handleSwap = async () => {
    const data = swapStep?.items?.[0]?.data;
    if (!data) {
      toast.error("No executable route for this pair right now");
      return;
    }
    try {
      const hash = await sendSwap({
        to: data.to,
        data: data.data,
        value: BigInt(data.value ?? "0"),
        chainId: robinhoodChain.id,
      });
      setSwapHash(hash);
      toast.success("Trade broadcast", {
        description: `${amountIn} ${fromToken.symbol} → ${formatOut(quote?.amountOutFormatted)} ${toToken.symbol}`,
        action: {
          label: "View on explorer",
          onClick: () => window.open(explorerTxUrl(hash), "_blank"),
        },
      });
    } catch (err) {
      toast.error("Trade failed", { description: txErrorMessage(err) });
    }
  };

  const priceImpact = quote?.priceImpactPct ?? 0;
  const sameAsset = fromToken.symbol === toToken.symbol;

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
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <h2 className="text-lg font-bold tracking-tight text-ink">Swap Terminal</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink/40">Slippage:</span>
                {SLIPPAGE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSlippage(preset)}
                    aria-pressed={slippage === preset}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-bold transition-all",
                      slippage === preset
                        ? "bg-ink text-cream"
                        : "bg-cream-deep text-ink/60 hover:text-ink",
                    )}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            {/* You pay */}
            <div className="rounded-2xl border border-ink/10 bg-cream/70 p-4 transition-all focus-within:border-ink/25">
              <div className="flex items-center justify-between text-xs font-semibold text-ink/50">
                <span>You Pay</span>
                <span>
                  Balance:{" "}
                  <span className="font-mono font-bold text-ink">
                    {formatBalance(fromBalance, fromToken.decimals)}
                  </span>
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-4">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountIn}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^0-9.]/g, "");
                    if ((next.match(/\./g)?.length ?? 0) > 1) return;
                    setAmountIn(next);
                  }}
                  placeholder="0.00"
                  aria-label="Amount to swap"
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
                {[25, 50, 75, 100].map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    disabled={fromBalance === undefined || fromBalance === 0n}
                    onClick={() => applyPercent(percent)}
                    title={
                      percent === 100 && fromToken.isNative
                        ? "Leaves a small amount of ETH for gas"
                        : undefined
                    }
                    className="rounded-md border border-ink/10 bg-cream-deep/60 px-2 py-0.5 text-xs font-semibold text-ink/60 transition-colors hover:bg-cream-deep hover:text-ink disabled:opacity-40 disabled:hover:bg-cream-deep/60"
                  >
                    {percent === 100 ? "MAX" : `${percent}%`}
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

            {/* You receive */}
            <div className="rounded-2xl border border-ink/10 bg-cream/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-ink/50">
                <span>You Receive</span>
                <span>
                  Balance:{" "}
                  <span className="font-mono font-bold text-ink">
                    {formatBalance(toBalance, toToken.decimals)}
                  </span>
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-4">
                <div className="w-full truncate font-mono text-2xl font-extrabold text-ink sm:text-3xl">
                  {quoteQuery.isLoading ? (
                    <span className="animate-pulse text-ink/30">Quoting…</span>
                  ) : (
                    formatOut(quote?.amountOutFormatted)
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

            {quoteQuery.isError ? (
              <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive">
                {friendlyError(quoteQuery.error)}
              </p>
            ) : null}

            {/* Quote breakdown */}
            {quote ? (
              <div className="mt-5 space-y-2 rounded-xl border border-ink/8 bg-cream-deep/40 p-4 text-xs font-medium text-ink/70">
                <div className="flex justify-between gap-4">
                  <span>Exchange Rate</span>
                  <span className="truncate font-mono font-bold text-ink">
                    1 {fromToken.symbol} ≈ {formatOut(quote.rate)} {toToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Price Impact</span>
                  <span
                    className={cn(
                      "font-mono font-bold",
                      priceImpact > 2
                        ? "text-rose-600"
                        : priceImpact > 0.5
                          ? "text-amber-600"
                          : "text-emerald-600",
                    )}
                  >
                    {priceImpact >= 0.01 ? `${priceImpact.toFixed(2)}%` : "< 0.01%"}
                    {priceImpact > 2 ? " ⚠" : ""}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Max Slippage</span>
                  <span className="font-mono font-bold text-ink">{slippage.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Protocol Settlement Fee</span>
                  <span className="font-bold text-ink">
                    {sameAsset ? "0.00% (Free Direct)" : "0.15% (Bounded)"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Execution Routing</span>
                  <span className="font-bold text-emerald-700">Atomic Best-Route Settlement</span>
                </div>
              </div>
            ) : null}

            {priceImpact > 2 ? (
              <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 text-xs font-semibold text-rose-700">
                Price impact is above 2% — this pool is thin for that size. Consider trading a
                smaller amount.
              </p>
            ) : null}

            {/* Execution */}
            <div className="mt-6">
              {!isConnected ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs font-semibold text-ink/60">
                    Connect a wallet to trade on Robinhood Chain
                  </p>
                  <WalletButton className="w-full justify-center py-4" />
                </div>
              ) : wrongNetwork ? (
                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={() => switchChain({ chainId: robinhoodChain.id })}
                  className="w-full rounded-full bg-ink py-4 text-sm font-bold text-cream transition-all hover:shadow-xl hover:shadow-ink/40 disabled:opacity-50"
                >
                  {isSwitching ? "Switching…" : "Switch to Robinhood Chain"}
                </button>
              ) : samePair ? (
                <button
                  type="button"
                  disabled
                  className="w-full rounded-full bg-ink/40 py-4 text-sm font-bold text-cream"
                >
                  Pick two different assets
                </button>
              ) : insufficientBalance ? (
                <button
                  type="button"
                  disabled
                  className="w-full rounded-full bg-ink/40 py-4 text-sm font-bold text-cream"
                >
                  Insufficient {fromToken.symbol} balance
                </button>
              ) : needsApproval ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleApprove()}
                  className="w-full rounded-full bg-lime py-4 text-sm font-bold text-ink transition-all hover:shadow-lg hover:shadow-lime/30 disabled:opacity-50"
                >
                  {isApproving
                    ? "Approving in wallet…"
                    : approvalReceipt.isLoading
                      ? "Confirming approval…"
                      : `Approve ${fromToken.symbol} for trading`}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy || quoteQuery.isLoading || !amountValid || !swapStep}
                  onClick={() => void handleSwap()}
                  className="w-full rounded-full bg-ink py-4 text-sm font-bold text-cream transition-all hover:shadow-xl hover:shadow-ink/40 disabled:opacity-50"
                >
                  {isSwapping
                    ? "Confirm in wallet…"
                    : swapReceipt.isLoading
                      ? "Executing swap…"
                      : `Swap ${fromToken.symbol} → ${toToken.symbol}`}
                </button>
              )}

              {isConnected && !wrongNetwork ? (
                <p className="mt-3 text-center text-[0.7rem] font-medium text-ink/40">
                  Non-custodial. The calldata you sign comes straight from the best-route quote.
                </p>
              ) : null}
            </div>
          </SpotlightCard>
        </div>

        {/* Holdings */}
        <div className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight text-ink">
              Your Robinhood RWA Holdings
            </h3>
            <span className="text-xs font-semibold text-ink/40">Chain ID: {robinhoodChain.id}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tokens.map((asset) => {
              const raw = balances[asset.symbol];
              const hasBalance = raw !== undefined && raw > 0n;
              return (
                <SpotlightCard
                  key={asset.symbol}
                  className={cn(
                    "p-4 transition-all",
                    hasBalance ? "border-lime/40 bg-lime/5" : "opacity-80",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TokenIcon token={asset} className="size-7" />
                      <div className="min-w-0">
                        <span className="rounded bg-cream-deep px-1.5 py-0.5 font-mono text-xs font-bold text-ink">
                          {asset.symbol}
                        </span>
                        <div className="mt-1 max-w-[140px] truncate text-xs text-ink/60">
                          {asset.name}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-ink">
                        {formatBalance(raw, asset.decimals)}
                      </div>
                      {hasBalance && asset.symbol !== "USDG" ? (
                        <button
                          type="button"
                          onClick={() => {
                            selectFrom(asset.symbol);
                            setToSymbol("USDG");
                            setAmountIn(trimAmount(formatUnits(raw, asset.decimals)));
                          }}
                          className="mt-1 text-xs font-bold text-lime-deep hover:underline"
                        >
                          Sell for USDG
                        </button>
                      ) : asset.symbol !== "USDG" ? (
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
                      ) : null}
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </div>

          <p className="mt-6 text-center text-xs text-ink/40">
            Want payments to land in these automatically?{" "}
            <Link to="/app" className="font-bold text-ink/70 underline-offset-2 hover:underline">
              Set a receive-mix in the studio
            </Link>
            .
          </p>
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

/* ── Errors ─────────────────────────────────────────────────────────────── */

/** Wallet/viem errors carry a `shortMessage`; user rejections get their own copy. */
function txErrorMessage(err: unknown): string {
  const short = (err as { shortMessage?: string })?.shortMessage;
  const message = short ?? (err instanceof Error ? err.message : String(err));
  if (/user rejected|denied|rejected the request/i.test(message)) {
    return "You rejected the request in your wallet.";
  }
  return message;
}
