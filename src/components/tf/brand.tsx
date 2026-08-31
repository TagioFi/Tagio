/**
 * TagioFi brand mark — the abstract figure: a dot over two opposed arcs.
 * Drawn as inline SVG so it inherits currentColor and stays crisp at any size.
 */

import { cn } from "@/lib/utils";

export function TagioMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("h-7 w-7", className)}
      fill="none"
      role="img"
      aria-label="TagioFi"
    >
      <circle cx="256" cy="110" r="52" fill="currentColor" />
      {/* Upper arc opens downward, lower arc opens upward — the "x" figure. */}
      <path
        d="M118 132 Q256 300 394 132"
        stroke="currentColor"
        strokeWidth="58"
        strokeLinecap="square"
        fill="none"
      />
      <path
        d="M112 372 Q256 232 400 372"
        stroke="currentColor"
        strokeWidth="58"
        strokeLinecap="square"
        fill="none"
      />
      <path
        d="M176 424 Q256 344 336 424"
        stroke="currentColor"
        strokeWidth="58"
        strokeLinecap="square"
        fill="none"
      />
    </svg>
  );
}

export function TagioWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <TagioMark className="h-6 w-6" />
      <span className="text-[1.05rem] font-extrabold tracking-[-0.03em]">TagioFi</span>
    </span>
  );
}
