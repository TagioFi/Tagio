/**
 * Asset registry surfaces, backed by GET /v2/assets.
 *
 * Both components degrade to a static sample when the API is unreachable, so
 * the marketing page never renders an empty hole.
 */

import { useEffect, useState } from "react";

import { SpotlightCard } from "@/components/tf/spotlight";
import { useV2Assets } from "@/hooks/useTagioV2";
import { friendlyError } from "@/lib/tagio-api";
import { cn } from "@/lib/utils";
import type { V2AssetType, V2TokenInfo } from "@/types/tagio-v2";

const ASSET_TYPE_LABEL: Record<V2AssetType, string> = {
  native: "Native",
  stablecoin: "Stablecoin",
  equity: "Equity",
  etf: "ETF",
  commodity: "Commodity",
};

const FALLBACK_SYMBOLS = [
  "SPYR",
  "USDG",
  "GLDR",
  "NVDAR",
  "AAPLR",
  "TSLAR",
  "ETH",
  "QQQR",
  "MSFTR",
  "AMZNR",
];

export function AssetMarquee({ className }: { className?: string }) {
  const { data } = useV2Assets("", true);
  const symbols = data?.assets?.length
    ? data.assets.map((asset) => asset.symbol)
    : (data?.featured?.map((asset) => asset.symbol) ?? FALLBACK_SYMBOLS);

  const list = symbols.length ? symbols : FALLBACK_SYMBOLS;
  // Duplicated once so the -50% keyframe loops seamlessly.
  const track = [...list, ...list];

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        "[mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]",
        className,
      )}
    >
      <div className="tf-marquee flex w-max items-center gap-3">
        {track.map((symbol, index) => (
          <span
            key={`${symbol}-${index}`}
            className="whitespace-nowrap rounded-full border border-ink/10 bg-card/70 px-4 py-2 font-mono text-sm font-semibold text-ink/60"
          >
            {symbol}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FeaturedAssets() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const { data, isLoading, isError, error, refetch } = useV2Assets(
    debounced,
    debounced.length === 0,
  );

  const assets: V2TokenInfo[] = (data?.assets?.length ? data.assets : (data?.featured ?? [])).slice(
    0,
    12,
  );

  return (
    <section id="assets" className="relative scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="tf-chip">Asset registry</span>
            <h2 className="mt-6 text-[clamp(2rem,4.5vw,3.2rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-ink">
              Elect anything verified on the chain.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink/55">
              Tokenized equities, ETFs, commodities and base currencies — searchable by ticker or
              company name.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-ink/12 bg-card/80 px-5 py-2.5 md:w-72">
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apple, SPY, gold…"
              aria-label="Search assets"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-ink/35"
            />
          </div>
        </header>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[104px] animate-pulse rounded-[calc(var(--radius)+8px)] border border-ink/8 bg-ink/4"
                />
              ))
            : assets.map((asset) => (
                <AssetCard key={asset.address ?? asset.symbol} asset={asset} />
              ))}
        </div>

        {!isLoading && assets.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <p className="max-w-md text-sm text-ink/50">
              {isError ? friendlyError(error) : `No assets matched “${debounced}”.`}
            </p>
            {isError ? (
              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/65 transition-colors hover:border-ink/30 hover:text-ink"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AssetCard({ asset }: { asset: V2TokenInfo }) {
  return (
    <SpotlightCard className="flex items-center gap-4 p-5">
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink/10 bg-cream-deep/70">
        {asset.iconUrl ? (
          <img src={asset.iconUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="font-mono text-xs font-bold text-ink/55">
            {asset.symbol.slice(0, 3)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-ink">{asset.symbol}</span>
          {asset.underlyingTicker ? (
            <span className="rounded-full bg-ink/6 px-2 py-0.5 font-mono text-[0.65rem] font-semibold text-ink/45">
              {asset.underlyingTicker}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-ink/55">{asset.name}</p>
      </div>

      <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-ink/35">
        {ASSET_TYPE_LABEL[asset.assetType] ?? asset.assetType}
      </span>
    </SpotlightCard>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink/35" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
