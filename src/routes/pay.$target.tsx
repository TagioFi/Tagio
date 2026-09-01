/**
 * Pay page. `target` is either a tag (`/pay/alex`) or an invoice id
 * (`/pay/inv_abc123`) — invoices prefill the amount, token and memo, then
 * resolve to the recipient's tag for the actual settlement.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

import { AllocationBar, legColor } from "@/components/tf/allocation-bar";
import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { useWallet } from "@/hooks/useWallet";
import {
  useConfirmV2Settlement,
  useV2ElectionQuote,
  useV2Handle,
  useV2Invoice,
  useV2PendingTransaction,
} from "@/hooks/useTagioV2";
import { executeSettlement } from "@/lib/relay";
import { formatAmount, formatBps, friendlyError, shortAddress } from "@/lib/tagio-api";
import { cn } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/wagmi";

export const Route = createFileRoute("/pay/$target")({
  component: PayPage,
});

const BASE_TOKENS = ["USDG", "ETH"] as const;

function PayPage() {
  const { target } = Route.useParams();
  const isInvoice = target.startsWith("inv_");
  const isPendingTx = target.startsWith("pnd_") || /^\d+$/.test(target);

  const invoiceQuery = useV2Invoice(isInvoice ? target : undefined);
  const invoice = invoiceQuery.data;

  const pendingQuery = useV2PendingTransaction(isPendingTx ? target : undefined);
  const pendingTx = pendingQuery.data;

  // Resolve recipient handle from invoice or pending transaction or route target
  const handle = isInvoice
    ? invoice?.recipient_handle
    : isPendingTx
      ? pendingTx?.handleDetails?.handle || pendingTx?.transaction?.target_value?.replace(/^[@#]/, "")
      : target;

  const handleQuery = useV2Handle(handle);

  const { address, isConnected, isWrongNetwork, walletClient } = useWallet();
  const [amount, setAmount] = useState("");
  const [fromToken, setFromToken] = useState<string>("USDG");

  // Prefill once invoice or pending transaction resolves
  useEffect(() => {
    if (invoice) {
      setAmount(String(invoice.target_amount));
      setFromToken(invoice.target_token_symbol);
    } else if (pendingTx?.transaction) {
      setAmount(String(pendingTx.transaction.amount));
      const rawToken = pendingTx.transaction.token?.toUpperCase();
      setFromToken(rawToken === "NATIVE" ? "ETH" : rawToken || "USDG");
    } else if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const qAmount = sp.get("amount");
      const qToken = sp.get("token");
      if (qAmount) setAmount(qAmount);
      if (qToken) setFromToken(qToken.toUpperCase());
    }
  }, [invoice, pendingTx]);

  const quoteParams = useMemo(
    () => ({
      handle,
      fromToken,
      amount,
      ...(address ? { userWallet: address } : {}),
    }),
    [handle, fromToken, amount, address],
  );

  const quoteQuery = useV2ElectionQuote(quoteParams);
  const quote = quoteQuery.data;

  const confirm = useConfirmV2Settlement();
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);

  const legs = (handleQuery.data?.elections ?? [])
    .filter((election) => election.isActive)
    .map((election) => ({ symbol: election.symbol, basisPoints: election.basisPoints }));

  const settle = async () => {
    if (!quote || !walletClient || !address) return;
    setIsSettling(true);
    setError(null);
    setTxHash(null);
    try {
      const hashes = await executeSettlement(walletClient, quote, (progress) =>
        setStatus(`Signing ${progress.index} of ${progress.total}…`),
      );
      const last = hashes[hashes.length - 1]!;
      setTxHash(last);
      setStatus("Settled.");
      toast.success(`Paid @${handle}`, {
        description: "Settled atomically into their receive-mix.",
      });

      // Bookkeeping only, and deliberately outside the block above: the funds
      // have already moved by this point, so a failure here must never be
      // reported to the payer as a failed payment.
      try {
        await confirm.mutateAsync({
          senderWallet: address,
          recipientWallet: quote.recipientWallet,
          recipientHandle: handle ?? null,
          txHash: last,
          ...(quote.legs[0]?.quote?.requestId ? { requestId: quote.legs[0].quote.requestId } : {}),
          inputTokenSymbol: quote.inputToken?.symbol ?? fromToken,
          ...(quote.inputToken?.address ? { inputTokenAddress: quote.inputToken.address } : {}),
          inputAmount: String(quote.totalInAmount ?? amount),
          outputBreakdown: quote.legs.map((leg) => ({
            assetSymbol: leg.assetSymbol,
            basisPoints: leg.basisPoints,
            ...(leg.quote?.amountOut ? { amountOut: leg.quote.amountOut } : {}),
          })),
        });
      } catch (confirmError) {
        console.error(
          "[pay] settlement recorded on-chain but /v2/settle/confirm failed:",
          confirmError,
        );
      }
    } catch (err) {
      setStatus(null);
      const message = friendlyError(err);
      setError(message);
      toast.error("Payment didn't go through", { description: message });
    } finally {
      setIsSettling(false);
    }
  };

  if (handleQuery.isLoading || (isInvoice && invoiceQuery.isLoading)) {
    return (
      <PageShell>
        <div className="flex min-h-[70vh] items-center justify-center">
          <p className="text-sm text-ink/45">Resolving @{handle ?? target}…</p>
        </div>
      </PageShell>
    );
  }

  if (handleQuery.isError || (isInvoice && invoiceQuery.isError)) {
    return (
      <PageShell>
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">
            {isInvoice ? "Invoice not found" : `@${target} isn't claimed`}
          </h1>
          <p className="mt-3 max-w-sm text-ink/55">
            {isInvoice
              ? "This pay-link has expired or never existed."
              : "No wallet has registered this tag yet."}
          </p>
          <Link
            to="/"
            className="mt-8 rounded-full bg-ink px-6 py-3 text-sm font-bold text-cream transition-colors hover:bg-ink/85"
          >
            Back home
          </Link>
        </div>
      </PageShell>
    );
  }

  const profile = handleQuery.data;
  const displayHandle = profile?.handle || handle || (isPendingTx ? pendingTx?.handleDetails?.handle || pendingTx?.transaction?.target_value?.replace(/^[@#]/, "") : "") || target;

  return (
    <PageShell>
      <SpotlightBackground />
      <Aurora />

      <section className="relative mx-auto max-w-5xl px-6 py-20">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* ── Recipient ─────────────────────────────────────────────── */}
          <SpotlightCard className="p-8">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center overflow-hidden rounded-full border border-ink/10 bg-cream-deep">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-lg font-extrabold text-ink/50">
                    {displayHandle.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-extrabold tracking-[-0.03em] text-ink">
                  @{displayHandle}
                </h1>
                {profile?.displayName ? (
                  <p className="truncate text-sm text-ink/55">{profile.displayName}</p>
                ) : null}
              </div>
            </div>

            {profile?.bio ? (
              <p className="mt-5 text-sm leading-relaxed text-ink/55">{profile.bio}</p>
            ) : null}

            <p className="mt-5 font-mono text-xs text-ink/40">
              {shortAddress(profile?.ownerWallet || pendingTx?.transaction?.resolved_to_wallet)}
            </p>

            <div className="mt-7">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
                Receive-mix
              </p>
              {legs.length ? (
                <>
                  <AllocationBar legs={legs} className="mt-3" />
                  <ul className="mt-4 space-y-2">
                    {legs.map((leg, index) => (
                      <li key={leg.symbol} className="flex items-center gap-2.5 text-sm">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: legColor(index) }}
                          aria-hidden="true"
                        />
                        <span className="font-mono font-semibold text-ink">{leg.symbol}</span>
                        <span className="tf-numeric ml-auto text-ink/50">
                          {formatBps(leg.basisPoints)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-sm text-ink/50">
                  No mix set — payment lands in the token you send.
                </p>
              )}
            </div>

            {invoice ? (
              <div className="mt-7 rounded-2xl border border-ink/10 bg-cream-deep/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
                    Invoice
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide",
                      invoice.status === "paid"
                        ? "bg-lime/40 text-ink"
                        : invoice.status === "expired"
                          ? "bg-ink/8 text-ink/50"
                          : "bg-ink text-cream",
                    )}
                  >
                    {invoice.status}
                  </span>
                </div>
                <p className="tf-numeric mt-3 text-2xl font-bold text-ink">
                  {formatAmount(invoice.target_amount)}{" "}
                  <span className="font-mono text-base font-semibold text-ink/50">
                    {invoice.target_token_symbol}
                  </span>
                </p>
                {invoice.memo ? <p className="mt-2 text-sm text-ink/55">{invoice.memo}</p> : null}
              </div>
            ) : null}
          </SpotlightCard>

          {/* ── Payment ───────────────────────────────────────────────── */}
          <SpotlightCard className="p-8">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">You send</h2>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink/12 bg-cream/60 p-4">
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Amount to send"
                className="tf-numeric min-w-0 flex-1 bg-transparent text-3xl font-light text-ink outline-none placeholder:text-ink/25"
              />
              <div className="flex shrink-0 gap-1 rounded-full bg-ink/6 p-1">
                {BASE_TOKENS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setFromToken(token)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 font-mono text-xs font-bold transition-colors",
                      fromToken === token ? "bg-ink text-cream" : "text-ink/50 hover:text-ink",
                    )}
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-7">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
                  They receive
                </h2>
                {quoteQuery.isFetching ? (
                  <span className="text-xs text-ink/40">Re-quoting…</span>
                ) : null}
              </div>

              <div className="mt-4 space-y-2">
                {!quote && !quoteQuery.isFetching ? (
                  <p className="rounded-2xl border border-dashed border-ink/15 p-6 text-center text-sm text-ink/40">
                    Enter an amount to route a quote.
                  </p>
                ) : null}

                {quoteQuery.isError ? (
                  <p className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
                    {friendlyError(quoteQuery.error)}
                  </p>
                ) : null}

                {quote?.legs.map((leg, index) => (
                  <div
                    key={leg.assetSymbol}
                    className="flex items-center gap-3 rounded-xl border border-ink/8 bg-cream/40 px-4 py-3"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: legColor(index) }}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-sm font-bold text-ink">{leg.assetSymbol}</span>
                    <span className="tf-numeric text-xs text-ink/40">
                      {formatBps(leg.basisPoints)}
                    </span>
                    {leg.isFallbackUsdg ? (
                      <span className="rounded-full bg-ink/8 px-2 py-0.5 text-[0.62rem] font-bold uppercase text-ink/50">
                        safe-settled
                      </span>
                    ) : null}
                    <span className="tf-numeric ml-auto text-sm font-semibold text-ink">
                      {formatAmount(leg.quote?.amountOutFormatted ?? leg.quote?.amountOut, 4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <dl className="mt-7 space-y-2 border-t border-ink/10 pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/45">Protocol fee</dt>
                <dd className="tf-numeric font-semibold text-ink">0.15%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/45">Settlement</dt>
                <dd className="font-semibold text-ink">Atomic · single signature</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={settle}
              disabled={!isConnected || !walletClient || isWrongNetwork || !quote || isSettling}
              className="mt-6 w-full rounded-full bg-ink py-4 text-sm font-bold text-cream transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-16px] hover:shadow-ink/60 disabled:pointer-events-none disabled:opacity-45"
            >
              {!isConnected
                ? "Connect a wallet to pay"
                : isWrongNetwork
                  ? "Switch to Robinhood Chain"
                  : isSettling
                    ? (status ?? "Settling…")
                    : `Pay @${displayHandle}`}
            </button>

            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

            {txHash ? (
              <a
                href={explorerTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block truncate text-center font-mono text-xs text-ink/50 underline underline-offset-4 hover:text-ink"
              >
                {txHash}
              </a>
            ) : null}
          </SpotlightCard>
        </div>
      </section>
    </PageShell>
  );
}
