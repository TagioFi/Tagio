import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { isAddress } from "viem";

import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { useWallet } from "@/hooks/useWallet";
import { api, friendlyError, shortAddress } from "@/lib/tagio-api";
import { robinhoodExplorerUrl } from "@/lib/wagmi";

interface SearchParams {
  contract?: string | undefined;
  tokenId?: string | undefined;
  recipient?: string | undefined;
}

export const Route = createFileRoute("/nfts")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    contract: typeof search["contract"] === "string" ? search["contract"] : undefined,
    tokenId: typeof search["tokenId"] === "string" ? search["tokenId"] : undefined,
    recipient: typeof search["recipient"] === "string" ? search["recipient"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "TagioFi · Send NFTs to Any Tag" },
      {
        name: "description",
        content:
          "Send digital collectibles and NFTs directly to handles (@joeundav) or raw wallets on Robinhood Chain with zero address errors.",
      },
    ],
  }),
  component: NftTransferPage,
});

interface ResolvedRecipient {
  resolved: boolean;
  walletAddress?: string;
  handle?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  isHandle?: boolean;
}

interface TransferPlan {
  token: {
    contractAddress: string;
    tokenId: string;
    name: string;
    symbol: string;
  };
  recipient: {
    walletAddress: string;
    handle: string | null;
    displayName: string | null;
  };
  transaction: {
    to: string;
    data: string;
    value: string;
    chainId: number;
  };
}

function NftTransferPage() {
  const search = Route.useSearch();
  const { address, isConnected, walletClient } = useWallet();

  // Inputs
  const [contractAddress, setContractAddress] = useState<string>(search.contract || "");
  const [tokenId, setTokenId] = useState<string>(search.tokenId || "");
  const [recipient, setRecipient] = useState<string>(search.recipient || "");

  // Real-time recipient resolution
  const [resolving, setResolving] = useState(false);
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipient | null>(null);

  // Review & Execution state
  const [verifying, setVerifying] = useState(false);
  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Debounced real-time recipient resolution
  useEffect(() => {
    const clean = recipient.trim();
    if (!clean) {
      setResolvedRecipient(null);
      setResolving(false);
      return;
    }

    setResolving(true);
    const timer = setTimeout(() => {
      api
        .get<ResolvedRecipient>(`/v2/nfts/resolve-target/${encodeURIComponent(clean)}`)
        .then((res) => {
          setResolvedRecipient(res);
        })
        .catch(() => {
          setResolvedRecipient({ resolved: false });
        })
        .finally(() => {
          setResolving(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [recipient]);

  // Clear plan if inputs change
  useEffect(() => {
    setPlan(null);
    setTxHash(null);
  }, [contractAddress, tokenId, recipient]);

  // Step 1: Review & Verify Ownership onchain
  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      toast.error("Please connect your wallet first.");
      return;
    }

    if (!contractAddress.trim() || !isAddress(contractAddress.trim())) {
      toast.error("Please enter a valid NFT contract address (0x...).");
      return;
    }

    if (!tokenId.trim()) {
      toast.error("Please enter a Token ID.");
      return;
    }

    if (!resolvedRecipient?.resolved || !resolvedRecipient.walletAddress) {
      toast.error("Please enter a valid recipient handle or wallet address.");
      return;
    }

    setVerifying(true);
    try {
      const result = await api.post<{
        success: boolean;
        token: TransferPlan["token"];
        recipient: TransferPlan["recipient"];
        transaction: TransferPlan["transaction"];
      }>("/v2/nfts/transfer-plan", {
        fromWallet: address,
        target: recipient.trim(),
        contractAddress: contractAddress.trim(),
        tokenId: tokenId.trim(),
      });

      setPlan(result);
      toast.success("Ownership verified onchain!");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setVerifying(false);
    }
  };

  // Step 2: Sign & Broadcast safeTransferFrom
  const handleSend = async () => {
    if (!walletClient || !plan) return;

    setSending(true);
    try {
      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: walletClient.chain,
        to: plan.transaction.to as `0x${string}`,
        data: plan.transaction.data as `0x${string}`,
        value: 0n,
      });

      setTxHash(hash);
      toast.success("NFT transferred successfully!");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  const isFormValid =
    isConnected &&
    isAddress(contractAddress.trim()) &&
    tokenId.trim().length > 0 &&
    resolvedRecipient?.resolved === true;

  return (
    <PageShell>
      <SpotlightBackground />
      <section className="relative overflow-hidden px-6 pb-28 pt-36 md:pt-44">
        <Aurora className="opacity-40" />
        <div className="tf-grid" />

        <div className="relative z-10 mx-auto max-w-xl">
          {/* Header */}
          <div className="text-center">
            <span className="tf-chip tf-rise" style={{ animationDelay: "40ms" }}>
              <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden="true" />
              Robinhood Chain (4663) · ERC-721
            </span>

            <h1
              className="tf-rise mt-6 text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-ink"
              style={{ animationDelay: "120ms" }}
            >
              Send NFT to Any Tag
            </h1>

            <p
              className="tf-rise mt-4 text-balance text-base leading-relaxed text-ink/60"
              style={{ animationDelay: "180ms" }}
            >
              Enter the NFT contract and token ID, then send directly to a handle or raw address.
            </p>
          </div>

          {/* Minimalist Apple-Style Card */}
          <div className="tf-rise mt-10" style={{ animationDelay: "260ms" }}>
            <SpotlightCard className="p-7 sm:p-9">
              {!txHash ? (
                <form onSubmit={handleReview} className="space-y-6">
                  {/* Field 1: NFT Contract Address */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">
                      NFT Contract Address
                    </label>
                    <input
                      type="text"
                      value={contractAddress}
                      onChange={(e) => setContractAddress(e.target.value)}
                      placeholder="0x..."
                      spellCheck={false}
                      className="mt-2 w-full rounded-2xl border border-ink/15 bg-cream/70 px-4 py-3.5 font-mono text-xs font-semibold text-ink placeholder:text-ink/30 transition-colors focus:border-ink focus:bg-cream focus:outline-none"
                    />
                  </div>

                  {/* Field 2: Token ID */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">
                      Token ID (Decimal or Hex)
                    </label>
                    <input
                      type="text"
                      value={tokenId}
                      onChange={(e) => setTokenId(e.target.value.trim())}
                      placeholder="e.g. 1 or 0x..."
                      className="mt-2 w-full rounded-2xl border border-ink/15 bg-cream/70 px-4 py-3.5 font-mono text-xs font-semibold text-ink placeholder:text-ink/30 transition-colors focus:border-ink focus:bg-cream focus:outline-none"
                    />
                  </div>

                  {/* Field 3: Recipient */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45">
                        Recipient (Tag or Wallet)
                      </label>
                      {resolving ? (
                        <span className="font-mono text-[10px] text-ink/40">Resolving…</span>
                      ) : null}
                    </div>

                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="e.g. @joeundav or 0x..."
                      spellCheck={false}
                      className="mt-2 w-full rounded-2xl border border-ink/15 bg-cream/70 px-4 py-3.5 text-sm font-semibold text-ink placeholder:text-ink/30 transition-colors focus:border-ink focus:bg-cream focus:outline-none"
                    />

                    {/* Live Resolution Badge */}
                    {recipient.trim() && !resolving ? (
                      <div className="mt-2">
                        {resolvedRecipient?.resolved ? (
                          <div className="flex items-center gap-2 rounded-xl border border-lime/30 bg-lime/10 px-3 py-2 text-xs text-ink">
                            <span className="size-1.5 rounded-full bg-lime-deep" />
                            <span>
                              Resolved to{" "}
                              <strong>{resolvedRecipient.displayName || resolvedRecipient.handle}</strong>{" "}
                              <span className="font-mono text-ink/60">
                                ({shortAddress(resolvedRecipient.walletAddress)})
                              </span>
                            </span>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-ink/75">
                            ⚠️ Handle not found. Please check spelling or use a 0x address.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {/* Review Step or Review Confirmation */}
                  {!plan ? (
                    <button
                      type="submit"
                      disabled={!isFormValid || verifying}
                      className="w-full rounded-2xl bg-ink py-4 text-sm font-bold text-cream shadow-md transition-all hover:bg-ink/85 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
                    >
                      {verifying ? "Checking ownership onchain…" : "Review Transfer"}
                    </button>
                  ) : (
                    <div className="space-y-4 rounded-2xl border border-ink/10 bg-cream/50 p-5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-ink/50 uppercase tracking-wider">Asset</span>
                        <span className="font-semibold text-ink">
                          {plan.token.name} (#{plan.token.tokenId})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-ink/50 uppercase tracking-wider">To</span>
                        <span className="font-semibold text-ink">
                          {plan.recipient.handle || "Wallet"} (
                          {shortAddress(plan.recipient.walletAddress)})
                        </span>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleSend}
                          disabled={sending}
                          className="w-full rounded-2xl bg-lime py-4 text-sm font-extrabold text-ink shadow-sm transition-all hover:bg-lime/90 hover:shadow-md disabled:opacity-50 active:scale-[0.99]"
                        >
                          {sending ? "Confirm in wallet…" : "Sign & Send NFT ↗"}
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              ) : (
                <div className="py-6 text-center animate-in fade-in duration-300">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-lime/20 text-2xl shadow-inner">
                    ✓
                  </div>
                  <h3 className="mt-4 text-xl font-extrabold text-ink">NFT Transferred</h3>
                  <p className="mt-2 text-sm text-ink/60">
                    Your collectible has been transferred on Robinhood Chain.
                  </p>

                  <a
                    href={`${robinhoodExplorerUrl}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-block font-mono text-xs font-bold text-lime-deep underline hover:text-ink"
                  >
                    View transaction on Blockscout ↗
                  </a>

                  <div className="mt-6 pt-4 border-t border-ink/10">
                    <button
                      type="button"
                      onClick={() => {
                        setPlan(null);
                        setTxHash(null);
                        setTokenId("");
                      }}
                      className="rounded-full px-5 py-2 text-xs font-semibold text-ink/60 hover:text-ink"
                    >
                      Send another NFT
                    </button>
                  </div>
                </div>
              )}
            </SpotlightCard>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
