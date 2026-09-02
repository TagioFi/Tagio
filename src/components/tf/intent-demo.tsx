/**
 * Self-playing demo of the Groq intent parser.
 *
 * On load it loops through scripted posts: the text types itself into the input
 * while the right-hand panel thinks, then reveals the structured intent. The
 * scripted results keep the landing page from hammering /v2/bot/parse-intent on
 * a timer (and from looking broken when the API is unreachable).
 *
 * The moment a visitor touches the input, autoplay stops for good and the
 * "Parse intent" button hits the real endpoint with whatever they typed.
 */

import { useEffect, useRef, useState } from "react";

import { SpotlightCard } from "@/components/tf/spotlight";
import { useParseBotIntent } from "@/hooks/useTagioV2";
import { formatBps, friendlyError } from "@/lib/tagio-api";
import { cn } from "@/lib/utils";
import type { V2ParsedBotIntent } from "@/types/tagio-v2";

interface Demo {
  text: string;
  intent: V2ParsedBotIntent;
}

const DEMOS: Demo[] = [
  {
    text: "@TagioPayBot send @vlad 40 usdg",
    intent: {
      action: "send",
      target: "@vlad",
      targetType: "x_account",
      amount: 40,
      token: "USDG",
      memo: null,
      elections: null,
      confidence: 1,
    },
  },
  {
    text: "@TagioPayBot invoice @acme 250 usdg for milestone 1",
    intent: {
      action: "invoice",
      target: "@acme",
      targetType: "x_account",
      amount: 250,
      token: "USDG",
      memo: "milestone 1",
      elections: null,
      confidence: 0.96,
    },
  },
  {
    text: "@TagioPayBot buy 50 usdg of nvda",
    intent: {
      action: "swap",
      target: null,
      targetType: null,
      amount: 50,
      token: "USDG",
      fromToken: "USDG",
      toToken: "NVDA",
      memo: null,
      elections: null,
      confidence: 0.99,
    },
  },
  {
    text: "@TagioPayBot set my mix to 70 nvda 30 usdg",
    intent: {
      action: "election",
      target: null,
      targetType: null,
      amount: null,
      token: null,
      memo: null,
      elections: [
        { symbol: "NVDA", basisPoints: 7000 },
        { symbol: "USDG", basisPoints: 3000 },
      ],
      confidence: 0.98,
    },
  },
];

const TYPE_MS = 38;
const THINK_MS = 800;
const HOLD_MS = 3400;

type Phase = "typing" | "thinking" | "revealed";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function IntentDemo() {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(DEMOS[0]!.text);
  const [phase, setPhase] = useState<Phase>("typing");
  const [scripted, setScripted] = useState<V2ParsedBotIntent | null>(null);
  const [isAuto, setIsAuto] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parse = useParseBotIntent();

  // Autoplay: type the post, pause to "think", reveal, hold, advance.
  useEffect(() => {
    if (!isAuto) return;

    const demo = DEMOS[index]!;
    let cancelled = false;
    const timers: number[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    void (async () => {
      setScripted(null);
      setPhase("typing");

      if (prefersReducedMotion()) {
        setText(demo.text);
      } else {
        setText("");
        for (let i = 1; i <= demo.text.length; i += 1) {
          if (cancelled) return;
          setText(demo.text.slice(0, i));
          await sleep(TYPE_MS);
        }
      }

      if (cancelled) return;
      setPhase("thinking");
      await sleep(THINK_MS);

      if (cancelled) return;
      setScripted(demo.intent);
      setPhase("revealed");
      await sleep(HOLD_MS);

      if (cancelled) return;
      setIndex((current) => (current + 1) % DEMOS.length);
    })();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [index, isAuto]);

  /** Hands control to the visitor and focuses the real textarea. */
  const takeOver = () => {
    if (!isAuto) return;
    setIsAuto(false);
    setPhase("revealed");
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  };

  const submit = () => {
    setIsAuto(false);
    if (text.trim()) parse.mutate(text.trim());
  };

  // Live result wins once the visitor has parsed something themselves.
  const intent = isAuto ? scripted : (parse.data ?? null);
  const isThinking = isAuto ? phase === "thinking" : parse.isPending;

  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <header className="max-w-2xl">
          <span className="tf-chip">Natural language</span>
          <h2 className="mt-6 text-[clamp(2rem,4.5vw,3.2rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-ink">
            Pay by posting.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink/55">
            Mention the bot on X and it parses the request into a routed transaction. Edit the post
            to try it against the live parser.
          </p>
        </header>

        <div className="mt-12 grid items-start gap-4 lg:grid-cols-2">
          {/* ── Input ─────────────────────────────────────────────────── */}
          <SpotlightCard className="p-7">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
                Your post
              </span>
              {isAuto ? (
                <span className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-ink/35">
                  <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden="true" />
                  Demo
                </span>
              ) : null}
            </div>

            {isAuto ? (
              // Fake input during autoplay so we can render a blinking caret.
              <button
                type="button"
                onClick={takeOver}
                aria-label="Edit this post"
                className="mt-3 block min-h-[6.5rem] w-full cursor-text rounded-xl border border-ink/12 bg-cream/60 p-4 text-left font-mono text-sm leading-relaxed text-ink transition-colors hover:border-ink/25"
              >
                <span className="break-words">{text}</span>
                {phase === "typing" ? <span className="tf-caret" aria-hidden="true" /> : null}
              </button>
            ) : (
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={3}
                aria-label="Your post"
                className="mt-3 min-h-[6.5rem] w-full resize-none rounded-xl border border-ink/12 bg-cream/60 p-4 font-mono text-sm leading-relaxed text-ink outline-none transition-colors focus:border-lime-deep/60"
              />
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {DEMOS.map((demo, demoIndex) => (
                <button
                  key={demo.text}
                  type="button"
                  onClick={() => {
                    setIsAuto(false);
                    setText(demo.text);
                    parse.reset();
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    isAuto && demoIndex === index
                      ? "border-lime-deep/50 bg-lime/20 text-ink"
                      : "border-ink/10 text-ink/50 hover:border-ink/25 hover:text-ink",
                  )}
                >
                  {demo.text.replace("@TagioPayBot ", "")}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={parse.isPending || !text.trim()}
              className="mt-5 w-full rounded-full bg-ink py-3 text-sm font-bold text-cream transition-all duration-300 hover:bg-ink/85 disabled:opacity-50"
            >
              {parse.isPending ? "Parsing…" : "Parse intent"}
            </button>
          </SpotlightCard>

          {/* ── Output ────────────────────────────────────────────────── */}
          <SpotlightCard className="min-h-[22rem] p-7">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
              Parsed intent
            </span>

            {isThinking ? (
              <div className="mt-6 space-y-3" aria-live="polite">
                <p className="tf-shimmer text-sm text-ink/45">Parsing…</p>
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="tf-shimmer h-9 rounded-lg bg-ink/6"
                    style={{ animationDelay: `${row * 140}ms` }}
                  />
                ))}
              </div>
            ) : null}

            {!isThinking && parse.isError ? (
              <p className="mt-6 text-sm text-ink/55">{friendlyError(parse.error)}</p>
            ) : null}

            {!isThinking && !intent && !parse.isError ? (
              <p className="mt-6 text-sm text-ink/45">
                Send a post to see the structured action, target, amount and confidence the router
                acts on.
              </p>
            ) : null}

            {!isThinking && intent ? (
              <div key={intent.action + String(intent.target)} className="tf-rise mt-5 space-y-3">
                <Row label="Action" value={intent.action} accent />
                <Row label="Target" value={intent.target ?? "—"} />
                <Row
                  label="Amount"
                  value={
                    intent.amount !== null ? `${intent.amount} ${intent.token ?? ""}`.trim() : "—"
                  }
                />
                {intent.fromToken && intent.toToken ? (
                  <Row label="Pair" value={`${intent.fromToken} → ${intent.toToken}`} />
                ) : null}
                {intent.memo ? <Row label="Memo" value={intent.memo} /> : null}
                {intent.elections?.length ? (
                  <Row
                    label="Elections"
                    value={intent.elections
                      .map((election) => `${election.symbol} ${formatBps(election.basisPoints)}`)
                      .join(" · ")}
                  />
                ) : null}

                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink/45">
                    <span>Confidence</span>
                    <span className="tf-numeric">{Math.round(intent.confidence * 100)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/8">
                    <div
                      className="h-full rounded-full bg-lime-deep transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.max(0, Math.min(1, intent.confidence)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </SpotlightCard>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink/8 pb-2.5">
      <span className="text-xs font-bold uppercase tracking-[0.1em] text-ink/40">{label}</span>
      <span
        className={cn(
          "truncate font-mono text-sm font-semibold",
          accent ? "text-lime-deep" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
