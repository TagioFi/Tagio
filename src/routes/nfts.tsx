import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { isAddress } from "viem";

import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { useWallet } from "@/hooks/useWallet";
import { api, friendlyError, shortAddress } from "@/lib/tagio-api";
import { robinhoodExplorerUrl } from "@/lib/wagmi";

export const HASHTAG_NFT_ADDRESS = "0x364469b9709D7E0E2bf6a049Aca3a8B436FbcEa3";

interface SearchParams {
  tag?: string | undefined;
  recipient?: string | undefined;
  contract?: string | undefined;
  tokenId?: string | undefined;
}

export const Route = createFileRoute("/nfts")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    tag: typeof search["tag"] === "string" ? search["tag"] : undefined,
    recipient: typeof search["recipient"] === "string" ? search["recipient"] : undefined,
    contract: typeof search["contract"] === "string" ? search["contract"] : undefined,
    tokenId: typeof search["tokenId"] === "string" ? search["tokenId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "TagioFi · Send & Receive NFTs to Any Tag" },
      {
        name: "description",
        content:
          "Transfer digital collectibles, membership passes, and Tagio Hashtag NFTs directly to handles (@joeundav) or raw wallets on Robinhood Chain with zero address errors.",
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

interface UserTagToken {
  handle: string;
  displayName: string | null;
  contractAddress: string;
  tokenId: string;
  isVerifiedOnchain: boolean;
}

function NftTransferPage() {
  const search = Route.useSearch();
  const { address, isConnected, walletClient } = useWallet();

  // Mode: "tag" (Tagio Hashtag NFT) or "custom" (Any Robinhood Chain ERC-721)
  const [assetMode, setAssetMode] = useState<"tag" | "custom">(search.contract ? "custom" : "tag");

  // Form Fields
  const [selectedTag, setSelectedTag] = useState<string>(search.tag || "");
  const [customContract, setCustomContract] = useState<string>(search.contract || HASHTAG_NFT_ADDRESS);
  const [customTokenId, setCustomTokenId] = useState<string>(search.tokenId || "");
  const [recipientInput, setRecipientInput] = useState<string>(search.recipient || "");

  // Resolution State
  const [resolving, setResolving] = useState(false);
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipient | null>(null);

  // User's Owned Tags
  const [userTags, setUserTags] = useState<UserTagToken[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // Execution State
  const [preparing, setPreparing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Fetch user's registered tags if connected
  useEffect(() => {
    if (!address) {
      setUserTags([]);
      return;
    }

    setLoadingTags(true);
    api
      .get<{ tags: UserTagToken[] }>(`/v2/nfts/tags/${address}`)
      .then((res) => {
        const tags = res.tags || [];
        setUserTags(tags);
        if (tags.length > 0 && !selectedTag && tags[0]) {
          setSelectedTag(tags[0].handle);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTags(false));
  }, [address]);

  // Real-time recipient handle resolution with debounce
  useEffect(() => {
    const clean = recipientInput.trim();
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
  }, 400);

    return () => clearTimeout(timer);
  }, [recipientInput]);

  const activeTokenId =
    assetMode === "tag"
      ? userTags.find((t) => t.handle.toLowerCase() === selectedTag.toLowerCase())?.tokenId || ""
      : customTokenId.trim();

  const activeContract =
    assetMode === "tag" ? HASHTAG_NFT_ADDRESS : customContract.trim();

  const handleTransfer = async () => {
    if (!address || !walletClient) {
      toast.error("Please connect your wallet first.");
      return;
    }

    if (!resolvedRecipient?.resolved || !resolvedRecipient.walletAddress) {
      toast.error("Please enter a valid recipient handle or wallet address.");
      return;
    }

    if (!activeTokenId) {
      toast.error("Please select or enter a valid Token ID.");
      return;
    }

    setPreparing(true);
    try {
      // 1. Build transfer plan from backend
      const plan = await api.post<{
        success: boolean;
        token: {
          contractAddress: string;
          tokenId: string;
          name: string;
          symbol: string;
        };
        recipient: {
          walletAddress: string;
          handle: string | null;
        };
        transaction: {
          to: string;
          data: string;
          value: string;
          chainId: number;
        };
      }>("/v2/nfts/transfer-plan", {
        fromWallet: address,
        target: recipientInput.trim(),
        contractAddress: activeContract,
        tokenId: activeTokenId,
      });

      setPreparing(false);
      setTransferring(true);

      // 2. Prompt wallet to sign and broadcast safeTransferFrom
      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: walletClient.chain,
        to: plan.transaction.to as `0x${string}`,
        data: plan.transaction.data as `0x${string}`,
        value: 0n,
      });

      setTxHash(hash);
      toast.success("NFT transfer broadcasted successfully!");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setPreparing(false);
      setTransferring(false);
    }
  };

  return (
    <PageShell>
      <SpotlightBackground />
      <section className="relative overflow-hidden px-6 pb-24 pt-36 md:pt-44">
        <Aurora className="opacity-40" />
        <div className="tf-grid" />

        <div className="relative z-10 mx-auto max-w-4xl">
          {/* Header */}
          <div className="text-center">
            <span className="tf-chip tf-rise" style={{ animationDelay: "40ms" }}>
              <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden="true" />
              Robinhood Chain (4663) · ERC-721 Rail
            </span>

            <h1
              className="tf-rise mt-6 text-[clamp(2.3rem,6vw,4.2rem)] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink"
              style={{ animationDelay: "120ms" }}
            >
              Send & Receive NFTs <br className="hidden sm:inline" />
              to Any Tag.
            </h1>

            <p
              className="tf-rise mx-auto mt-5 max-w-xl text-balance text-lg leading-relaxed text-ink/60"
              style={{ animationDelay: "200ms" }}
            >
              Transfer digital collectibles and Tagio Hashtag NFTs directly to handles
              (<code className="font-mono text-ink">@joeundav</code>) or raw wallets with zero address errors.
            </p>
          </div>

          {/* Main Transfer Terminal */}
          <div className="tf-rise mt-12" style={{ animationDelay: "280ms" }}>
            <SpotlightCard className="overflow-hidden p-6 md:p-10">
              <div className="flex flex-col gap-8">
                {/* 1. Asset Selection Mode */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
                    1. Select Collectible
                  </label>
                  <div className="mt-3 flex rounded-2xl border border-ink/10 bg-cream/50 p-1">
                    <button
                      type="button"
                      onClick={() => setAssetMode("tag")}
                      className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
                        assetMode === "tag"
                          ? "bg-ink text-cream shadow-sm"
                          : "text-ink/60 hover:text-ink"
                      }`}
                    >
                      🏷️ Tagio Hashtag NFT
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssetMode("custom")}
                      className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
                        assetMode === "custom"
                          ? "bg-ink text-cream shadow-sm"
                          : "text-ink/60 hover:text-ink"
                      }`}
                    >
                      🖼️ Custom ERC-721 Contract
                    </button>
                  </div>

                  {assetMode === "tag" ? (
                    <div className="mt-4">
                      {loadingTags ? (
                        <p className="text-xs text-ink/40">Checking your registered tags…</p>
                      ) : userTags.length > 0 ? (
                        <div>
                          <label className="block text-xs font-medium text-ink/60">
                            Choose one of your tags:
                          </label>
                          <select
                            value={selectedTag}
                            onChange={(e) => setSelectedTag(e.target.value)}
                            className="mt-1.5 w-full rounded-2xl border border-ink/15 bg-cream px-4 py-3 text-sm font-bold text-ink transition-colors focus:border-ink focus:outline-none"
                          >
                            {userTags.map((t) => (
                              <option key={t.handle} value={t.handle}>
                                #{t.handle} (Token #{t.tokenId.slice(0, 8)}…)
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-ink/15 bg-cream/30 p-4 text-center">
                          <p className="text-xs text-ink/50">
                            {isConnected
                              ? "No tags registered under this wallet yet."
                              : "Connect your wallet to choose from your registered tags."}
                          </p>
                          <Link
                            to="/app"
                            className="mt-2 inline-block font-mono text-xs font-bold text-lime-deep underline hover:text-ink"
                          >
                            Register a tag in the Studio ↗
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-ink/60">
                          NFT Contract Address (Robinhood Chain)
                        </label>
                        <input
                          type="text"
                          value={customContract}
                          onChange={(e) => setCustomContract(e.target.value)}
                          placeholder="0x..."
                          className="mt-1.5 w-full rounded-2xl border border-ink/15 bg-cream px-4 py-3 font-mono text-xs font-semibold text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink/60">
                          Token ID
                        </label>
                        <input
                          type="text"
                          value={customTokenId}
                          onChange={(e) => setCustomTokenId(e.target.value)}
                          placeholder="e.g. 1"
                          className="mt-1.5 w-full rounded-2xl border border-ink/15 bg-cream px-4 py-3 font-mono text-xs font-semibold text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Recipient Handle Resolution */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
                    2. Recipient Handle or Address
                  </label>
                  <div className="relative mt-2">
                    <input
                      type="text"
                      value={recipientInput}
                      onChange={(e) => setRecipientInput(e.target.value)}
                      placeholder="Enter recipient handle (e.g. @joeundav) or raw 0x... address"
                      className="w-full rounded-2xl border border-ink/15 bg-cream/70 px-4 py-3.5 text-sm font-semibold text-ink placeholder:text-ink/35 transition-colors focus:border-ink focus:bg-cream focus:outline-none"
                    />

                    {resolving ? (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-ink/40">
                        Resolving…
                      </span>
                    ) : null}
                  </div>

                  {/* Resolution Feedback Badge */}
                  {recipientInput.trim() && !resolving ? (
                    <div className="mt-2.5">
                      {resolvedRecipient?.resolved ? (
                        <div className="flex items-center gap-2.5 rounded-xl border border-lime/30 bg-lime/10 px-3.5 py-2 text-xs text-ink/80">
                          <span className="size-2 rounded-full bg-lime-deep" />
                          <span>
                            Resolved to{" "}
                            <strong className="text-ink">
                              {resolvedRecipient.displayName || resolvedRecipient.handle}
                            </strong>{" "}
                            ({shortAddress(resolvedRecipient.walletAddress)}) ·{" "}
                            <span className="font-semibold text-lime-deep">Verified Onchain</span>
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-ink/70">
                          <span>⚠️ Recipient handle not found. Please verify the tag or use a 0x address.</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* 3. Pre-Flight Summary & Action */}
                <div className="rounded-2xl border border-ink/10 bg-cream/40 p-5">
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex justify-between text-ink/60">
                      <span>Sender Wallet:</span>
                      <span className="font-mono text-ink font-semibold">
                        {address ? shortAddress(address) : "Not Connected"}
                      </span>
                    </div>
                    <div className="flex justify-between text-ink/60">
                      <span>Recipient:</span>
                      <span className="font-mono text-ink font-semibold">
                        {resolvedRecipient?.walletAddress
                          ? `${resolvedRecipient.handle || "Wallet"} (${shortAddress(resolvedRecipient.walletAddress)})`
                          : "Waiting for input…"}
                      </span>
                    </div>
                    <div className="flex justify-between text-ink/60">
                      <span>Contract:</span>
                      <span className="font-mono text-ink font-semibold">
                        {shortAddress(activeContract)} {assetMode === "tag" ? "(HashtagNFT)" : ""}
                      </span>
                    </div>
                    {activeTokenId ? (
                      <div className="flex justify-between text-ink/60">
                        <span>Token ID:</span>
                        <span className="font-mono text-ink font-semibold">
                          #{activeTokenId.length > 12 ? `${activeTokenId.slice(0, 10)}…` : activeTokenId}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {txHash ? (
                    <div className="mt-5 rounded-xl border border-lime/40 bg-lime/20 p-4 text-center">
                      <p className="text-xs font-bold text-ink">🎉 Transfer Complete!</p>
                      <a
                        href={`${robinhoodExplorerUrl}/tx/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block font-mono text-xs text-lime-deep underline hover:text-ink"
                      >
                        View receipt on Blockscout ↗
                      </a>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleTransfer}
                      disabled={
                        !isConnected ||
                        !resolvedRecipient?.resolved ||
                        !activeTokenId ||
                        preparing ||
                        transferring
                      }
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-sm font-bold text-cream shadow-md transition-all hover:bg-ink/85 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {preparing
                        ? "Verifying onchain…"
                        : transferring
                        ? "Confirming in wallet…"
                        : "Transfer NFT ↗"}
                    </button>
                  )}
                </div>
              </div>
            </SpotlightCard>
          </div>

          {/* Features Highlights */}
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            <SpotlightCard className="p-6">
              <span className="text-xl">🏷️</span>
              <h3 className="mt-3 text-sm font-bold text-ink">Tag-to-Tag Transfers</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink/55">
                Send NFTs directly to verified handles. No copy-pasting hex strings or risking bad fills.
              </p>
            </SpotlightCard>

            <SpotlightCard className="p-6">
              <span className="text-xl">🛡️</span>
              <h3 className="mt-3 text-sm font-bold text-ink">Zero-Custody Standard</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink/55">
                Executes via standard OpenZeppelin safeTransferFrom. TagioFi contracts never hold custody of your collectibles.
              </p>
            </SpotlightCard>

            <SpotlightCard className="p-6">
              <span className="text-xl">⚡</span>
              <h3 className="mt-3 text-sm font-bold text-ink">1-Second Finality</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink/55">
                Powered by Robinhood Chain with sub-cent gas fees and instant settlement.
              </p>
            </SpotlightCard>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
