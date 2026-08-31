/**
 * Tag lookup field. Debounces input, resolves the handle against
 * GET /v2/handles/:handle, and previews the receive-mix inline before the
 * visitor commits to the pay flow.
 */

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AllocationBar, AllocationLegend } from "@/components/tf/allocation-bar";
import { useV2Handle } from "@/hooks/useTagioV2";
import { cleanHandle } from "@/lib/tagio-api";
import { cn } from "@/lib/utils";

export function TagResolver({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), 350);
    return () => window.clearTimeout(id);
  }, [value]);

  const handle = cleanHandle(debounced);
  const { data, isFetching, isError } = useV2Handle(handle.length >= 2 ? handle : undefined);

  const legs = (data?.elections ?? [])
    .filter((election) => election.isActive)
    .map((election) => ({ symbol: election.symbol, basisPoints: election.basisPoints }));

  const go = () => {
    const target = cleanHandle(value);
    if (target.length >= 2) navigate({ to: "/pay/$target", params: { target } });
  };

  return (
    <div className={cn("w-full max-w-xl", className)}>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-full border border-ink/12 bg-card/80 p-1.5 pl-5",
          "shadow-[0_16px_40px_-30px] shadow-ink/50 backdrop-blur-sm transition-all duration-300",
          "focus-within:border-lime-deep/60 focus-within:shadow-[0_18px_44px_-24px] focus-within:shadow-lime-deep/40",
        )}
      >
        <span className="select-none text-lg font-bold text-ink/35">@</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") go();
          }}
          placeholder="find a tag — try alex"
          aria-label="Find a TagioFi tag"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink/35"
        />
        <button
          type="button"
          onClick={go}
          className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-cream transition-all duration-300 hover:bg-ink/85"
        >
          Pay
        </button>
      </div>

      {/* Reserve space so the hero doesn't jump as results resolve. */}
      <div className="mt-3 min-h-[3.25rem] px-1">
        {handle.length >= 2 && isFetching ? (
          <p className="text-sm text-ink/45">Resolving @{handle}…</p>
        ) : null}

        {handle.length >= 2 && !isFetching && isError ? (
          <p className="text-sm text-ink/45">
            <span className="font-semibold text-ink/70">@{handle}</span> isn&apos;t claimed yet.
          </p>
        ) : null}

        {data && legs.length > 0 ? (
          <div className="tf-rise">
            <p className="text-sm text-ink/55">
              <span className="font-bold text-ink">@{data.handle}</span> receives
            </p>
            <AllocationBar legs={legs} className="mt-2" height="h-2" />
            <AllocationLegend legs={legs} className="mt-2" />
          </div>
        ) : null}

        {data && legs.length === 0 ? (
          <p className="text-sm text-ink/45">
            <span className="font-bold text-ink">@{data.handle}</span> has no receive-mix set — pays
            land as sent.
          </p>
        ) : null}
      </div>
    </div>
  );
}
