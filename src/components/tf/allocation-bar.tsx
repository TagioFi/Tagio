/**
 * Stacked basis-point allocation bar — the visual signature of a receive-mix
 * (e.g. 60 / 30 / 10). Used in the hero, the pay page and the studio.
 */

import { formatBps } from "@/lib/tagio-api";
import { cn } from "@/lib/utils";

/** Lime-to-ink ramp: the first (largest) leg reads brightest. */
export const LEG_COLORS = [
  "oklch(0.906 0.184 122)",
  "oklch(0.822 0.176 124)",
  "oklch(0.68 0.13 128)",
  "oklch(0.52 0.08 140)",
  "oklch(0.38 0.04 200)",
  "oklch(0.28 0.02 260)",
] as const;

export function legColor(index: number): string {
  return LEG_COLORS[index % LEG_COLORS.length] ?? LEG_COLORS[0];
}

export interface AllocationLeg {
  symbol: string;
  basisPoints: number;
}

export function AllocationBar({
  legs,
  className,
  height = "h-3",
}: {
  legs: AllocationLeg[];
  className?: string;
  height?: string;
}) {
  const total = legs.reduce((sum, leg) => sum + leg.basisPoints, 0) || 10_000;

  return (
    <div className={cn("flex w-full overflow-hidden rounded-full bg-ink/8", height, className)}>
      {legs.map((leg, index) => (
        <div
          key={`${leg.symbol}-${index}`}
          className="h-full transition-[width] duration-500 ease-out"
          style={{
            width: `${(leg.basisPoints / total) * 100}%`,
            background: legColor(index),
          }}
          title={`${leg.symbol} · ${formatBps(leg.basisPoints)}`}
        />
      ))}
    </div>
  );
}

export function AllocationLegend({
  legs,
  className,
}: {
  legs: AllocationLeg[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      {legs.map((leg, index) => (
        <li key={`${leg.symbol}-${index}`} className="flex items-center gap-2 text-sm">
          <span
            className="size-2.5 rounded-full"
            style={{ background: legColor(index) }}
            aria-hidden="true"
          />
          <span className="font-semibold text-ink">{leg.symbol}</span>
          <span className="tf-numeric text-ink/50">{formatBps(leg.basisPoints)}</span>
        </li>
      ))}
    </ul>
  );
}
