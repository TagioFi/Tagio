/**
 * Settlement studio: claim a tag, edit its receive-mix, and mint pay-links.
 *
 * Everything here is owner-scoped — the connected wallet must own the tag —
 * and the whole page sits behind <AuthGate>: connect wallet → connect X →
 * dashboard, in that order, with no way past the X step.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

import { AllocationBar, legColor } from "@/components/tf/allocation-bar";
import { AuthGate, XMark } from "@/components/tf/auth-gate";
import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { useTagioAuth } from "@/hooks/useTagioAuth";
import {
  useCreateV2Invoice,
  useRegisterV2Handle,
  useUpdateV2Elections,
  useV2Assets,
  useV2Handle,
  useV2HandleAvailability,
  useV2HandlesByOwner,
  useV2InvoicesByOwner,
  useV2PendingTransactions,
} from "@/hooks/useTagioV2";
import { cleanHandle, formatBps, friendlyError, shortAddress } from "@/lib/tagio-api";
import { cn } from "@/lib/utils";
import type { V2ElectionInput, V2Invoice, V2PendingTransaction } from "@/types/tagio-v2";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Settlement studio · TagioFi" }] }),
  component: StudioPage,
});

const TOTAL_BPS = 10_000;

function StudioPage() {
  const auth = useTagioAuth();
  const { address, stage, xHandle } = auth;
  const isReady = stage === "ready";

  // Owner-scoped data is only fetched once both steps are done.
  const handlesQuery = useV2HandlesByOwner(isReady && address ? address : undefined);
  const pendingQuery = useV2PendingTransactions(isReady && address ? address : undefined);
  const invoicesQuery = useV2InvoicesByOwner(isReady && address ? address : undefined);

  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [dismissedPendingIds, setDismissedPendingIds] = useState<string[]>([]);
  const [xClaimDismissed, setXClaimDismissed] = useState(false);

  // Memoized handles list
  const handles = useMemo(() => handlesQuery.data ?? [], [handlesQuery.data]);

  useEffect(() => {
    if (!activeHandle && handles.length) setActiveHandle(handles[0]!.handle);
  }, [handles, activeHandle]);

  // Offer the verified X username as a tag
  const xTag = xHandle ? cleanHandle(xHandle).toLowerCase() : "";
  const showXClaim =
    isReady &&
    /^[a-z0-9_]{3,32}$/.test(xTag) &&
    !xClaimDismissed &&
    !handlesQuery.isLoading &&
    !handles.some((item) => item.handle.toLowerCase() === xTag);

  // Modal: Actionable pending transaction for this user
  const pendingTxs = (pendingQuery.data ?? []).filter(
    (tx: any) => tx.status === "pending" && !dismissedPendingIds.includes(tx.request_id)
  );
  const activePendingTx = pendingTxs.length > 0 ? pendingTxs[0] : null;

  const dismissPendingTx = (reqId: string) => {
    setDismissedPendingIds((prev) => [...prev, reqId]);
  };

  return (
    <PageShell>
      <SpotlightBackground />
      <section className="relative overflow-hidden px-6 pb-24 pt-36">
        <Aurora className="opacity-40" />

        <div className="relative z-10 mx-auto max-w-6xl">
          <header className="max-w-2xl">
            <span className="tf-chip">Settlement studio</span>
            <h1 className="mt-6 text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-ink">
              Tell the rail what you keep.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink/55">
              Your elections are stored against your tag in basis points and must total 100%. Change
              them any time — nothing is locked or custodied.
            </p>

            {isReady ? (
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-ink/12 bg-lime/25 px-3.5 py-1.5 font-mono text-[0.8rem] font-semibold text-ink">
                  <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden="true" />
                  {shortAddress(address)}
                </span>
                {xHandle ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-ink/12 bg-cream/70 px-3.5 py-1.5 text-[0.8rem] font-semibold text-ink">
                    <XMark className="size-3" />@{xHandle}
                  </span>
                ) : null}
                <Link
                  to="/trade"
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[0.8rem] font-bold text-cream transition-all hover:bg-ink/80 hover:shadow-md"
                >
                  Trade RWAs ↗
                </Link>
                <button
                  type="button"
                  onClick={auth.signOut}
                  className="rounded-full px-3 py-1.5 text-[0.8rem] font-semibold text-ink/45 transition-colors hover:text-ink"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </header>

          <AuthGate auth={auth}>
            {showXClaim ? (
              <ClaimXHandleCard
                candidate={xTag}
                ownerWallet={address!}
                onClaimed={(claimed) => {
                  setActiveHandle(claimed);
                  setXClaimDismissed(true);
                }}
                onDismiss={() => setXClaimDismissed(true)}
              />
            ) : null}

            <div
              className={cn("grid gap-6 lg:grid-cols-[300px_1fr]", showXClaim ? "mt-6" : "mt-12")}
            >
              <div className="flex flex-col gap-4">
                <SpotlightCard className="p-6">
                  <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
                    Your tags
                  </h2>

                  {handlesQuery.isLoading ? (
                    <p className="mt-4 text-sm text-ink/45">Loading…</p>
                  ) : null}

                  {handlesQuery.isError ? (
                    <div className="mt-4 rounded-xl border border-ink/10 bg-cream/60 p-4">
                      <p className="text-sm text-ink/60">{friendlyError(handlesQuery.error)}</p>
                      <button
                        type="button"
                        onClick={() => void handlesQuery.refetch()}
                        className="mt-3 rounded-full border border-ink/15 px-3.5 py-1.5 text-xs font-bold text-ink/65 transition-colors hover:border-ink/30 hover:text-ink"
                      >
                        Try again
                      </button>
                    </div>
                  ) : null}

                  {!handlesQuery.isLoading && !handlesQuery.isError && handles.length === 0 ? (
                    <p className="mt-4 text-sm text-ink/45">
                      No tags yet. Claim one to start receiving.
                    </p>
                  ) : null}

                  <ul className="mt-4 space-y-1.5">
                    {handles.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setActiveHandle(item.handle)}
                          className={cn(
                            "w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-colors",
                            activeHandle === item.handle
                              ? "bg-ink text-cream"
                              : "text-ink/60 hover:bg-ink/6 hover:text-ink",
                          )}
                        >
                          @{item.handle}
                        </button>
                      </li>
                    ))}
                  </ul>
                </SpotlightCard>

                <ClaimTagCard
                  ownerWallet={address!}
                  onClaimed={setActiveHandle}
                  defaultHandle={xTag}
                />

                <ActivitySection
                  pendingTxs={pendingQuery.data ?? []}
                  invoices={invoicesQuery.data ?? []}
                />
              </div>

              <div className="flex flex-col gap-4">
                {activeHandle ? (
                  <>
                    <ElectionEditor handle={activeHandle} ownerWallet={address!} />
                    <InvoiceCard handle={activeHandle} />
                  </>
                ) : (
                  <SpotlightCard className="flex items-center justify-center p-14">
                    <p className="text-sm text-ink/45">
                      Claim a tag to configure your receive-mix.
                    </p>
                  </SpotlightCard>
                )}
              </div>
            </div>
          </AuthGate>
        </div>
      </section>

      {/* Modal: Actionable Pending Transaction */}
      {activePendingTx ? (
        <PendingTxReviewModal
          tx={activePendingTx}
          onDismiss={() => dismissPendingTx(activePendingTx.request_id)}
        />
      ) : null}
    </PageShell>
  );
}

/* ── Modal: Pending Transaction Review & Sign ────────────────────────── */

function PendingTxReviewModal({
  tx,
  onDismiss,
}: {
  tx: any;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <SpotlightCard className="relative w-full max-w-md border-amber-500/40 p-8 shadow-2xl">
        <span className="tf-chip bg-amber-500/20 font-bold text-amber-900 dark:text-amber-300">
          Action Required
        </span>

        <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          Pending Transaction
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          You have an incoming payment waiting to settle into your elected mix on Robinhood Chain.
        </p>

        <div className="mt-5 space-y-2.5 rounded-xl border border-ink/10 bg-cream/70 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink/50">Amount:</span>
            <span className="font-mono font-bold text-ink">
              {tx.amount} {tx.token?.toUpperCase()}
            </span>
          </div>
          {tx.sender_handle || tx.requested_by_wallet ? (
            <div className="flex items-center justify-between">
              <span className="text-ink/50">Sender:</span>
              <span className="font-semibold text-ink">
                {tx.sender_handle ? `@${tx.sender_handle}` : shortAddress(tx.requested_by_wallet)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-ink/50">Target:</span>
            <span className="font-semibold text-ink">
              {tx.target_value ? `@${tx.target_value.replace(/^[@#]/, "")}` : tx.recipient_identifier || "Your Tag"}
            </span>
          </div>
          {tx.tweet_url ? (
            <div className="flex items-center justify-between">
              <span className="text-ink/50">Source:</span>
              <a
                href={tx.tweet_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-lime underline hover:text-lime/80"
              >
                View on Twitter/X ↗
              </a>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <a
            href={`/pay/${tx.request_id || tx.id}`}
            className="w-full rounded-full bg-ink py-3 text-center text-sm font-bold text-cream transition-colors hover:bg-ink/85"
          >
            Review & Settle Now
          </a>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-full border border-ink/15 py-2.5 text-xs font-semibold text-ink/60 transition-colors hover:border-ink/30 hover:text-ink"
          >
            Dismiss for now
          </button>
        </div>
      </SpotlightCard>
    </div>
  );
}

/* ── Banner: Claim verified X handle ────────────────────────────────────── */

function ClaimXHandleCard({
  candidate,
  ownerWallet,
  onClaimed,
  onDismiss,
}: {
  candidate: string;
  ownerWallet: string;
  onClaimed: (handle: string) => void;
  onDismiss: () => void;
}) {
  const availability = useV2HandleAvailability(candidate);
  const register = useRegisterV2Handle();

  const taken = availability.data?.available === false;
  const free = availability.data?.available === true;

  const claim = async () => {
    try {
      const created = await register.mutateAsync({
        handle: candidate,
        ownerWallet,
        displayName: candidate,
      });
      onClaimed(created.handle);
      toast.success(`@${created.handle} is yours`, {
        description: "Set a receive-mix so payments land in what you keep.",
      });
    } catch (err) {
      toast.error("Couldn't claim that tag", { description: friendlyError(err) });
    }
  };

  return (
    <SpotlightCard className="mt-12 p-8 border-lime/40">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
        <div className="min-w-64 flex-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
            <XMark className="size-3" />X connected
          </div>

          <h2 className="mt-3 text-xl font-extrabold tracking-[-0.03em] text-ink">
            {taken ? (
              <>@{candidate} is already claimed</>
            ) : (
              <>
                Claim <span className="text-lime-deep">@{candidate}</span> as your tag
              </>
            )}
          </h2>

          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink/55">
            {availability.isLoading ? (
              "Checking whether that tag is still free…"
            ) : availability.isError ? (
              friendlyError(availability.error)
            ) : taken ? (
              <>
                Another wallet registered it first. Claim a different tag below — your X account
                stays linked either way.
              </>
            ) : (
              <>
                It matches your verified X username, so anyone who can mention you can pay you.
                Nothing is custodied, and you can set the receive-mix straight after.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {free ? (
            <button
              type="button"
              onClick={() => void claim()}
              disabled={register.isPending}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-cream transition-colors hover:bg-ink/85 disabled:opacity-45"
            >
              {register.isPending ? "Claiming…" : `Claim @${candidate}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/65 transition-colors hover:border-ink/30 hover:text-ink"
          >
            {taken ? "Dismiss" : "Not now"}
          </button>
        </div>
      </div>
    </SpotlightCard>
  );
}

/* ── Activity & Invoices List ───────────────────────────────────────────── */

function ActivitySection({
  pendingTxs,
  invoices,
}: {
  pendingTxs: any[];
  invoices: V2Invoice[];
}) {
  const [tab, setTab] = useState<"pending" | "invoices">("pending");

  return (
    <SpotlightCard className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
          Activity
        </h2>
        <div className="flex gap-1 rounded-lg bg-cream/70 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab("pending")}
            className={cn(
              "rounded-md px-2.5 py-1 transition-colors",
              tab === "pending" ? "bg-ink text-cream" : "text-ink/60 hover:text-ink"
            )}
          >
            Pending ({pendingTxs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("invoices")}
            className={cn(
              "rounded-md px-2.5 py-1 transition-colors",
              tab === "invoices" ? "bg-ink text-cream" : "text-ink/60 hover:text-ink"
            )}
          >
            Invoices ({invoices.length})
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {tab === "pending" ? (
          pendingTxs.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink/40">No pending transactions.</p>
          ) : (
            pendingTxs.map((tx: any) => (
              <a
                key={tx.id || tx.request_id}
                href={`/pay/${tx.request_id || tx.id}`}
                className="flex items-center justify-between rounded-xl border border-ink/8 bg-cream/40 px-3.5 py-2.5 text-xs transition-colors hover:bg-cream/80"
              >
                <div>
                  <p className="font-bold text-ink">
                    {tx.amount} {tx.token?.toUpperCase()}
                  </p>
                  <p className="text-ink/50">
                    {tx.target_value
                      ? `To @${tx.target_value.replace(/^[@#]/, "")}`
                      : tx.sender_handle
                        ? `From @${tx.sender_handle}`
                        : "Pending Payment"}
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-900 dark:text-amber-300 capitalize">
                  {tx.status}
                </span>
              </a>
            ))
          )
        ) : invoices.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink/40">No invoices created yet.</p>
        ) : (
          invoices.map((inv) => (
            <div
              key={inv.id || inv.invoice_id}
              className="flex items-center justify-between rounded-xl border border-ink/8 bg-cream/40 px-3.5 py-2.5 text-xs"
            >
              <div>
                <p className="font-bold text-ink">
                  {inv.target_amount} {inv.target_token_symbol}
                </p>
                <p className="text-ink/50 truncate max-w-[120px]">
                  {inv.memo || `@${inv.recipient_handle}`}
                </p>
              </div>
              <a
                href={`/pay/${inv.invoice_id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-ink/15 px-2.5 py-1 font-semibold text-ink/70 hover:border-ink/30 hover:text-ink"
              >
                Open
              </a>
            </div>
          ))
        )}
      </div>
    </SpotlightCard>
  );
}

/* ── Claim Tag Card ─────────────────────────────────────────────────────── */

function ClaimTagCard({
  ownerWallet,
  onClaimed,
  defaultHandle = "",
}: {
  ownerWallet: string;
  onClaimed: (handle: string) => void;
  defaultHandle?: string;
}) {
  const register = useRegisterV2Handle();
  const [handle, setHandle] = useState(defaultHandle);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (defaultHandle && !handle) setHandle(defaultHandle);
  }, [defaultHandle]);

  const submit = async () => {
    const clean = cleanHandle(handle);
    if (clean.length < 2) return;
    try {
      const created = await register.mutateAsync({
        handle: clean,
        ownerWallet,
        ...(displayName ? { displayName } : {}),
      });
      onClaimed(created.handle);
      setHandle("");
      setDisplayName("");
      toast.success(`@${created.handle} is yours`, {
        description: "Set a receive-mix so payments land in what you keep.",
      });
    } catch (err) {
      toast.error("Couldn't claim that tag", { description: friendlyError(err) });
    }
  };

  return (
    <SpotlightCard className="p-6">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">Claim a tag</h2>

      <div className="mt-4 flex items-center gap-1.5 rounded-xl border border-ink/12 bg-cream/60 px-3.5 py-2.5">
        <span className="text-sm font-bold text-ink/35">@</span>
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          placeholder="yourtag"
          aria-label="New tag"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink/30"
        />
      </div>

      <input
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="Display name (optional)"
        aria-label="Display name"
        className="mt-2 w-full rounded-xl border border-ink/12 bg-cream/60 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink/30"
      />

      <button
        type="button"
        onClick={submit}
        disabled={register.isPending || cleanHandle(handle).length < 2}
        className="mt-4 w-full rounded-full bg-ink py-2.5 text-sm font-bold text-cream transition-colors hover:bg-ink/85 disabled:opacity-45"
      >
        {register.isPending ? "Claiming…" : "Claim tag"}
      </button>

      {register.isError ? (
        <p className="mt-3 text-sm text-destructive">{friendlyError(register.error)}</p>
      ) : null}
    </SpotlightCard>
  );
}

/* ── Election Editor ────────────────────────────────────────────────────── */

function ElectionEditor({
  handle,
  ownerWallet,
}: {
  handle: string;
  ownerWallet: string;
}) {
  const detail = useV2Handle(handle);
  const assetsQuery = useV2Assets();
  const update = useUpdateV2Elections();

  const [rows, setRows] = useState<V2ElectionInput[]>([]);
  const [dirty, setDirty] = useState(false);

  // Sync state when detail query loads/changes.
  useEffect(() => {
    if (detail.data?.elections) {
      setRows(
        detail.data.elections.map((item) => ({
          symbol: item.symbol,
          basisPoints: item.basisPoints,
        })),
      );
      setDirty(false);
    }
  }, [detail.data]);

  const options = assetsQuery.data?.assets ?? [];
  const total = rows.reduce((sum, item) => sum + item.basisPoints, 0);
  const balanced = total === TOTAL_BPS;

  const setRow = (index: number, patch: Partial<V2ElectionInput>) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, ...patch };
      return next;
    });
    setDirty(true);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
    setDirty(true);
  };

  const addRow = () => {
    const existing = new Set(rows.map((row) => row.symbol));
    const nextAsset = options.find((asset) => !existing.has(asset.symbol)) ?? options[0];
    if (!nextAsset) return;
    const remaining = Math.max(0, TOTAL_BPS - total);
    setRows((prev) => [...prev, { symbol: nextAsset.symbol, basisPoints: remaining }]);
    setDirty(true);
  };

  const balance = () => {
    if (rows.length === 0) return;
    const share = Math.floor(TOTAL_BPS / rows.length);
    const remainder = TOTAL_BPS - share * rows.length;
    setRows(
      rows.map((row, idx) => ({
        symbol: row.symbol,
        basisPoints: share + (idx === 0 ? remainder : 0),
      })),
    );
    setDirty(true);
  };

  const save = async () => {
    if (!balanced) return;
    try {
      await update.mutateAsync({ handle, ownerWallet, elections: rows });
      setDirty(false);
      toast.success("Mix updated", {
        description: `Inbound payments to @${handle} now route to this allocation.`,
      });
    } catch (err) {
      toast.error("Couldn't save mix", { description: friendlyError(err) });
    }
  };

  return (
    <SpotlightCard className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="tf-chip">Receive-mix</span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink">@{handle}</h2>
          <p className="mt-1 text-sm text-ink/55">
            Payments to @{handle} settle into this asset basket in a single transaction.
          </p>
        </div>

        <span
          className={cn(
            "tf-numeric rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors",
            balanced ? "bg-lime/40 text-ink" : "bg-destructive/10 text-destructive",
          )}
        >
          {(total / 100).toFixed(2)}%
        </span>
      </div>

      {rows.length ? <AllocationBar legs={rows} className="mt-6" /> : null}

      <div className="mt-6 space-y-2">
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/8 bg-cream/40 px-4 py-3"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: legColor(index) }}
              aria-hidden="true"
            />

            <select
              value={row.symbol}
              onChange={(event) => setRow(index, { symbol: event.target.value })}
              aria-label="Asset"
              className="min-w-28 rounded-lg border border-ink/12 bg-card px-2.5 py-1.5 font-mono text-sm font-semibold text-ink outline-none"
            >
              {!options.some((asset) => asset.symbol === row.symbol) ? (
                <option value={row.symbol}>{row.symbol}</option>
              ) : null}
              {options.map((asset) => (
                <option key={asset.symbol} value={asset.symbol}>
                  {asset.symbol}
                </option>
              ))}
            </select>

            <input
              type="range"
              min={0}
              max={TOTAL_BPS}
              step={100}
              value={row.basisPoints}
              onChange={(event) => setRow(index, { basisPoints: Number(event.target.value) })}
              aria-label={`${row.symbol} allocation`}
              className="h-1.5 min-w-32 flex-1 cursor-pointer appearance-none rounded-full bg-ink/10 accent-lime-deep"
            />

            <span className="tf-numeric w-16 shrink-0 text-right text-sm font-bold text-ink">
              {formatBps(row.basisPoints)}
            </span>

            <button
              type="button"
              onClick={() => removeRow(index)}
              aria-label={`Remove ${row.symbol}`}
              className="shrink-0 rounded-full p-1.5 text-ink/35 transition-colors hover:bg-ink/6 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink/15 p-6 text-center text-sm text-ink/40">
            No elections yet — payments land in whatever token the sender used.
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/65 transition-colors hover:border-ink/30 hover:text-ink"
        >
          Add asset
        </button>
        {!balanced && rows.length ? (
          <button
            type="button"
            onClick={balance}
            className="rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/65 transition-colors hover:border-ink/30 hover:text-ink"
          >
            Balance to 100%
          </button>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={!balanced || !dirty || update.isPending}
          className="ml-auto rounded-full bg-ink px-6 py-2 text-sm font-bold text-cream transition-colors hover:bg-ink/85 disabled:opacity-45"
        >
          {update.isPending ? "Saving…" : "Save mix"}
        </button>
      </div>

      {!balanced && rows.length ? (
        <p className="mt-3 text-xs text-ink/45">
          Elections must total exactly 100% ({TOTAL_BPS.toLocaleString()} bps) before they can be
          saved.
        </p>
      ) : null}

      {update.isError ? (
        <p className="mt-3 text-sm text-destructive">{friendlyError(update.error)}</p>
      ) : null}
    </SpotlightCard>
  );
}

/* ── Invoices ───────────────────────────────────────────────────────────── */

function InvoiceCard({ handle }: { handle: string }) {
  const create = useCreateV2Invoice();
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("USDG");
  const [memo, setMemo] = useState("");
  const [copied, setCopied] = useState(false);

  const invoice = create.data;
  const link =
    invoice && typeof window !== "undefined"
      ? `${window.location.origin}/pay/${invoice.invoice_id}`
      : null;

  const submit = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    create.mutate(
      {
        recipientHandle: handle,
        targetAmount: value,
        targetTokenSymbol: token,
        ...(memo ? { memo } : {}),
      },
      {
        onSuccess: () =>
          toast.success("Pay-link ready", { description: "Copy it and send it on." }),
        onError: (err) =>
          toast.error("Couldn't create that pay-link", { description: friendlyError(err) }),
      },
    );
  };

  const copy = () => {
    if (!link) return;
    void navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <SpotlightCard className="p-8">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">Request payment</h2>
      <p className="mt-2 text-sm text-ink/55">
        Mint a pay-link. Whoever opens it settles into your current receive-mix.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Invoice amount"
          className="tf-numeric min-w-28 flex-1 rounded-xl border border-ink/12 bg-cream/60 px-4 py-2.5 text-sm font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink/30"
        />
        <select
          value={token}
          onChange={(event) => setToken(event.target.value)}
          aria-label="Invoice token"
          className="rounded-xl border border-ink/12 bg-card px-3 py-2.5 font-mono text-sm font-semibold text-ink outline-none"
        >
          <option value="USDG">USDG</option>
          <option value="ETH">ETH</option>
        </select>
      </div>

      <input
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="Memo (optional)"
        aria-label="Invoice memo"
        className="mt-2 w-full rounded-xl border border-ink/12 bg-cream/60 px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink/30"
      />

      <button
        type="button"
        onClick={submit}
        disabled={create.isPending || !amount}
        className="mt-3 w-full rounded-full bg-ink py-2.5 text-sm font-bold text-cream transition-colors hover:bg-ink/85 disabled:opacity-45"
      >
        {create.isPending ? "Creating…" : "Create pay-link"}
      </button>

      {create.isError ? (
        <p className="mt-3 text-sm text-destructive">{friendlyError(create.error)}</p>
      ) : null}

      {link ? (
        <button
          type="button"
          onClick={copy}
          className="tf-rise mt-4 flex w-full items-center gap-3 rounded-xl border border-ink/12 bg-lime/15 px-4 py-3 text-left transition-colors hover:bg-lime/25"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink/70">{link}</span>
          <span className="shrink-0 text-xs font-bold text-ink">{copied ? "Copied" : "Copy"}</span>
        </button>
      ) : null}
    </SpotlightCard>
  );
}
