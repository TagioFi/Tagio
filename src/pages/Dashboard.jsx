import { useState, useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { getAccount } from 'wagmi/actions'
import { formatUnits } from 'viem'
import { checkHashtag, getHashtag, getHashtagsByOwner, resolveHashtag, getHashtagTransactions, getPendingTransactions, broadcastPendingTransaction, cancelPendingTransaction, getSwapTokens, getCauses, getCauseLeaderboard, getEscrows, getPrivateSends, createPrivateSend, claimPrivateSend, getWalletIdentity, isSessionExpiredError, SESSION_EXPIRED_MESSAGE } from '../lib/tagio'
import { registerOnchain, renewOnchain, updatePayoutsOnchain, updateMetadataOnchain, signAndConfirmSwapPlan, signAndConfirmSteps, createCauseOnchain, donateToCauseOnchain, withdrawFromCauseOnchain, createEscrowOnchain, acceptEscrowOnchain, cancelEscrowOnchain, deliverEscrowOnchain, releaseEscrowOnchain, forceReleaseEscrowOnchain, refundEscrowOnchain, friendlyError } from '../lib/resolver-actions'
import { wagmiConfig } from '../lib/wagmi'
import { WalletControl } from '../components/WalletControl'
import { signInWithSolana, getAuthToken, getLiveAuthToken, clearAuthToken, getCachedXHandle } from '../lib/auth'
import { useSolanaBalances } from '../lib/solana-assets'
import { UniversalSend } from '../components/dashboard/UniversalSend'
import { XStocks } from '../components/dashboard/XStocks'
import { Recovery } from '../components/dashboard/Recovery'
import { Airdrops } from '../components/dashboard/Airdrops'
// Solana-aware icon: falls back to the xStocks directory's remote iconUrl for
// equities, which the local EVM-symbol TokenIcon below has no entry for.
import { TokenIcon as SolanaTokenIcon } from '../components/dashboard/shared'
import { generateRecoveryPhrase } from '../lib/recovery'

// Served straight from /public -- no bundler import needed. COIN has no
// icon yet; callers fall back to the plain "#" glyph for it.
const TOKEN_ICONS = {
  ETH: '/eth.png',
  USDG: '/usdg.png',
  AAPL: '/apple.png',
  TSLA: '/tesla.png',
  NVDA: '/nvidia.png',
  GOOGL: '/google.png',
  AMZN: '/amazon.png',
  MSFT: '/microsoft.png',
  META: '/meta.jpg',
  SPCX: '/spacex.png',
}
function TokenIcon({ symbol, size = '1.2rem' }) {
  const src = TOKEN_ICONS[symbol]
  if (!src) return <span className="hash" style={{ width: size, height: size, fontSize: `calc(${size} * 0.7)` }}>#</span>
  return <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
}

/* ---------- icons ---------- */
const I = {
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
  hash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>,
  split: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
  act: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  chevron: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>,
  up: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>,
  wallet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M16 12h4" /></svg>,
  bolt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></svg>,
  menu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
  trade: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z" /><polyline points="9 12 11 14 15 10" /></svg>,
  lock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  terminal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 6 10 12 4 18" /><line x1="12" y1="18" x2="20" y2="18" /></svg>,
  key: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L21 2" /><path d="M17 6l3 3" /><path d="M14 9l3 3" /></svg>,
}

/* ---------- helpers ---------- */
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '')
const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const NAME_RE = /^[a-z0-9_]{3,32}$/
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/
const DAY_MS = 86400000
const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS))
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const fmtNative = (wei) => { const n = Number(wei) / 1e18; return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 6 }) : String(wei) }
const ethOf = (tx) => (tx.is_native ? Number(tx.amount) / 1e18 : 0)

/* The backend has no "hashtags by owner" endpoint and the NFT isn't enumerable,
 * so we track the handles this browser registered (or manually imported) in
 * localStorage, then hydrate each one from the backend and keep only those the
 * connected wallet actually owns. */
const trackKey = (addr) => 'tagio.handles.' + addr.toLowerCase()
const loadTracked = (addr) => { try { return JSON.parse(localStorage.getItem(trackKey(addr)) || '[]') } catch { return [] } }
const addTracked = (addr, name) => { const list = loadTracked(addr); if (!list.includes(name)) { list.push(name); localStorage.setItem(trackKey(addr), JSON.stringify(list)) } }

// Spec Module 3's social set. `bio` rides along as a social link because
// HashtagResolver has no dedicated bio field -- SocialLink is an arbitrary
// key/value pair, and the backend already indexes it into social_links. Six
// keys stays inside the contract's MAX_SOCIALS of 8.
const SOCIAL_KEYS = [
  ['x', 'X'],
  ['telegram', 'Telegram'],
  ['discord', 'Discord'],
  ['github', 'GitHub'],
  ['email', 'Email'],
]
const BIO_KEY = 'bio'
// Contract limits, mirrored so the UI blocks a revert instead of causing one.
const MAX_SOCIAL_VAL = 128
const MAX_NAME_LEN = 64
const MAX_URL_LEN = 256
const MAX_PAYOUTS = 10

const emptySocials = () => Object.fromEntries([...SOCIAL_KEYS.map(([k]) => [k, '']), [BIO_KEY, '']])
const socialsToObj = (list) => {
  const o = emptySocials()
  for (const s of list || []) {
    const k = s.key === 'twitter' ? 'x' : s.key
    if (k in o) o[k] = s.value
  }
  return o
}

const toHandle = (r) => {
  const left = daysLeft(r.expires_at)
  return {
    name: r.hashtag,
    record: r,
    primary: r.payouts?.[0]?.wallet || r.owner_wallet,
    splits: (r.payouts || []).map((p, i) => ({ id: i + 1, wallet: p.wallet, pct: p.percentage_bps / 100 })),
    expiresDays: left,
    leasePct: Math.min(100, Math.round((left / 30) * 100)),
    socials: socialsToObj(r.socials),
    volumeUsd: Number(r.total_volume_usd) || 0,
  }
}

/* ---------- small components ---------- */
function Stat({ icon, label, value, unit, sub }) {
  return (
    <div className="card stat">
      <div className="lab"><span className="i">{icon}</span>{label}</div>
      <div className="val">{value}{unit && <small> {unit}</small>}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}
function AreaChart({ data }) {
  const w = 600, h = 140, pad = 6
  const max = Math.max(...data), min = Math.min(...data)
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((d - min) / (max - min || 1)) * (h - pad * 2)
    return [x, y]
  })
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const area = line + ` L ${w - pad} ${h} L ${pad} ${h} Z`
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8fbf1f" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8fbf1f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ag)" />
        <path d={line} fill="none" stroke="#8fbf1f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.slice(-1).map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="#c8e860" />)}
      </svg>
    </div>
  )
}
function HandleCard({ h, onManage, onRenew, renewing }) {
  return (
    <div className="card handle-card">
      <div className="top">
        <span className="name"><span className="hash">#</span>{h.name}</span>
        <span className={'pill ' + (h.expiresDays < 7 ? 'warn' : 'ok')}>{h.expiresDays < 7 ? 'Renew soon' : 'Active'}</span>
      </div>
      <div className="meta">
        <div className="row"><span>Primary</span><span className="addr-mono">{short(h.primary)}</span></div>
        <div className="row"><span>Volume</span><span>${fmt(h.volumeUsd)}</span></div>
        <div className="row"><span>Splits</span><span>{h.splits.length} recipient{h.splits.length > 1 ? 's' : ''}</span></div>
      </div>
      <div>
        <div className="row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--ink-faint)', marginBottom: '0.35rem' }}>
          <span>Subscription</span><span>{h.expiresDays} day{h.expiresDays === 1 ? '' : 's'} left</span>
        </div>
        <div className="lease-bar"><span style={{ width: h.leasePct + '%' }}></span></div>
      </div>
      <div className="actions">
        <button className="btn sm" onClick={onManage}>Manage</button>
        <button className="btn ghost sm" onClick={onRenew} disabled={renewing}>{renewing ? 'Confirm in wallet…' : 'Renew'}</button>
      </div>
    </div>
  )
}
function ConnectPrompt() {
  return (
    <div className="card pad-lg fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
      <div className="eyebrow">Wallet</div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 500 }}>Connect a wallet to see your handles</h2>
      <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>Your handles, payouts, and activity are read live from Robinhood Chain and the TagioPay indexer.</p>
      <WalletControl />
    </div>
  )
}
function Overview({ handles, activity, loading, go, manage, renew, renewing, escrowCount, causeCount }) {
  const now = Date.now()
  const recent = activity.filter((tx) => now - new Date(tx.timestamp).getTime() < 30 * DAY_MS)
  const totalIn30d = recent.reduce((s, tx) => s + ethOf(tx), 0)
  const recips = handles.reduce((s, h) => s + h.splits.length, 0)
  const volume = handles.reduce((s, h) => s + h.volumeUsd, 0)
  const expiringSoon = handles.filter((h) => h.expiresDays < 7).length
  const chartData = Array.from({ length: 14 }, (_, i) => {
    const dayStart = now - (13 - i) * DAY_MS
    return activity.reduce((s, tx) => {
      const t = new Date(tx.timestamp).getTime()
      return t >= dayStart - DAY_MS && t < dayStart ? s + ethOf(tx) : s
    }, 0)
  })
  return (
    <div className="fade-in">
      <div className="grid stats">
        <Stat icon={I.down} label="Received (30d)" value={fmt(totalIn30d)} unit="ETH" sub={recent.length + ' payment' + (recent.length === 1 ? '' : 's') + ' indexed'} />
        <Stat icon={I.hash} label="Handles owned" value={handles.length} sub={loading ? 'Loading…' : expiringSoon > 0 ? `${expiringSoon} renewing soon` : 'All resolving'} />
        <Stat icon={I.split} label="Split recipients" value={recips} sub="Across all handles" />
        <Stat icon={I.bolt} label="Total volume" value={'$' + fmt(volume)} sub="Lifetime, all handles" />
        <Stat icon={I.shield} label="Active escrows" value={escrowCount ?? '—'} sub="Awaiting delivery or release" />
        <Stat icon={I.heart} label="Open causes" value={causeCount ?? '—'} sub="Accepting donations" />
      </div>
      <div className="grid two" style={{ marginTop: '1rem' }}>
        <div className="card pad-lg">
          <div className="section-title"><div><div className="eyebrow">Inflows</div><h2>Received over time</h2></div><span className="pill ok"><span className="dot"></span>Live</span></div>
          <AreaChart data={chartData} />
        </div>
        <div className="card pad-lg">
          <div className="section-title"><h2>Recent activity</h2><button className="btn ghost sm" onClick={() => go('activity')}>View all</button></div>
          {activity.length === 0 && <p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No payments indexed for your handles yet.</p>}
          {activity.slice(0, 4).map((tx) => (
            <div key={tx.signature} className="route-line">
              <div className="who"><b>#{tx.hashtag}</b><span className="addr-mono">{short(tx.signature)}</span></div>
              <div className="amt" style={{ color: 'var(--green-deep)' }}>+{tx.is_native ? fmtNative(tx.amount) + ' ETH' : tx.amount + ' ' + short(tx.token)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card pad-lg" style={{ marginTop: '1rem' }}>
        <div className="section-title"><h2>Your handles</h2><button className="btn ghost sm" onClick={() => go('handles')}>Manage</button></div>
        {handles.length === 0 && <p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>{loading ? 'Loading your handles…' : 'No handles yet — claim one below or import one you already own.'}</p>}
        <div className="grid handles">{handles.map((h) => <HandleCard key={h.name} h={h} onManage={() => manage(h.name)} onRenew={() => renew(h.name)} renewing={renewing === h.name} />)}</div>
      </div>
    </div>
  )
}
function Claim({ toast, onRegistered }) {
  const [q, setQ] = useState('')
  const [state, setState] = useState('idle')
  const [reg, setReg] = useState({ status: 'idle' })
  const norm = q.toLowerCase().trim().replace(/^[#@]+/, '')
  useEffect(() => {
    setReg((r) => (r.status === 'busy' ? r : { status: 'idle' }))
    if (norm.length === 0) { setState('idle'); return }
    if (!NAME_RE.test(norm)) { setState('invalid'); return }
    setState('checking')
    let live = true
    const t = setTimeout(() => {
      checkHashtag({ data: norm })
        .then((r) => { if (live) setState(r.available ? 'available' : 'taken') })
        .catch(() => { if (live) setState('error') })
    }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [norm])
  // Spec Module 3 step 2: a recovery phrase is generated before the handle is
  // minted, because only its keccak256 hash can be written -- and it's written
  // as part of registerHashtag itself, so there's no second chance to add one
  // to a handle registered without it.
  const [phrase, setPhrase] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => { setPhrase(''); setSaved(false) }, [norm])

  const preparePhrase = () => { setPhrase(generateRecoveryPhrase()); setSaved(false) }

  const copyPhrase = async () => {
    try {
      await navigator.clipboard.writeText(phrase)
      toast('Recovery phrase copied — store it somewhere safe')
    } catch {
      toast('Couldn’t copy — select the phrase and copy it manually')
    }
  }

  const doRegister = async () => {
    const name = norm
    setReg({ status: 'busy' })
    try {
      await registerOnchain({ hashtag: name, name, recoveryPhrase: phrase })
      setReg({ status: 'done', name, phrase })
      // Deliberately NOT clearing the input here. Doing so changes `norm`,
      // which fires the availability effect above, whose first act is to reset
      // `reg` to idle for anything not mid-flight -- so the success line and
      // its "view record" link were wiped in the same tick they were set.
      // Leaving the name in place keeps the confirmation visible; typing a
      // different name clears it, which is when clearing is actually wanted.
      toast(`#${name} registered onchain · 30-day subscription`)
      onRegistered?.(name)
    } catch (e) {
      setReg({ status: 'error', message: friendlyError(e) })
    }
  }
  return (
    <div className="card pad-lg claim fade-in">
      <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Register a name</div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 500, marginBottom: '1rem' }}>Claim a new handle</h2>
      <div className="field">
        <span className="hash">#</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="yourname" spellCheck="false" />
        {state === 'taken' && <Link className="btn sm" to="/h/$name" params={{ name: norm }}>View record</Link>}
        {state === 'available' && !phrase && <button className="btn sm" onClick={preparePhrase}>Continue</button>}
        {state === 'available' && phrase && <button className="btn sm" disabled={reg.status === 'busy' || !saved} onClick={doRegister}>{reg.status === 'busy' ? 'Confirm in wallet…' : 'Register'}</button>}
      </div>

      {state === 'available' && phrase && reg.status !== 'done' && (
        <div className="send-preview">
          <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Account recovery phrase</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
            Write these 12 words down. They're the only way to move <b>#{norm}</b> to a new wallet if you lose this one —
            TagioPay never sees them, and only their hash goes onchain, so they can't be reissued.
          </p>
          <div className="mono" style={{ margin: '0.75rem 0', padding: '0.9rem', background: 'var(--paper-deep)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', lineHeight: 1.7, wordSpacing: '0.25rem' }}>
            {phrase}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn ghost sm" onClick={copyPhrase}>Copy</button>
            <button className="btn ghost sm" onClick={preparePhrase}>Regenerate</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--ink-soft)', cursor: 'pointer' }}>
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              I've saved it somewhere safe
            </label>
          </div>
        </div>
      )}

      {reg.status === 'error' && <div className="status bad">{I.x} {reg.message}</div>}
      {reg.status === 'done' && <div className="status ok">{I.check} #{reg.name} is yours · <Link to="/h/$name" params={{ name: reg.name }} style={{ color: 'var(--green-deep)', textDecoration: 'underline' }}>view record</Link></div>}
      {state === 'invalid' && <div className="status bad">{I.x} 3–32 chars · lowercase letters, numbers, underscore only</div>}
      {state === 'checking' && <div className="status" style={{ color: 'var(--ink-faint)' }}>Checking availability…</div>}
      {state === 'taken' && <div className="status bad">{I.x} #{norm} is already registered</div>}
      {state === 'available' && reg.status === 'idle' && <div className="status ok">{I.check} #{norm} is available · registering mints the NFT to your wallet (30-day subscription)</div>}
      {state === 'error' && <div className="status bad">{I.x} Availability check failed — try again</div>}
      {state === 'idle' && reg.status === 'idle' && <div className="status" style={{ color: 'var(--ink-faint)' }}>Names are minted as on-chain, transferable records on Robinhood Chain.</div>}
    </div>
  )
}
function Handles({ handles, loading, manage, renew, renewing, toast, refresh }) {
  return (
    <div className="fade-in">
      {handles.length === 0 && (
        <div className="card pad-lg" style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>{loading ? 'Loading your handles…' : 'No handles tracked for this wallet yet.'}</p>
        </div>
      )}
      <div className="grid handles" style={{ marginBottom: '1rem' }}>{handles.map((h) => <HandleCard key={h.name} h={h} onManage={() => manage(h.name)} onRenew={() => renew(h.name)} renewing={renewing === h.name} />)}</div>
      <Claim toast={toast} onRegistered={refresh} />
    </div>
  )
}
function Resolver({ handle, toast, onSaved }) {
  const record = handle.record
  const [splits, setSplits] = useState(handle.splits.map((s) => ({ ...s })))
  const [socials, setSocials] = useState({ ...handle.socials })
  // Spec Module 3's profile metadata editor. These three live directly on the
  // contract record (name/imageUrl/websiteUrl); bio rides in `socials`.
  const initialProfile = () => ({
    name: record.name || '',
    imageUrl: record.image_url || '',
    websiteUrl: record.website_url || '',
  })
  const [profile, setProfile] = useState(initialProfile)
  const [save, setSave] = useState({ status: 'idle' })
  useEffect(() => {
    setSplits(handle.splits.map((s) => ({ ...s }))); setSocials({ ...handle.socials }); setProfile(initialProfile()); setSave({ status: 'idle' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle.name])
  const totalPct = splits.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0)
  const totalBps = Math.round(totalPct * 100)
  const walletsOk = splits.every((r) => ADDR_RE.test(r.wallet.trim()))
  // MAX_PAYOUTS is enforced by the contract (TooManyPayouts); catching it here
  // means an 11th recipient is refused in the form rather than by a revert the
  // user pays gas to discover.
  const countOk = splits.length > 0 && splits.length <= MAX_PAYOUTS
  const valid = totalBps === 10000 && walletsOk && countOk
  const setRow = (id, key, val) => setSplits(splits.map((r) => (r.id === id ? { ...r, [key]: val } : r)))
  const addRow = () => setSplits((rows) => (rows.length >= MAX_PAYOUTS ? rows : [...rows, { id: Date.now(), wallet: '', pct: 0 }]))
  const delRow = (id) => setSplits(splits.filter((r) => r.id !== id))
  const distribute = () => { const n = splits.length, base = Math.floor(10000 / n); setSplits(splits.map((r, i) => ({ ...r, pct: (base + (i === n - 1 ? 10000 - base * n : 0)) / 100 }))) }
  const splitsChanged = JSON.stringify(splits.map((r) => [r.wallet.trim().toLowerCase(), Math.round((parseFloat(r.pct) || 0) * 100)])) !== JSON.stringify(handle.splits.map((r) => [r.wallet.toLowerCase(), Math.round(r.pct * 100)]))
  const socialsChanged = JSON.stringify(socials) !== JSON.stringify(handle.socials)
  const profileChanged = JSON.stringify(profile) !== JSON.stringify(initialProfile())
  const metadataChanged = socialsChanged || profileChanged
  const profileOk =
    profile.name.length <= MAX_NAME_LEN &&
    profile.imageUrl.length <= MAX_URL_LEN &&
    profile.websiteUrl.length <= MAX_URL_LEN &&
    Object.values(socials).every((v) => (v || '').length <= MAX_SOCIAL_VAL)
  const doSave = async () => {
    setSave({ status: 'busy' })
    try {
      if (splitsChanged) {
        await updatePayoutsOnchain({
          hashtag: handle.name,
          payouts: splits.map((r) => ({ wallet: r.wallet.trim(), percentageBps: Math.round((parseFloat(r.pct) || 0) * 100) })),
        })
      }
      if (metadataChanged) {
        await updateMetadataOnchain({
          hashtag: handle.name,
          name: profile.name || handle.name,
          imageUrl: profile.imageUrl,
          websiteUrl: profile.websiteUrl,
          // updateMetadata replaces the whole social array, so every key that
          // still has a value has to be re-sent -- omitting one deletes it.
          socials: [...SOCIAL_KEYS.map(([k]) => k), BIO_KEY]
            .filter((k) => socials[k])
            .map((k) => ({ key: k, value: socials[k] })),
        })
      }
      setSave({ status: 'idle' })
      toast(`Resolver config saved onchain for #${handle.name}`)
      onSaved?.()
    } catch (e) {
      setSave({ status: 'error', message: friendlyError(e) })
    }
  }
  const dirty = splitsChanged || metadataChanged
  return (
    <div className="grid two fade-in" style={{ alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card pad-lg">
          <div className="section-title"><div><div className="eyebrow">Routing</div><h2>Payout splits</h2></div><button className="btn ghost sm" onClick={distribute}>Even split</button></div>
          <div className="split-row" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-faint)', marginBottom: '0.5rem' }}><span>#</span><span>Wallet</span><span style={{ textAlign: 'right' }}>Share</span><span></span></div>
          {splits.map((r, i) => (
            <div className="split-row" key={r.id}>
              <div className="rlabel" style={{ color: 'var(--ink-faint)', fontSize: '0.85rem' }}>Recipient {i + 1}</div>
              <div className="rwallet"><input value={r.wallet} onChange={(e) => setRow(r.id, 'wallet', e.target.value)} placeholder="0x…" spellCheck="false" /></div>
              <div className="rpct"><input type="number" min="0" max="100" value={r.pct} onChange={(e) => setRow(r.id, 'pct', e.target.value === '' ? '' : parseFloat(e.target.value))} /><span>%</span></div>
              <button className="rdel" onClick={() => delRow(r.id)} disabled={splits.length === 1} style={{ opacity: splits.length === 1 ? 0.3 : 1 }}>{I.x}</button>
            </div>
          ))}
          <button className="btn ghost sm" onClick={addRow} disabled={splits.length >= MAX_PAYOUTS} style={{ marginTop: '0.25rem', opacity: splits.length >= MAX_PAYOUTS ? 0.4 : 1 }}>+ Add recipient</button>
          <div className={'split-total ' + (valid ? 'ok' : 'bad')}><span>{!countOk ? `Up to ${MAX_PAYOUTS} recipients` : !walletsOk ? 'Every recipient needs a valid 0x address' : valid ? 'Splits balanced' : (totalPct > 100 ? 'Over by ' + (totalPct - 100).toFixed(1) + '%' : 'Remaining ' + (100 - totalPct).toFixed(1) + '%')}</span><span>{totalPct.toFixed(1)}% <span className="bps">· {totalBps} / 10000 bps</span></span></div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: '0.5rem' }}>
            {splits.length} of {MAX_PAYOUTS} recipients used. Payments to #{handle.name} are divided and fanned out atomically in one transaction.
          </div>
        </div>

        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>Profile</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '0.75rem' }}>Public metadata</h2>
          <div className="form-row">
            <label className="field-label">Display name</label>
            <input className="input" value={profile.name} maxLength={MAX_NAME_LEN} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder={handle.name} />
          </div>
          <div className="form-row">
            <label className="field-label">Avatar image URL</label>
            <input className="input mono" value={profile.imageUrl} maxLength={MAX_URL_LEN} onChange={(e) => setProfile({ ...profile, imageUrl: e.target.value })} placeholder="https://…" spellCheck="false" />
          </div>
          <div className="form-row">
            <label className="field-label">Website</label>
            <input className="input mono" value={profile.websiteUrl} maxLength={MAX_URL_LEN} onChange={(e) => setProfile({ ...profile, websiteUrl: e.target.value })} placeholder="https://…" spellCheck="false" />
          </div>
          <div className="form-row">
            <label className="field-label">Bio</label>
            <textarea className="input" rows={3} maxLength={MAX_SOCIAL_VAL} value={socials[BIO_KEY] || ''} onChange={(e) => setSocials({ ...socials, [BIO_KEY]: e.target.value })} placeholder="What this handle is for" style={{ resize: 'vertical', width: '100%' }} />
            <div style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>{(socials[BIO_KEY] || '').length}/{MAX_SOCIAL_VAL}</div>
          </div>
          {profile.imageUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.25rem' }}>
              <img src={profile.imageUrl} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', objectFit: 'cover', background: 'var(--paper-deep)' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>Avatar preview</span>
            </div>
          )}
        </div>

        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>Identity</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '0.5rem' }}>Social handles</h2>
          {SOCIAL_KEYS.map(([k, l]) => (
            <div className="social-row" key={k}>
              <div className="left"><span className="ic">{l[0]}</span><input value={socials[k]} maxLength={MAX_SOCIAL_VAL} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })} placeholder={'Add ' + l} /></div>
              {handle.socials[k] && socials[k] === handle.socials[k] && <span className="pill ok">{I.check}Onchain</span>}
            </div>
          ))}
          <div className="status" style={{ color: 'var(--ink-faint)', marginTop: '0.5rem' }}>Socials are written to the hashtag's onchain metadata when you save.</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>Record</div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Owner</span><span className="addr-mono">{short(record.owner_wallet)}</span></div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Registered</span><span>{fmtWhen(record.registered_at)}</span></div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Expires</span><span>{fmtWhen(record.expires_at)} · {handle.expiresDays}d left</span></div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Total volume</span><b>${fmt(handle.volumeUsd)}</b></div>
        </div>
        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Preview</div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Anyone sends to</span><b><span style={{ color: 'var(--green)' }}>#</span>{handle.name}</b></div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Resolves to</span><span>{splits.length} recipient{splits.length > 1 ? 's' : ''}</span></div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Settles in</span><b>ETH (native)</b></div>
        </div>
        <button className="btn" disabled={!valid || !profileOk || !dirty || save.status === 'busy'} onClick={doSave} style={{ justifyContent: 'center' }}>{save.status === 'busy' ? 'Confirm in wallet…' : !dirty ? 'Everything saved onchain' : !profileOk ? 'Shorten the profile fields to save' : valid ? 'Save resolver config onchain' : 'Fix splits to save'}<span className="circ">{I.chevron}</span></button>
        {save.status === 'error' && <div className="split-total bad">{save.message}</div>}
      </div>
    </div>
  )
}
// Module 6 lives in UniversalSend: one recipient box that accepts a #hashtag,
// an @handle, or a base58 Solana address and routes each down the path the
// spec's execution matrix assigns it. The previous version here was
// hashtag-only and paid in native ETH through wagmi, which no longer matches
// the product's Solana-first execution model.
function Send({ toast }) {
  return (
    <div className="grid two fade-in" style={{ alignItems: 'start' }}>
      <UniversalSend toast={toast} />
      <WalletPanel />
    </div>
  )
}
function fmtBalance(b) {
  const n = Number(formatUnits(BigInt(b.balance), b.decimals))
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 5 : 2 })
}

function WalletPanel() {
  // Solana is the user-facing chain (spec: "Executed on Solana, Settled on
  // Robinhood"), so this panel reads the Solana wallet and its balances. It
  // used to render the Solana address from WalletControl above a list of EVM
  // balances fetched for a different address entirely, which read as though
  // the Solana wallet held them.
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const isConnected = Boolean(publicKey)
  // Sign-in itself is triggered automatically at the Dashboard level (see
  // AuthGate) the moment a wallet connects -- this panel just reflects the
  // outcome, it never triggers anything itself.
  const signedIn = Boolean(getAuthToken())

  // The xStocks directory gives held equities a ticker and an icon; without it
  // the panel could only ever name SOL and USDC, so a wallet holding AAPLx
  // looked empty beyond its base currencies (spec Module 2 + 7).
  const tokensQuery = useQuery({ queryKey: ['swap-tokens'], queryFn: () => getSwapTokens(), staleTime: 60 * 60 * 1000 })
  const directory = tokensQuery.data?.allStocks ?? []
  const iconByMint = new Map(directory.map((t) => [t.mint, t.iconUrl]))

  const { balances, loading: balancesLoading } = useSolanaBalances(connection, publicKey, directory)
  // SOL/USDC always shown for context; anything else only when actually held,
  // so this doesn't turn into a wall of zero-balance tickers.
  const shown = balances.filter((b) => b.native || b.symbol === 'USDC' || BigInt(b.balance) > 0n)

  return (
    <div className="card pad-lg">
      <div className="eyebrow" style={{ marginBottom: '0.9rem' }}>Wallet</div>
      {isConnected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start', width: '100%' }}>
          <div className="wallet-chip-light" style={{ width: '100%' }}>
            <WalletControl variant="chip" />
          </div>
          {signedIn && <div style={{ fontSize: '0.8rem', color: 'var(--green-deep)' }}>Signed in to TagioPay ✓</div>}
          <div style={{ width: '100%', marginTop: '0.25rem' }}>
            <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Your assets on Solana</div>
            {balancesLoading ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Loading balances…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                {shown.map((b) => (
                  <div key={b.mint} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                    <SolanaTokenIcon symbol={b.symbol} iconUrl={iconByMint.get(b.mint)} />
                    <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{b.symbol}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--ink-soft)' }} className="mono">{fmtBalance(b)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>Connect a wallet on Robinhood Chain to send payments.</p>
          <WalletControl />
        </div>
      )}
      <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(200,232,96,0.10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--green-deep)', lineHeight: 1.5 }}>Sends resolve the name, apply the on-chain split, and settle atomically. You never paste an address.</div>
    </div>
  )
}

// Blocking overlay shown while the two-step wallet+X sign-in is in flight or
// failed. 'checking' covers both the signature prompt and the backend
// round-trip; 'redirecting' is the brief moment before the browser navigates
// to X (auth is two-step -- a linked X account is required before a JWT is
// issued, see FRONTEND-INTEGRATION.md).
function AuthGate({ status, error, onRetry }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(4,23,13,0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div className="card pad-lg" style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        {status === 'error' ? (
          <>
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--danger)' }}>{error || 'Sign-in failed'}</div>
            <button className="btn" onClick={onRetry} style={{ width: '100%', justifyContent: 'center' }}>Try again</button>
          </>
        ) : (
          <>
            <div className="auth-spinner" style={{ margin: '0 auto 1rem' }} />
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
              {status === 'redirecting' ? 'Redirecting you to X to link your account…' : 'Checking for a linked X account…'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
// Module 7 lives in XStocks. The old implementation signed /swap/plan as an
// EVM {approvals, swap} pair; that endpoint now returns Relay Solana steps for
// any SOL/USDC <-> xStock pair, so it had to move to the Solana signer.
function Trade({ toast }) {
  return (
    <div className="grid two fade-in" style={{ alignItems: 'start' }}>
      <XStocks toast={toast} />
      <WalletPanel />
    </div>
  )
}
function Activity() {
  const [q, setQ] = useState('')
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [rows, setRows] = useState([])
  const [looked, setLooked] = useState('')
  const norm = q.replace(/^[#@]+/, '').toLowerCase().trim()
  const lookup = async () => {
    setState('loading')
    try {
      const txs = await getHashtagTransactions({ data: norm })
      setRows(txs)
      setLooked(norm)
      setState('done')
    } catch {
      setState('error')
    }
  }
  return (
    <div className="fade-in">
      <div className="card pad-lg claim" style={{ marginBottom: '1rem' }}>
        <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Onchain payments</div>
        <div className="field">
          <span className="hash">#</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="hashtag" spellCheck="false" onKeyDown={(e) => { if (e.key === 'Enter' && NAME_RE.test(norm)) lookup() }} />
          <button className="btn sm" disabled={!NAME_RE.test(norm) || state === 'loading'} onClick={lookup}>{state === 'loading' ? 'Loading…' : 'Look up'}</button>
        </div>
        {state === 'error' && <div className="status bad">{I.x} Lookup failed — try again</div>}
      </div>
      {state === 'done' && (
        <div className="card pad-lg">
          <div className="section-title"><h2>Payments to #{looked}</h2><Link className="btn ghost sm" to="/h/$name" params={{ name: looked }}>View record</Link></div>
          {rows.length === 0 && <p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No payments indexed for #{looked} yet.</p>}
          {rows.length > 0 && (
            <div>
              <div className="act-row head"><span></span><span>Transaction</span><span className="hide-m">Chain</span><span className="right">Amount</span><span className="right hide-m">When</span></div>
              {rows.map((tx) => (
                <div className="act-row" key={tx.signature}>
                  <span className="act-ic in">{I.down}</span>
                  <div><b style={{ fontWeight: 500 }} className="addr-mono">{short(tx.signature)}</b><div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }} className="hide-m">Settled</div></div>
                  <span className="addr-mono hide-m">{tx.chain}</span>
                  <span className="right amt" style={{ color: 'var(--green-deep)' }}>+{tx.is_native ? fmtNative(tx.amount) + ' ETH' : tx.amount + ' ' + short(tx.token)}</span>
                  <span className="right hide-m" style={{ color: 'var(--ink-faint)', fontSize: '0.85rem' }}>{fmtWhen(tx.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// uint256 strings from the API are parsed defensively wherever the result is
// used during render -- a throw there is a blank page, not a bad number.
const bigOr0 = (v) => { try { return BigInt(v ?? 0) } catch { return 0n } }

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const causeToken = (c) => (c.token?.toLowerCase() === ZERO_ADDRESS ? 'native' : 'usdg')
const causeDecimals = (c) => (causeToken(c) === 'native' ? 18 : 6)
const fmtCauseAmount = (baseUnits, cause) => Number(formatUnits(BigInt(baseUnits), causeDecimals(cause))).toLocaleString('en-US', { maximumFractionDigits: 2 })

function CauseCard({ cause, address, toast, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [leaderboard, setLeaderboard] = useState(null)
  const [donateAmount, setDonateAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawReason, setWithdrawReason] = useState('')
  const [busy, setBusy] = useState(false)

  const raised = fmtCauseAmount(cause.totalRaised, cause)
  const goal = fmtCauseAmount(cause.goal, cause)
  const available = fmtCauseAmount((BigInt(cause.totalRaised) - BigInt(cause.totalWithdrawn)).toString(), cause)
  const pct = Number(cause.goal) > 0 ? Math.min(100, (Number(cause.totalRaised) / Number(cause.goal)) * 100) : 0
  const isOrganizer = address && cause.organizer?.toLowerCase() === address.toLowerCase()
  const token = causeToken(cause) === 'native' ? 'ETH' : 'USDG'

  const toggle = async () => {
    if (!expanded && !leaderboard) {
      try { setLeaderboard(await getCauseLeaderboard({ data: cause.causeId })) } catch { setLeaderboard([]) }
    }
    setExpanded((e) => !e)
  }

  const doDonate = async () => {
    setBusy(true)
    try {
      await donateToCauseOnchain({ causeId: cause.causeId, amount: donateAmount, token: causeToken(cause) })
      toast(`Donated ${donateAmount} ${token} to "${cause.name}"`)
      setDonateAmount('')
      onChanged()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const doWithdraw = async () => {
    setBusy(true)
    try {
      await withdrawFromCauseOnchain({ causeId: cause.causeId, amount: withdrawAmount, token: causeToken(cause), proofUrl: withdrawReason })
      toast(`Withdrew ${withdrawAmount} ${token} from "${cause.name}"`)
      setWithdrawAmount('')
      setWithdrawReason('')
      onChanged()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card pad-lg" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="eyebrow">#CAUSE-{cause.causeId}</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 500 }}>{cause.name}</h2>
        </div>
        <TokenIcon symbol={token} />
      </div>
      <div style={{ margin: '0.75rem 0 0.4rem', height: '0.5rem', background: 'var(--hairline)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)' }} />
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{raised} / {goal} {token} raised · {available} {token} available</div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <input className="input" style={{ flex: 1 }} type="number" min="0" placeholder={`Amount (${token})`} value={donateAmount} onChange={(e) => setDonateAmount(e.target.value)} />
        <button className="btn sm" disabled={busy || !donateAmount || parseFloat(donateAmount) <= 0} onClick={doDonate}>{busy ? 'Signing…' : 'Donate'}</button>
        <button className="btn ghost sm" onClick={toggle}>{expanded ? 'Hide' : 'Leaderboard'}</button>
      </div>
      {expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--hairline)' }}>
          {leaderboard === null ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Loading…</p>
          ) : leaderboard.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>No donors yet.</p>
          ) : (
            leaderboard.map((entry, i) => (
              <div key={entry.donor} className="route-line" style={{ fontSize: '0.85rem' }}>
                <span>{i + 1}. {short(entry.donor)}</span>
                <span>{fmtCauseAmount(entry.total, cause)} {token}</span>
              </div>
            ))
          )}
          {isOrganizer && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--hairline)' }}>
              <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Withdraw (organizer)</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: '1 1 8rem' }} type="number" min="0" placeholder="Amount" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
                <input className="input" style={{ flex: '2 1 12rem' }} placeholder="Proof URL / reason" value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} />
                <button className="btn sm" disabled={busy || !withdrawAmount || parseFloat(withdrawAmount) <= 0} onClick={doWithdraw}>{busy ? 'Signing…' : 'Withdraw'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreateCause({ address, toast, onCreated }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [token, setToken] = useState('usdg')
  const [busy, setBusy] = useState(false)

  const doCreate = async () => {
    setBusy(true)
    try {
      await createCauseOnchain({ name, organizer: address, goal, token })
      toast(`Cause "${name}" created`)
      setName(''); setGoal('')
      onCreated()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card pad-lg claim" style={{ marginBottom: '1rem' }}>
      <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Start a cause</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: '2 1 12rem' }} placeholder="Cause name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" style={{ flex: '1 1 8rem' }} type="number" min="0" placeholder="Goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
        <select className="input" style={{ flex: '0 1 7rem' }} value={token} onChange={(e) => setToken(e.target.value)}>
          <option value="usdg">USDG</option>
          <option value="native">ETH</option>
        </select>
        <button className="btn sm" disabled={busy || !name || !goal || !address} onClick={doCreate}>{busy ? 'Signing…' : 'Create'}</button>
      </div>
    </div>
  )
}

function Causes({ toast }) {
  const { address } = useAccount()
  const query = useQuery({ queryKey: ['causes'], queryFn: getCauses })
  const causes = query.data || []

  return (
    <div className="fade-in">
      <CreateCause address={address} toast={toast} onCreated={() => query.refetch()} />
      {query.isLoading ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>Loading causes…</p></div>
      ) : causes.length === 0 ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No causes yet — start one above.</p></div>
      ) : (
        causes.map((cause) => (
          <CauseCard key={cause.causeId} cause={cause} address={address} toast={toast} onChanged={() => query.refetch()} />
        ))
      )}
    </div>
  )
}

const escrowToken = (e) => (e.token?.toLowerCase() === ZERO_ADDRESS ? 'native' : 'usdg')
const escrowDecimals = (e) => (escrowToken(e) === 'native' ? 18 : 6)
const fmtEscrowAmount = (e) => Number(formatUnits(BigInt(e.amount), escrowDecimals(e))).toLocaleString('en-US', { maximumFractionDigits: 2 })
const deadlinePassed = (unixSeconds) => Number(unixSeconds) > 0 && Date.now() >= Number(unixSeconds) * 1000

function EscrowCard({ escrow, address, toast, onChanged }) {
  const [proofUrl, setProofUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const isCreator = address && escrow.creator?.toLowerCase() === address.toLowerCase()
  const isCounterparty = address && escrow.counterparty?.toLowerCase() === address.toLowerCase()
  const token = escrowToken(escrow) === 'native' ? 'ETH' : 'USDG'
  const statusPill = escrow.status === 'Released' ? 'ok' : escrow.status === 'Cancelled' ? '' : 'warn'

  const run = async (fn, label) => {
    setBusy(true)
    try {
      await fn()
      toast(label)
      onChanged()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card pad-lg" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="eyebrow">#{escrow.escrowId} · {isCreator ? 'You are the creator' : isCounterparty ? 'You are the counterparty' : ''}</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 500 }}>{escrow.description}</h2>
        </div>
        <span className={'pill ' + statusPill}>{escrow.status}</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: '0.5rem 0' }}>
        {fmtEscrowAmount(escrow)} {token} · counterparty {short(escrow.counterparty)} · creator {short(escrow.creator)}
      </div>
      {escrow.status === 'Delivered' && escrow.proofUrl && (
        <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Proof: <a href={escrow.proofUrl} target="_blank" rel="noreferrer">{escrow.proofUrl}</a></div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        {escrow.status === 'Created' && isCreator && (
          <button className="btn ghost sm" disabled={busy} onClick={() => run(() => cancelEscrowOnchain(escrow.escrowId), 'Escrow cancelled')}>{busy ? 'Signing…' : 'Cancel'}</button>
        )}
        {escrow.status === 'Created' && isCounterparty && (
          <button className="btn sm" disabled={busy} onClick={() => run(() => acceptEscrowOnchain(escrow.escrowId), 'Escrow accepted')}>{busy ? 'Signing…' : 'Accept'}</button>
        )}
        {escrow.status === 'Accepted' && isCounterparty && (
          <>
            <input className="input" style={{ flex: '2 1 12rem' }} placeholder="Proof URL" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
            <button className="btn sm" disabled={busy || !proofUrl} onClick={() => run(() => deliverEscrowOnchain({ escrowId: escrow.escrowId, proofUrl }), 'Marked delivered')}>{busy ? 'Signing…' : 'Deliver'}</button>
          </>
        )}
        {escrow.status === 'Accepted' && isCreator && deadlinePassed(escrow.deliverDeadline) && (
          <button className="btn ghost sm" disabled={busy} onClick={() => run(() => refundEscrowOnchain(escrow.escrowId), 'Refunded')}>{busy ? 'Signing…' : 'Refund (deliver deadline passed)'}</button>
        )}
        {escrow.status === 'Delivered' && isCreator && (
          <button className="btn sm" disabled={busy} onClick={() => run(() => releaseEscrowOnchain(escrow.escrowId), 'Released to counterparty')}>{busy ? 'Signing…' : 'Release'}</button>
        )}
        {escrow.status === 'Delivered' && isCounterparty && deadlinePassed(escrow.releaseDeadline) && (
          <button className="btn ghost sm" disabled={busy} onClick={() => run(() => forceReleaseEscrowOnchain(escrow.escrowId), 'Force-released')}>{busy ? 'Signing…' : 'Force release (grace passed)'}</button>
        )}
      </div>
    </div>
  )
}

function CreateEscrow({ address, toast, onCreated }) {
  const [counterparty, setCounterparty] = useState('')
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState('usdg')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const doCreate = async () => {
    setBusy(true)
    try {
      await createEscrowOnchain({ counterparty, amount, token, description })
      toast(`Escrow "${description}" created`)
      setCounterparty(''); setAmount(''); setDescription('')
      onCreated()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card pad-lg claim" style={{ marginBottom: '1rem' }}>
      <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Create an escrow</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: '2 1 14rem' }} placeholder="Description (e.g. Build 3 logos)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className="input" style={{ flex: '2 1 12rem' }} placeholder="Counterparty wallet (0x…)" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        <input className="input" style={{ flex: '1 1 8rem' }} type="number" min="0" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="input" style={{ flex: '0 1 7rem' }} value={token} onChange={(e) => setToken(e.target.value)}>
          <option value="usdg">USDG</option>
          <option value="native">ETH</option>
        </select>
        <button className="btn sm" disabled={busy || !counterparty || !amount || !description || !address} onClick={doCreate}>{busy ? 'Signing…' : 'Create'}</button>
      </div>
    </div>
  )
}

function Escrow({ toast }) {
  const { address } = useAccount()
  const query = useQuery({ queryKey: ['escrows', address], queryFn: () => getEscrows({ data: address }), enabled: !!address })
  const escrows = query.data || []

  return (
    <div className="fade-in">
      <CreateEscrow address={address} toast={toast} onCreated={() => query.refetch()} />
      {query.isLoading ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>Loading escrows…</p></div>
      ) : escrows.length === 0 ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No escrows yet — create one above, or use <code>$escrow "desc" amount @handle</code> on X.</p></div>
      ) : (
        escrows.map((escrow) => (
          <EscrowCard key={escrow.escrowId} escrow={escrow} address={address} toast={toast} onChanged={() => query.refetch()} />
        ))
      )}
    </div>
  )
}

// Cycles through the three accepted recipient formats so the plain
// "@recipient" placeholder doesn't read as @handle-only when #hashtag and
// a raw wallet address work too (same three kinds a plain send accepts).
const RECIPIENT_EXAMPLES = ['@recipient', '#hashtag', '0xWalletAddress']

function CreatePrivateSend({ toast, onCreated }) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState('usdg')
  const [busy, setBusy] = useState(false)
  const [exampleIndex, setExampleIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setExampleIndex((i) => (i + 1) % RECIPIENT_EXAMPLES.length), 2200)
    return () => clearInterval(id)
  }, [])

  const doCreate = async () => {
    const authToken = getAuthToken()
    if (!authToken) { toast('Sign in with X first'); return }
    setBusy(true)
    try {
      await createPrivateSend({ data: { token: authToken, recipient, amount, sendToken: token } })
      toast(`Private send to ${recipient} created — sign it in the Pending tab`)
      setRecipient(''); setAmount('')
      onCreated()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card pad-lg claim" style={{ marginBottom: '1rem' }}>
      <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Send privately</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginBottom: '0.75rem' }}>
        The recipient's wallet only ever shows a transfer from TagioPay's pool, never yours. Practical privacy, not cryptographic anonymity — see the docs for what that does and doesn't cover.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div className="placeholder-cycle-wrap" style={{ flex: '2 1 12rem' }}>
          <input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          {!recipient && <span key={exampleIndex} className="placeholder-cycle">{RECIPIENT_EXAMPLES[exampleIndex]}</span>}
        </div>
        <input className="input" style={{ flex: '1 1 8rem' }} type="number" min="0" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="input" style={{ flex: '0 1 7rem' }} value={token} onChange={(e) => setToken(e.target.value)}>
          <option value="usdg">USDG</option>
          <option value="native">ETH</option>
        </select>
        <button className="btn sm" disabled={busy || !recipient || !amount} onClick={doCreate}>{busy ? 'Sending…' : 'Send privately'}</button>
      </div>
    </div>
  )
}

const psendToken = (p) => (p.token === 'native' ? 'ETH' : 'USDG')
const psendDecimals = (p) => (p.token === 'native' ? 18 : 6)
const fmtPsendAmount = (p) => Number(p.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })

// "Who is this wallet" lookup -- whatever it's publicly known as (a linked
// X handle, top hashtags by volume), surfaced from a private send's
// recipient address so the sender can see who they actually sent to.
function WalletIdentityModal({ wallet, onClose }) {
  const query = useQuery({ queryKey: ['wallet-identity', wallet], queryFn: () => getWalletIdentity({ data: wallet }), enabled: !!wallet })
  const identity = query.data
  const hasNothing = identity && !identity.xHandle && identity.hashtags.length === 0

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="card pad-lg fade-in" style={{ maxWidth: '24rem', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div className="eyebrow">Known as</div>
          <button className="btn ghost sm" onClick={onClose}><span className="circ">{I.x}</span></button>
        </div>
        <div className="addr-mono" style={{ marginBottom: '0.85rem', overflowWrap: 'anywhere' }}>{wallet}</div>
        {query.isLoading ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Loading…</p>
        ) : hasNothing ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Nothing publicly known about this wallet yet.</p>
        ) : (
          <>
            {identity.xHandle && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div className="eyebrow" style={{ marginBottom: '0.3rem' }}>X handle</div>
                <a href={`https://x.com/${identity.xHandle}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green-deep)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', verticalAlign: 'middle' }}>
                  <img src="/x.png" alt="" style={{ width: '1.2rem', height: '1.2rem', borderRadius: '0.3rem', flex: 'none', display: 'block' }} />
                  <span>@{identity.xHandle}</span>
                </a>
              </div>
            )}
            {identity.hashtags.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: '0.3rem' }}>Top hashtags</div>
                {identity.hashtags.map((h) => (
                  <div key={h.hashtag} className="route-line" style={{ fontSize: '0.85rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', verticalAlign: 'middle' }}>
                      <img src="/favicon.png" alt="" style={{ width: '1.2rem', height: '1.2rem', borderRadius: '0.3rem', flex: 'none', display: 'block' }} />
                      <span>#{h.hashtag}</span>
                    </span>
                    <span style={{ color: 'var(--ink-faint)' }}>{h.name || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PrivateSendRow({ row, address, toast, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [identityWallet, setIdentityWallet] = useState(null)
  const isSender = address && row.senderWallet?.toLowerCase() === address.toLowerCase()
  const isRecipient = address && row.recipientWallet?.toLowerCase() === address.toLowerCase()
  const statusPill = row.status === 'claimed' ? 'ok' : row.status === 'failed' ? '' : 'warn'

  const doClaim = async () => {
    const authToken = getAuthToken()
    if (!authToken) { toast('Sign in with X first'); return }
    setBusy(true)
    try {
      await claimPrivateSend({ data: { token: authToken, id: row.id } })
      toast('Claim created — sign it in the Pending tab')
      onChanged()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card pad-lg" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="eyebrow">{isSender ? 'You sent this privately' : isRecipient ? 'Sent to you privately' : ''}</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 500 }}>{fmtPsendAmount(row)} {psendToken(row)}</h2>
        </div>
        <span className={'pill ' + statusPill}>{row.status.replace('_', ' ')}</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: '0.5rem 0' }}>
        {isSender && <>to <button className="link-btn" onClick={() => setIdentityWallet(row.recipientWallet)}>{short(row.recipientWallet)}</button> — their wallet only sees TagioPay's pool, not you</>}
        {isRecipient && <>from an Unknown Sender</>}
        {row.claimedBy && <> · claimed by {row.claimedBy === 'keeper' ? "TagioPay's keeper" : 'you'}</>}
      </div>
      {isRecipient && row.status === 'sent' && (
        <button className="btn sm" disabled={busy} onClick={doClaim}>{busy ? 'Signing…' : 'Claim now (skip the keeper)'}</button>
      )}
      {identityWallet && <WalletIdentityModal wallet={identityWallet} onClose={() => setIdentityWallet(null)} />}
    </div>
  )
}

function PrivateSendGroup({ title, rows, address, toast, onChanged }) {
  if (rows.length === 0) return null
  return (
    <>
      <div className="eyebrow" style={{ margin: '1.25rem 0 0.5rem' }}>{title}</div>
      {rows.map((row) => (
        <PrivateSendRow key={row.id} row={row} address={address} toast={toast} onChanged={onChanged} />
      ))}
    </>
  )
}

function PrivateSend({ toast }) {
  const { address } = useAccount()
  const query = useQuery({ queryKey: ['private-sends', address], queryFn: () => getPrivateSends({ data: address }), enabled: !!address })
  const rows = query.data || []
  const onChanged = () => query.refetch()
  const lower = address?.toLowerCase()

  // Split into three clearly labeled groups instead of one mixed list --
  // unclaimed-and-waiting-on-you surfaces first since it's the one thing
  // that actually needs your attention (a Claim button right there);
  // what you've sent tracks your own outgoing sends regardless of whether
  // the recipient has claimed yet; claimed is just settled history.
  const receivedUnclaimed = rows.filter((r) => r.recipientWallet?.toLowerCase() === lower && r.status !== 'claimed')
  const sent = rows.filter((r) => r.senderWallet?.toLowerCase() === lower)
  const receivedClaimed = rows.filter((r) => r.recipientWallet?.toLowerCase() === lower && r.status === 'claimed')

  return (
    <div className="fade-in">
      <CreatePrivateSend toast={toast} onCreated={onChanged} />
      {query.isLoading ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>Loading private sends…</p></div>
      ) : rows.length === 0 ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No private sends yet — send one above, or use <code>$psend amount TOKEN to @handle</code> on X.</p></div>
      ) : (
        <>
          <PrivateSendGroup title="Received, waiting for you to claim" rows={receivedUnclaimed} address={address} toast={toast} onChanged={onChanged} />
          <PrivateSendGroup title="Sent by you" rows={sent} address={address} toast={toast} onChanged={onChanged} />
          <PrivateSendGroup title="Received, claimed" rows={receivedClaimed} address={address} toast={toast} onChanged={onChanged} />
        </>
      )}
    </div>
  )
}

// Requests created by the X bot (a mention/DM like "send 5 usdg to @friend")
// land here as unsigned payloads -- the bot never signs anything itself. This
// view is where the loop actually closes: list -> sign with the connected
// wallet -> report the resulting tx_hash back so the backend can verify it
// landed onchain before marking it done.
// Shared by the Pending tab and the on-load PendingNudge so the two never
// drift apart on how a row's headline reads.
const tokenLabel = (row) => (row.token === 'native' ? 'ETH' : 'USDG')
const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// Plain-text mirror of <PendingRowLabel> for the OS notification body, which
// can't take JSX. Covers the common kinds with a sensible generic fallback.
const describePendingText = (row) => {
  const t = tokenLabel(row)
  switch (row.kind) {
    case 'swap': return `Swap ${row.amount} ${row.token} → ${row.target_value}`
    case 'deposit': return `${row.amount} ${t} → @${row.target_value} (escrowed)`
    case 'claim': return `Claim ${row.amount} ${t} from escrow`
    case 'psend': return `Private send ${row.amount} ${t}`
    case 'psend_claim': return `Claim private send${row.amount && row.amount !== '0' ? ` ${row.amount} ${t}` : ''}`
    case 'cause': return `Cause · ${titleCase(row.target_type?.replace('cause_', ''))}${row.amount ? ` ${row.amount} ${t}` : ''}`
    case 'escrow': return `Escrow · ${titleCase(row.target_type?.replace('escrow_', ''))}${row.amount ? ` ${row.amount} ${t}` : ''}`
    default: {
      const dest = row.target_type === 'hashtag' ? '#' + row.target_value : row.target_type === 'x_account' ? '@' + row.target_value : short(row.target_value)
      return `${row.amount} ${t} → ${dest}`
    }
  }
}
// Compact countdown: hours+minutes while there's plenty of time, minutes+seconds
// in the last hour so the ticking clock actually conveys urgency.
const fmtCountdown = (ms) => {
  if (ms <= 0) return 'now'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

// Shared by the Pending tab and the on-load PendingNudge -- the tweet/DM
// that triggered a request only has a public link to show for mentions
// (DMs have no tweet_url at all), same as postReceiptReply on the backend.
function TweetLink({ url }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--green-deep)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', verticalAlign: 'middle' }}>
      <img src="/x.png" alt="" style={{ width: '1rem', height: '1rem', borderRadius: '0.25rem', flex: 'none', display: 'block' }} />
      <span>view tweet</span>
    </a>
  )
}

function PendingRowLabel({ row }) {
  if (row.kind === 'swap') {
    return <b style={{ fontWeight: 500 }}>Swap {row.amount} {row.token} → {row.target_value}</b>
  }
  if (row.kind === 'deposit') {
    return (
      <b style={{ fontWeight: 500 }}>
        {row.amount} {tokenLabel(row)} → @{row.target_value} <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}>(escrowed until they link)</span>
      </b>
    )
  }
  if (row.kind === 'claim') {
    return <b style={{ fontWeight: 500 }}>Claim {row.amount} {tokenLabel(row)} from escrow</b>
  }
  if (row.kind === 'cause') {
    const action = row.target_type?.replace('cause_', '')
    const ref = row.target_value && row.target_value !== 'new' ? ` ${row.target_value}` : ''
    if (action === 'create') return <b style={{ fontWeight: 500 }}>Create cause{ref}</b>
    if (action === 'donate') return <b style={{ fontWeight: 500 }}>Donate {row.amount} {tokenLabel(row)}{ref}</b>
    return <b style={{ fontWeight: 500 }}>Withdraw {row.amount} {tokenLabel(row)}{ref}</b>
  }
  if (row.kind === 'escrow') {
    const action = row.target_type?.replace('escrow_', '')
    const ref = row.target_value && row.target_value !== 'new' ? ` ${row.target_value}` : ''
    if (action === 'create') return <b style={{ fontWeight: 500 }}>Create escrow {row.amount} {tokenLabel(row)}{ref}</b>
    return <b style={{ fontWeight: 500 }}>{titleCase(action)} escrow{ref}</b>
  }
  if (row.kind === 'psend') {
    return <b style={{ fontWeight: 500 }}>Private send {row.amount} {tokenLabel(row)}</b>
  }
  if (row.kind === 'psend_claim') {
    return <b style={{ fontWeight: 500 }}>Claim private send {row.amount && row.amount !== '0' ? `${row.amount} ${tokenLabel(row)}` : ''}</b>
  }
  return (
    <b style={{ fontWeight: 500 }}>
      {row.amount} {tokenLabel(row)} → {row.target_type === 'hashtag' ? '#' + row.target_value : row.target_type === 'x_account' ? '@' + row.target_value : short(row.target_value)}
    </b>
  )
}

// `error` is deliberately rendered *before* the empty state and never folded
// into it: a failed fetch resolves to zero rows here, and showing "no pending
// requests yet" for that told users their signature wasn't needed when it was.
// Same class of bug as the case-sensitive wallet match fixed backend-side --
// zero rows must never be reported as "nothing to do" unless the server
// actually said so.
function Pending({ rows, loading, error, onRetry, busyId, sign, dismiss }) {
  return (
    <div className="fade-in">
      <div className="card pad-lg claim" style={{ marginBottom: '1rem' }}>
        <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>From the X bot or DApp</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          Mention or DM <b>@TagioPayBot</b> — e.g. "send 0.001 eth to @handle", "send 5 usdg to #hashtag",
          "send 0.01 eth to 0x...", or "swap 0.5 eth to GOOGL". The bot never signs anything itself;
          each recognized request shows up below for you to review and sign with your own wallet.
        </p>
      </div>
      {loading ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>Loading pending requests…</p></div>
      ) : error && rows.length === 0 ? (
        <div className="card pad-lg">
          <div className="status bad">{I.x} {error}</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: '0.6rem 0 0.9rem', lineHeight: 1.5 }}>
            Couldn't load your pending requests — this is a loading problem, not an empty list.
            Anything waiting on your signature is still there.
          </p>
          <button className="btn sm" onClick={onRetry}>Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No pending requests yet — send the bot a mention or DM to create one.</p></div>
      ) : (
        <div className="card pad-lg">
          {/* A failed *poll* keeps the last good rows (react-query retains data on
              error), so they stay listed and the staleness is called out inline
              rather than replacing them with an error card. */}
          {error && (
            <div className="status bad" style={{ marginBottom: '0.75rem' }}>
              {I.x} Couldn't refresh just now — this list may be out of date. <button className="btn ghost sm" style={{ marginLeft: '0.5rem' }} onClick={onRetry}>Retry</button>
            </div>
          )}
          {rows.map((row) => (
            <div key={row.id} className="act-row" style={{ gridTemplateColumns: '2rem 1fr auto', alignItems: 'center' }}>
              <span className="act-ic in">{I.clock}</span>
              <div>
                <PendingRowLabel row={row} />
                {row.source && row.source !== 'x_bot' && (
                  <span className="pill ok" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>🎉 unlocked from a past {row.source}</span>
                )}
                <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }}>
                  {row.kind === 'swap' && row.quote_route && <>{row.quote_route} · </>}
                  {row.kind === 'swap' && row.price_impact_pct != null && Math.abs(Number(row.price_impact_pct)) > 3 && (
                    <span style={{ color: 'var(--red, #c0392b)' }}>high price impact (~{Math.abs(Number(row.price_impact_pct)).toFixed(1)}%) · </span>
                  )}
                  {fmtWhen(row.created_at)}
                  {row.tweet_url && <> · <TweetLink url={row.tweet_url} /></>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn ghost sm" disabled={busyId === row.id} onClick={() => dismiss(row)}>Dismiss</button>
                <button className="btn sm" disabled={busyId === row.id} onClick={() => sign(row)}>{busyId === row.id ? 'Signing…' : 'Sign & send'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// On-load nudge, bottom-right: the moment you land, the request closest to
// expiring surfaces as a non-blocking toast with a live countdown to its 24h
// window -- so anything waiting on your signature is visible without a
// blocking modal. "Complete now" jumps to the full Pending tab; dismissing
// just hides the current batch for this visit (it declines nothing, and a
// newly-arrived request re-surfaces it). Pairs with the browser push
// notification fired from the dashboard when a request first appears.
function PendingNudge({ rows, notifPerm, onComplete, onDismiss, onEnableAlerts }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  // Soonest-to-expire first; rows carrying an expiry win over any that lack one.
  const withExpiry = rows.filter((r) => r.expires_at)
  const top = (withExpiry.length ? withExpiry : rows)
    .slice()
    .sort((a, b) => new Date(a.expires_at || a.created_at) - new Date(b.expires_at || b.created_at))[0]
  const expMs = top.expires_at ? new Date(top.expires_at).getTime() : null
  const createdMs = new Date(top.created_at).getTime()
  const remaining = expMs != null ? expMs - now : null
  const total = expMs != null ? Math.max(1, expMs - createdMs) : 1
  const pct = remaining != null ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 100
  const urgency = remaining == null ? 'ok' : remaining < 10 * 60000 ? 'crit' : remaining < 60 * 60000 ? 'warn' : 'ok'
  return (
    <div className={'pending-nudge ' + urgency} role="alert" aria-live="polite">
      <button className="pn-close" onClick={onDismiss} aria-label="Dismiss">{I.x}</button>
      <div className="pn-head"><span className="pn-ic">{I.clock}</span>Complete your transaction</div>
      <div className="pn-body"><PendingRowLabel row={top} /></div>
      {remaining != null ? (
        <div className="pn-timer">
          <div className="pn-bar"><span style={{ width: pct + '%' }} /></div>
          <div className="pn-meta">
            <span>{remaining > 0 ? 'Expires in ' + fmtCountdown(remaining) : 'Expired — dismiss or retry'}</span>
            {rows.length > 1 && <span>+{rows.length - 1} more waiting</span>}
          </div>
        </div>
      ) : rows.length > 1 && (
        <div className="pn-meta" style={{ marginTop: '0.6rem' }}><span>{rows.length} requests waiting</span></div>
      )}
      <div className="pn-actions">
        <button className="btn sm" onClick={onComplete}>Complete now <span className="circ">{I.chevron}</span></button>
        {notifPerm === 'default' && <button className="btn ghost sm" onClick={onEnableAlerts}>Enable alerts</button>}
      </div>
    </div>
  )
}

// Views backed by Robinhood-side state, which is keyed to an EVM address:
// handle ownership (the NFT), SimpleEscrow, and PrivateSendPool rows. Every
// other view is Solana-native and handles its own wallet prompt.
const EVM_GATED_VIEWS = new Set(['overview', 'handles', 'resolver', 'escrow', 'psend'])

const ROUTES = [
  { id: 'overview', label: 'Overview', icon: I.grid },
  { id: 'handles', label: 'Handles', icon: I.hash },
  { id: 'resolver', label: 'Resolver', icon: I.split },
  { id: 'send', label: 'Send', icon: I.send },
  { id: 'trade', label: 'xStocks', icon: I.trade },
  { id: 'causes', label: 'Causes', icon: I.heart },
  { id: 'escrow', label: 'Escrow', icon: I.shield },
  { id: 'psend', label: 'Private Send', icon: I.lock },
  { id: 'airdrops', label: 'Airdrops', icon: I.bolt },
  { id: 'recovery', label: 'Recovery', icon: I.key },
  { id: 'pending', label: 'Pending', icon: I.clock },
  { id: 'activity', label: 'Activity', icon: I.act },
  { id: 'x-commands', label: 'X commands', icon: I.terminal, to: '/x-commands-list' },
]

export default function Dashboard() {
  const [view, setView] = useState('overview')
  const [selected, setSelected] = useState('')
  const [toasts, setToasts] = useState([])
  const [drawer, setDrawer] = useState(false)
  const [renewing, setRenewing] = useState(null)
  const { address } = useAccount()
  const queryClient = useQueryClient()

  useEffect(() => {
    // dashboard uses a fixed 16px rem base; restore vw scaling for the marketing site on unmount
    document.documentElement.style.fontSize = '16px'
    return () => { document.documentElement.style.fontSize = '' }
  }, [])

  const { publicKey: solPublicKey, signMessage: solSignMessage } = useWallet()
  const solAddress = solPublicKey?.toBase58()

  // Auth gate: the moment a wallet is connected (including an auto-reconnect
  // on page load), automatically run the two-step wallet+X sign-in -- no
  // manual button. 'idle' -> no wallet connected yet. 'checking' covers both
  // the wallet-signature prompt and the backend round-trip. 'redirecting' is
  // the brief window before the browser navigates to X. Skips straight to
  // 'signed_in' if a valid-looking token is already stored, so this doesn't
  // re-run every visit. "Valid-looking" means unexpired, not merely present:
  // trusting presence alone left the dashboard sitting on a dead 7-day JWT,
  // rendering as signed-in while every authed request 401'd (which the Pending
  // tab then showed as an empty list).
  const [authStatus, setAuthStatus] = useState(() => (getLiveAuthToken() ? 'signed_in' : 'idle'))
  const [authError, setAuthError] = useState('')
  const [authAttempt, setAuthAttempt] = useState(0)
  // The linked X handle for the active-user pill (spec Module 2). Sign-in
  // already returns it; it was simply being thrown away. Seeded from the JWT so
  // it survives a reload that short-circuits straight to 'signed_in'.
  const [xHandle, setXHandle] = useState(() => getCachedXHandle())

  // Identity is the Solana wallet: it signs an ed25519 message which the
  // backend verifies via tweetnacl (verifyWalletSignature already branches on
  // isSolanaAddress). The EVM wallet is no longer part of signing in.
  useEffect(() => {
    if (!solPublicKey || !solSignMessage) { setAuthStatus('idle'); return }
    // getLiveAuthToken (not getAuthToken) so an expired token falls through to a
    // fresh sign-in here instead of short-circuiting into 'signed_in'.
    if (getLiveAuthToken()) { setAuthStatus('signed_in'); return }

    let cancelled = false
    setAuthStatus('checking')
    setAuthError('')
    signInWithSolana(solPublicKey, solSignMessage)
      .then((result) => {
        if (cancelled) return
        if (result.status === 'signed_in' && result.xHandle) setXHandle(result.xHandle)
        setAuthStatus(result.status === 'signed_in' ? 'signed_in' : 'redirecting')
      })
      .catch((err) => {
        if (cancelled) return
        setAuthStatus('error')
        setAuthError(friendlyError(err))
      })
    return () => { cancelled = true }
  }, [solAddress, authAttempt])

  // Ownership now comes from the indexer's own reverse lookup (GET
  // /hashtags?owner=), so a handle registered on another device shows up here
  // too -- the localStorage list is kept only as a supplement for a handle
  // registered seconds ago that the indexer hasn't caught yet. The list
  // endpoint returns bare hashtag rows, so each name is still hydrated through
  // /hashtags/:name for its payouts and socials.
  const handlesQuery = useQuery({
    queryKey: ['owned-handles', address],
    enabled: Boolean(address),
    queryFn: async () => {
      const [owned, tracked] = await Promise.all([
        getHashtagsByOwner({ data: address }).catch(() => []),
        Promise.resolve(loadTracked(address)),
      ])
      const names = Array.from(new Set([...owned.map((r) => r.hashtag), ...tracked]))
      const records = await Promise.all(names.map((n) => getHashtag({ data: n }).catch(() => null)))
      return records.filter((r) => r && r.active && r.owner_wallet?.toLowerCase() === address.toLowerCase())
    },
  })
  const handles = (handlesQuery.data || []).map(toHandle)
  const handleNames = handles.map((h) => h.name)

  const activityQuery = useQuery({
    queryKey: ['owned-activity', handleNames.join(',')],
    enabled: handleNames.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(handleNames.map((n) => getHashtagTransactions({ data: n }).catch(() => [])))
      return lists
        .flatMap((txs, i) => txs.map((tx) => ({ ...tx, hashtag: handleNames[i] })))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    },
  })
  const activity = activityQuery.data || []

  // Spec Module 2's "active escrows & open causes count". Both are Robinhood
  // -side reads keyed to the EVM address, so they stay undefined (rendered as
  // "—") rather than 0 when no EVM wallet is connected -- zero would read as
  // "you have none", which isn't what we know.
  const overviewEscrowsQuery = useQuery({
    queryKey: ['escrows', address],
    queryFn: () => getEscrows({ data: address }),
    enabled: Boolean(address),
  })
  const overviewCausesQuery = useQuery({ queryKey: ['causes'], queryFn: getCauses })
  const overviewCounts = {
    escrows: overviewEscrowsQuery.data
      ? overviewEscrowsQuery.data.filter((e) => e.status === 'Created' || e.status === 'Accepted' || e.status === 'Delivered').length
      : undefined,
    // bigOr0 rather than a bare BigInt(): these are uint256 strings straight
    // from the API, and a single malformed one would throw *during render* of
    // the default view, taking the whole dashboard to the error boundary over a
    // stat tile. A cause with goal 0 is open-ended, so it counts as open.
    causes: overviewCausesQuery.data
      ? overviewCausesQuery.data.filter((c) => {
          const goal = bigOr0(c.goal)
          return goal === 0n || bigOr0(c.totalRaised) < goal
        }).length
      : undefined,
  }

  const go = (r) => { setView(r); setDrawer(false) }
  const toast = (msg) => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, msg }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200) }

  // Shared by the Pending tab and the on-load modal -- one fetch, one
  // sign/dismiss implementation, so they can never show conflicting state.
  // Polls on its own so a request created by the bot/DApp while the
  // dashboard's already open shows up (badge + modal) without a refresh.
  // Keyed and gated on the *Solana* wallet, not the EVM one: the endpoint
  // authenticates off the JWT, and that JWT is minted for whichever address
  // signed in -- which is the Solana key. Gating on `address` meant a
  // Phantom-only user (the spec's whole target) never fetched their pending
  // requests at all, and the tab sat empty rather than unauthenticated.
  const pendingQuery = useQuery({
    queryKey: ['pending-transactions', solAddress],
    enabled: Boolean(solAddress) && authStatus === 'signed_in',
    queryFn: () => getPendingTransactions({ data: { token: getLiveAuthToken() } }),
    refetchInterval: 20000,
  })
  const pendingRows = pendingQuery.data || []
  // On error `data` is undefined, so pendingRows is [] -- indistinguishable from
  // a genuinely empty list unless the failure is carried separately. This is the
  // one place that distinction is made; everything downstream (tab, badge,
  // nudge, notification) reads pendingRows.
  const pendingError = pendingQuery.isError ? friendlyError(pendingQuery.error) : ''
  const [pendingBusyId, setPendingBusyId] = useState(null)
  // Dismissing the modal only needs to hide it for the requests it was
  // actually shown for -- tracked by id, not a single blanket flag, so a
  // *new* request arriving later (via the poll above) still pops the modal
  // even if an earlier batch was already dismissed this session.
  const [dismissedPendingIds, setDismissedPendingIds] = useState(() => new Set())
  // Browser push-notification permission (synced after mount to dodge an
  // SSR/hydration mismatch on the "Enable alerts" button), and the ids we've
  // already fired an OS notification for this session so a re-poll doesn't spam.
  const [notifPerm, setNotifPerm] = useState('unsupported')
  const notifiedRef = useRef(new Set())
  const hasUndismissedPending = pendingRows.some((r) => !dismissedPendingIds.has(r.id))
  const dismissPendingModal = () => setDismissedPendingIds((prev) => new Set([...prev, ...pendingRows.map((r) => r.id)]))
  const refreshPending = () => queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })

  // A 401 means the session is over, not that there's nothing to show. Drop the
  // dead token and re-run sign-in so the user gets the AuthGate rather than a
  // Pending tab that quietly reports zero requests forever (the old behaviour:
  // authStatus stayed 'signed_in' off a stale token, so nothing ever recovered
  // and nothing ever cleared it). Capped at one automatic retry per mount -- if
  // a freshly-minted token also 401s, that's a backend/secret problem and
  // re-prompting the wallet on a loop would only make it worse, so it surfaces
  // as an error with a manual "Try again" instead.
  const sessionRecoveredRef = useRef(false)
  useEffect(() => {
    if (!pendingQuery.isError || !isSessionExpiredError(pendingQuery.error)) return
    clearAuthToken()
    if (sessionRecoveredRef.current) {
      setAuthStatus('error')
      setAuthError(SESSION_EXPIRED_MESSAGE)
      return
    }
    sessionRecoveredRef.current = true
    setAuthStatus('idle')
    setAuthAttempt((n) => n + 1)
  }, [pendingQuery.isError, pendingQuery.error])

  const signPending = async (row) => {
    const token = getLiveAuthToken()
    setPendingBusyId(row.id)
    try {
      const primary = { to: row.unsigned_to, data: row.unsigned_data, value: row.unsigned_value }
      // Any kind can carry a non-empty `approvals` array (escrow and cause
      // donations need one for a USDG amount, same as a swap does) -- only
      // 'swap' and 'disperse' were ever routed through the approvals-then-
      // primary sequence, so every other kind silently skipped its own
      // approval and went straight to the primary call. That call's internal
      // transferFrom then reverted for lack of allowance (confirmed live
      // 2026-07-29: a USDG escrow creation failed with "transaction reverted"
      // in Rainbow's simulation for exactly this reason). signAndConfirmSteps
      // degrades to "just send primary" when approvals/extra_steps are both
      // empty, so it's safe as the universal non-swap path.
      const hash = row.kind === 'swap'
        ? await signAndConfirmSwapPlan({ approvals: row.approvals || [], swap: primary })
        : await signAndConfirmSteps([...(row.approvals || []), primary, ...(row.extra_steps || [])])
      await broadcastPendingTransaction({ data: { token, id: row.id, txHash: hash } })
      toast(`Sent · pending request #${row.id} settled onchain`)
      refreshPending()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setPendingBusyId(null)
    }
  }

  const dismissPending = async (row) => {
    const token = getLiveAuthToken()
    setPendingBusyId(row.id)
    try {
      await cancelPendingTransaction({ data: { token, id: row.id } })
      toast(`Dismissed pending request #${row.id}`)
      refreshPending()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setPendingBusyId(null)
    }
  }
  const refresh = (name) => {
    const acct = getAccount(wagmiConfig).address
    if (name && acct) addTracked(acct, name)
    queryClient.invalidateQueries({ queryKey: ['owned-handles'] })
    queryClient.invalidateQueries({ queryKey: ['owned-activity'] })
  }
  const handle = handles.find((h) => h.name === selected) || handles[0]
  const manage = (n) => { setSelected(n); go('resolver') }
  const renew = async (n) => {
    setRenewing(n)
    try {
      await renewOnchain({ hashtag: n })
      toast(`#${n} renewed onchain · +30 days`)
      refresh()
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setRenewing(null)
    }
  }

  // Reflect the real notification permission once mounted (kept out of the
  // initial state so the server and first client render agree).
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setNotifPerm(Notification.permission)
  }, [])

  // Fire an OS push notification for each request we haven't announced yet, so
  // "complete the transaction" reaches you even when this tab isn't focused.
  // Permission is requested opportunistically here; the gesture-driven "Enable
  // alerts" button on the nudge is the reliable path when a browser suppresses
  // the un-prompted request. The in-app nudge is always the guaranteed channel.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const fresh = pendingRows.filter((r) => !notifiedRef.current.has(r.id))
    if (fresh.length === 0) return
    fresh.forEach((r) => notifiedRef.current.add(r.id))
    const fire = () => {
      const n = new Notification('Transaction waiting for your signature', {
        body: describePendingText(fresh[0]) + (fresh.length > 1 ? ` · +${fresh.length - 1} more` : ''),
        icon: '/favicon.png',
        tag: 'tagio-pending',
      })
      n.onclick = () => { window.focus(); go('pending'); n.close() }
    }
    if (Notification.permission === 'granted') fire()
    else if (Notification.permission === 'default') Notification.requestPermission().then((perm) => { setNotifPerm(perm); if (perm === 'granted') fire() })
  }, [pendingRows])

  const enableAlerts = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    Notification.requestPermission().then((perm) => {
      setNotifPerm(perm)
      if (perm === 'granted' && pendingRows[0]) {
        const n = new Notification("Alerts on — we'll ping you here", { body: describePendingText(pendingRows[0]), icon: '/favicon.png', tag: 'tagio-pending' })
        n.onclick = () => { window.focus(); go('pending'); n.close() }
      }
    })
  }

  const titles = {
    overview: ['Overview', 'Your name-native money at a glance'],
    handles: ['Handles', 'The names you own on Robinhood Chain'],
    resolver: ['Resolver', handle ? `Routing & identity for #${handle.name}` : 'Routing & identity'],
    send: ['Send', 'One box — a #handle, an @X user, or a Solana address'],
    trade: ['xStocks', 'Swap SOL or USDC for tokenized US equities, natively on Solana'],
    airdrops: ['Airdrops', 'Mass giveaways and airdrops, dispersed in a single transaction'],
    recovery: ['Recovery', 'Restore a handle to a new wallet with its recovery phrase'],
    causes: ['Causes', 'Public, transparent donations with on-chain receipts'],
    escrow: ['Escrow', 'Create -> Accept -> Deliver -> Release, for freelance and any bilateral deal'],
    psend: ['Private Send', "Shields your identity from the recipient -- their wallet only ever sees TagioPay's pool, never yours"],
    pending: ['Pending', 'Requests from the X bot or DApp, waiting on your signature'],
    activity: ['Activity', 'Indexed onchain payments per hashtag'],
  }

  return (
    <div id="app">
      <div className="app">
        <div className={'scrim ' + (drawer ? 'show' : '')} onClick={() => setDrawer(false)}></div>
        <aside className={'sidebar ' + (drawer ? 'open' : '')}>
          <Link className="brand" to="/"><span className="brand-logo" role="img" aria-label="Tagio"></span></Link>
          <nav className="nav">{ROUTES.map((r) => r.to
            ? <Link key={r.id} className="nav-item" to={r.to}>{r.icon}{r.label}</Link>
            : (
              <button key={r.id} className={'nav-item ' + (view === r.id ? 'active' : '')} onClick={() => go(r.id)}>
                {r.icon}{r.label}
                {r.id === 'pending' && pendingRows.length > 0 && <span className="nav-badge">{pendingRows.length}</span>}
              </button>
            )
          )}</nav>
          <div className="side-spacer"></div>
          <div className="net-chip"><span className="live"></span>Solana Mainnet</div>
          <WalletControl variant="chip" />
        </aside>
        <main className="main">
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <button className="menu-btn" onClick={() => setDrawer(true)}>{I.menu}</button>
              <div className="title"><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div>
            </div>
            <div className="actions">
              {view === 'resolver' && handles.length > 0 && (<div className="handle-select"><span style={{ color: 'var(--green)' }}>#</span><select value={handle?.name || ''} onChange={(e) => setSelected(e.target.value)}>{handles.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}</select></div>)}
              {/* Spec Module 2's active-user pill: the connected Solana key,
                  its linked X handle, and the network it's executing on. */}
              {solAddress && (
                <div className="user-pill">
                  <span className="net-dot" aria-hidden="true"></span>
                  <span className="addr-mono">{solAddress.slice(0, 4)}…{solAddress.slice(-4)}</span>
                  {xHandle && (
                    <a href={`https://x.com/${xHandle}`} target="_blank" rel="noreferrer" className="x-badge">
                      <img src="/x.png" alt="" />@{xHandle}
                    </a>
                  )}
                  <span className="net-name">Solana</span>
                </div>
              )}
              <button className="btn" onClick={() => go('handles')}>Claim handle <span className="circ">{I.chevron}</span></button>
            </div>
          </div>
          <div className="content">
            {/* Views that run entirely on Solana carry their own connect
                prompts, so they must not be gated on an EVM wallet -- doing so
                hid the whole Solana-native half of the product from exactly the
                Phantom/Solflare user the spec targets. Only the views that read
                or write Robinhood-side state (handle ownership, escrows,
                private sends) still need `address`. */}
            {!address && EVM_GATED_VIEWS.has(view) ? (
              <ConnectPrompt />
            ) : (
              <>
                {view === 'overview' && <Overview handles={handles} activity={activity} loading={handlesQuery.isLoading} go={go} manage={manage} renew={renew} renewing={renewing} escrowCount={overviewCounts.escrows} causeCount={overviewCounts.causes} />}
                {view === 'handles' && <Handles handles={handles} loading={handlesQuery.isLoading} manage={manage} renew={renew} renewing={renewing} toast={toast} refresh={refresh} />}
                {view === 'resolver' && (handle
                  ? <Resolver key={handle.name} handle={handle} toast={toast} onSaved={refresh} />
                  : <div className="card pad-lg fade-in"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>{handlesQuery.isLoading ? 'Loading your handles…' : 'No handles to configure yet — claim one first.'}</p></div>)}
                {view === 'send' && <Send toast={toast} />}
                {view === 'trade' && <Trade toast={toast} />}
                {/* isPending, not isLoading: a *disabled* query (auth still in flight) has
                    isLoading === false in react-query v5, which rendered the "nothing
                    pending" copy for a fetch that had never actually run. isPending stays
                    true until the query genuinely resolves. */}
                {view === 'pending' && <Pending rows={pendingRows} loading={pendingQuery.isPending} error={pendingError} onRetry={refreshPending} busyId={pendingBusyId} sign={signPending} dismiss={dismissPending} />}
                {view === 'causes' && <Causes toast={toast} />}
                {view === 'escrow' && <Escrow toast={toast} />}
                {view === 'psend' && <PrivateSend toast={toast} />}
                {view === 'airdrops' && <Airdrops toast={toast} pendingRows={pendingRows} onGoToPending={() => go('pending')} />}
                {view === 'recovery' && <Recovery toast={toast} evmAddress={address} />}
                {view === 'activity' && <Activity />}
              </>
            )}
          </div>
        </main>
        <div className="toasts">
          {authStatus === 'signed_in' && hasUndismissedPending && view !== 'pending' && (
            <PendingNudge
              rows={pendingRows.filter((r) => !dismissedPendingIds.has(r.id))}
              notifPerm={notifPerm}
              onComplete={() => go('pending')}
              onDismiss={dismissPendingModal}
              onEnableAlerts={enableAlerts}
            />
          )}
          {toasts.map((t) => <div className="toast" key={t.id}><span className="dot"></span>{t.msg}</div>)}
        </div>
      </div>
      {address && authStatus !== 'signed_in' && (
        <AuthGate status={authStatus} error={authError} onRetry={() => setAuthAttempt((n) => n + 1)} />
      )}
    </div>
  )
}
