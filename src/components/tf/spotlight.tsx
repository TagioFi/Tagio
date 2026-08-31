/**
 * Pointer-reactive background primitives.
 *
 * Both components write CSS custom properties on a rAF loop instead of holding
 * pointer position in React state — moving the mouse never triggers a render,
 * so the effect stays smooth on a busy page. The gradients themselves live in
 * `src/styles.css` (.tf-spotlight / .tf-card).
 */

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A fixed lime glow that trails the cursor across the whole page, easing toward
 * the pointer rather than snapping to it.
 */
export function SpotlightBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    // Start centered so the first frame after fade-in isn't in a corner.
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      el.style.setProperty("--spot-opacity", "1");
    };
    const onLeave = () => el.style.setProperty("--spot-opacity", "0");

    const tick = () => {
      // Critically damped-ish follow: 0.12 reads as "weighty" without lag.
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <div ref={ref} className="tf-spotlight" aria-hidden="true" />;
}

/**
 * Card whose highlight tracks the pointer in its own local coordinates, so the
 * glow sits under the cursor and the border sheen lights up on the near edge.
 */
export function SpotlightCard({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      el.style.setProperty("--cx", `${pending.x}px`);
      el.style.setProperty("--cy", `${pending.y}px`);
      pending = null;
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pending = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (!frame) frame = window.requestAnimationFrame(flush);
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={cn("tf-card", className)} {...rest}>
      {children}
    </div>
  );
}

/** Slow-drifting blurred blobs. Purely decorative. */
export function Aurora({ className }: { className?: string }) {
  return (
    <div className={cn("tf-aurora", className)} aria-hidden="true">
      <div
        className="tf-aurora-blob"
        style={{
          left: "6%",
          top: "12%",
          width: "38vw",
          height: "38vw",
          background: "oklch(0.906 0.184 122 / 0.5)",
          animationDelay: "0s",
        }}
      />
      <div
        className="tf-aurora-blob"
        style={{
          right: "4%",
          top: "0%",
          width: "32vw",
          height: "32vw",
          background: "oklch(0.93 0.12 110 / 0.45)",
          animationDelay: "-7s",
          animationDuration: "27s",
        }}
      />
      <div
        className="tf-aurora-blob"
        style={{
          left: "38%",
          top: "38%",
          width: "26vw",
          height: "26vw",
          background: "oklch(0.88 0.09 96 / 0.4)",
          animationDelay: "-14s",
          animationDuration: "31s",
        }}
      />
    </div>
  );
}
