import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { formatUnits } from 'viem'
import { checkHashtag, getHashtag, resolveHashtag, getHashtagTransactions, getPendingTransactions, broadcastPendingTransaction, cancelPendingTransaction, getSwapTokens, getSwapQuote, getSwapPlan, getWalletBalances, getCauses, getCauseLeaderboard, getEscrows, getPrivateSends, createPrivateSend, claimPrivateSend } from '../lib/tagio'
import { registerOnchain, renewOnchain, payOnchain, updatePayoutsOnchain, updateMetadataOnchain, signPendingTransaction, signAndConfirmSwapPlan, signAndConfirmSteps, createCauseOnchain, donateToCauseOnchain, withdrawFromCauseOnchain, createEscrowOnchain, acceptEscrowOnchain, cancelEscrowOnchain, deliverEscrowOnchain, releaseEscrowOnchain, forceReleaseEscrowOnchain, refundEscrowOnchain, friendlyError } from '../lib/resolver-actions'
import { wagmiConfig } from '../lib/wagmi'
import { WalletControl } from '../components/WalletControl'
import { signInWithWallet, getAuthToken } from '../lib/auth'

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

const SOCIAL_KEYS = [['x', 'X'], ['telegram', 'Telegram'], ['discord', 'Discord']]
const socialsToObj = (list) => {
  const o = { x: '', telegram: '', discord: '' }
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
function Overview({ handles, activity, loading, go, manage, renew, renewing }) {
  const now = Date.now()
  const recent = activity.filter((tx) => now - new Date(tx.timestamp).getTime() < 30 * DAY_MS)
  const totalIn30d = recent.reduce((s, tx) => s + ethOf(tx), 0)
  const recips = handles.reduce((s, h) => s + h.splits.length, 0)
  const volume = handles.reduce((s, h) => s + h.volumeUsd, 0)
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
        <Stat icon={I.hash} label="Active handles" value={handles.length} sub={loading ? 'Loading…' : 'All resolving'} />
        <Stat icon={I.split} label="Split recipients" value={recips} sub="Across all handles" />
        <Stat icon={I.bolt} label="Total volume" value={'$' + fmt(volume)} sub="Lifetime, all handles" />
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
  const doRegister = async () => {
    const name = norm
    setReg({ status: 'busy' })
    try {
      await registerOnchain({ hashtag: name, name })
      setReg({ status: 'done', name })
      setQ('')
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
        {state === 'available' && <button className="btn sm" disabled={reg.status === 'busy'} onClick={doRegister}>{reg.status === 'busy' ? 'Confirm in wallet…' : 'Register'}</button>}
      </div>
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
  const [save, setSave] = useState({ status: 'idle' })
  useEffect(() => {
    setSplits(handle.splits.map((s) => ({ ...s }))); setSocials({ ...handle.socials }); setSave({ status: 'idle' })
  }, [handle.name])
  const totalPct = splits.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0)
  const totalBps = Math.round(totalPct * 100)
  const walletsOk = splits.every((r) => ADDR_RE.test(r.wallet.trim()))
  const valid = totalBps === 10000 && walletsOk
  const setRow = (id, key, val) => setSplits(splits.map((r) => (r.id === id ? { ...r, [key]: val } : r)))
  const addRow = () => setSplits([...splits, { id: Date.now(), wallet: '', pct: 0 }])
  const delRow = (id) => setSplits(splits.filter((r) => r.id !== id))
  const distribute = () => { const n = splits.length, base = Math.floor(10000 / n); setSplits(splits.map((r, i) => ({ ...r, pct: (base + (i === n - 1 ? 10000 - base * n : 0)) / 100 }))) }
  const splitsChanged = JSON.stringify(splits.map((r) => [r.wallet.trim().toLowerCase(), Math.round((parseFloat(r.pct) || 0) * 100)])) !== JSON.stringify(handle.splits.map((r) => [r.wallet.toLowerCase(), Math.round(r.pct * 100)]))
  const socialsChanged = JSON.stringify(socials) !== JSON.stringify(handle.socials)
  const doSave = async () => {
    setSave({ status: 'busy' })
    try {
      if (splitsChanged) {
        await updatePayoutsOnchain({
          hashtag: handle.name,
          payouts: splits.map((r) => ({ wallet: r.wallet.trim(), percentageBps: Math.round((parseFloat(r.pct) || 0) * 100) })),
        })
      }
      if (socialsChanged) {
        await updateMetadataOnchain({
          hashtag: handle.name,
          name: record.name || handle.name,
          imageUrl: record.image_url || '',
          websiteUrl: record.website_url || '',
          socials: SOCIAL_KEYS.filter(([k]) => socials[k]).map(([k]) => ({ key: k, value: socials[k] })),
        })
      }
      setSave({ status: 'idle' })
      toast(`Resolver config saved onchain for #${handle.name}`)
      onSaved?.()
    } catch (e) {
      setSave({ status: 'error', message: friendlyError(e) })
    }
  }
  const dirty = splitsChanged || socialsChanged
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
          <button className="btn ghost sm" onClick={addRow} style={{ marginTop: '0.25rem' }}>+ Add recipient</button>
          <div className={'split-total ' + (valid ? 'ok' : 'bad')}><span>{!walletsOk ? 'Every recipient needs a valid 0x address' : valid ? 'Splits balanced' : (totalPct > 100 ? 'Over by ' + (totalPct - 100).toFixed(1) + '%' : 'Remaining ' + (100 - totalPct).toFixed(1) + '%')}</span><span>{totalPct.toFixed(1)}% <span className="bps">· {totalBps} / 10000 bps</span></span></div>
        </div>
        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>Identity</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '0.5rem' }}>Social handles</h2>
          {SOCIAL_KEYS.map(([k, l]) => (
            <div className="social-row" key={k}>
              <div className="left"><span className="ic">{l[0]}</span><input value={socials[k]} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })} placeholder={'Add ' + l} /></div>
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
        <button className="btn" disabled={!valid || !dirty || save.status === 'busy'} onClick={doSave} style={{ justifyContent: 'center' }}>{save.status === 'busy' ? 'Confirm in wallet…' : !dirty ? 'Everything saved onchain' : valid ? 'Save resolver config onchain' : 'Fix splits to save'}<span className="circ">{I.chevron}</span></button>
        {save.status === 'error' && <div className="split-total bad">{save.message}</div>}
      </div>
    </div>
  )
}
function Send({ toast }) {
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [resolved, setResolved] = useState(null)
  const [resolving, setResolving] = useState(false)
  const [pay, setPay] = useState({ status: 'idle' })
  const norm = to.replace(/^[#@]+/, '').toLowerCase().trim()
  const amt = parseFloat(amount) || 0
  const resolve = async () => {
    setResolving(true)
    try {
      const r = await resolveHashtag({ data: norm })
      setResolved(r || { error: '#' + norm + ' is not registered (or has expired) on Robinhood Chain' })
    } catch {
      setResolved({ error: 'Resolution failed — check your connection and try again' })
    } finally {
      setResolving(false)
    }
  }
  const sendOnchain = async () => {
    setPay({ status: 'busy' })
    try {
      await payOnchain({ hashtag: resolved.hashtag, amountEth: String(amt) })
      setPay({ status: 'done' })
      toast(`Sent ${fmt(amt)} ETH to #${resolved.hashtag}`)
    } catch (e) {
      setPay({ status: 'error', message: friendlyError(e) })
    }
  }
  useEffect(() => { setResolved(null); setPay({ status: 'idle' }) }, [to, amount])
  return (
    <div className="grid two fade-in" style={{ alignItems: 'start' }}>
      <div className="card pad-lg">
        <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>Pay by name</div>
        <div className="form-row">
          <label className="field-label">To</label>
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '0.35rem 0.35rem 0.35rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--green)', fontSize: '1.1rem' }}>#</span>
            <input value={to.replace(/^[#@]/, '')} onChange={(e) => setTo(e.target.value)} placeholder="handle" spellCheck="false" style={{ flex: 1, border: 'none', outline: 'none', fontSize: '1rem', background: 'none' }} />
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: '0.4rem' }}>Any registered hashtag resolves to its live onchain routing.</div>
        </div>
        <div className="form-row">
          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><TokenIcon symbol="ETH" size="1rem" /> Amount (native ETH)</label>
          <input className="input mono" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <button className="btn" disabled={!NAME_RE.test(norm) || amt <= 0 || resolving} onClick={resolve} style={{ justifyContent: 'center', width: '100%' }}>{resolving ? 'Resolving…' : 'Resolve'} <span className="circ">{I.chevron}</span></button>
        {resolved && resolved.error && (<div className="split-total bad" style={{ marginTop: '1rem' }}>{resolved.error}</div>)}
        {resolved && !resolved.error && (
          <div className="send-preview">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}><span className="eyebrow">Resolved · live</span><span className="pill ok"><span className="dot"></span>#{resolved.hashtag}</span></div>
            <div className="route-line"><div className="who"><b>Primary destination</b></div><span className="addr-mono">{short(resolved.primaryDestination)}</span></div>
            {resolved.payouts.map((p, i) => (
              <div className="route-line" key={i}><div className="who"><b>Recipient {i + 1}</b><span className="addr-mono">{short(p.wallet)}</span></div><span className="amt">{fmt(amt * p.percentage_bps / 10000)} ETH <span style={{ color: 'var(--ink-faint)', fontWeight: 400, fontSize: '0.8rem' }}>· {(p.percentage_bps / 100).toFixed(1)}%</span></span></div>
            ))}
            {pay.status !== 'done' && (
              <button className="btn" disabled={pay.status === 'busy'} onClick={sendOnchain} style={{ justifyContent: 'center', width: '100%', marginTop: '1rem' }}>{pay.status === 'busy' ? 'Confirm in wallet…' : `Send ${fmt(amt)} ETH onchain`}<span className="circ">{I.check}</span></button>
            )}
            {pay.status === 'error' && (<div className="split-total bad" style={{ marginTop: '0.75rem' }}>{pay.message}</div>)}
            {pay.status === 'done' && (<div className="split-total ok" style={{ marginTop: '0.75rem' }}>Payment settled onchain · indexed by the backend</div>)}
            <Link className="btn ghost" to="/h/$name" params={{ name: resolved.hashtag }} style={{ justifyContent: 'center', width: '100%', marginTop: '0.75rem' }}>View #{resolved.hashtag} record <span className="circ">{I.chevron}</span></Link>
          </div>
        )}
      </div>
      <WalletPanel />
    </div>
  )
}
function fmtBalance(b) {
  const n = Number(formatUnits(BigInt(b.balance), b.decimals))
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 5 : 2 })
}

function WalletPanel() {
  const { address, isConnected } = useAccount()
  // Sign-in itself is triggered automatically at the Dashboard level (see
  // AuthGate) the moment a wallet connects -- this panel just reflects the
  // outcome, it never triggers anything itself.
  const signedIn = Boolean(getAuthToken())

  const balancesQuery = useQuery({
    queryKey: ['wallet-balances', address],
    enabled: Boolean(address),
    queryFn: () => getWalletBalances({ data: { address } }),
    refetchInterval: 30000,
  })
  const balances = balancesQuery.data || []
  // ETH/USDG always shown for context; stocks only when actually held, so
  // this doesn't turn into a wall of zero-balance tickers.
  const shown = balances.filter((b) => b.native || b.symbol === 'USDG' || BigInt(b.balance) > 0n)

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
            <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Your assets on Robinhood</div>
            {balancesQuery.isLoading ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Loading balances…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                {shown.map((b) => (
                  <div key={b.symbol} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                    <TokenIcon symbol={b.symbol} />
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
function Trade({ toast }) {
  const { address } = useAccount()
  const [tokens, setTokens] = useState({ swapIn: [], stocks: [] })
  const [direction, setDirection] = useState('buy') // 'buy' | 'sell'
  const [currency, setCurrency] = useState('USDG')
  const [stock, setStock] = useState('')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoting, setQuoting] = useState(false)
  const [trade, setTrade] = useState({ status: 'idle' }) // idle | planning | approving | signing | done | error

  useEffect(() => { getSwapTokens().then(setTokens).catch(() => {}) }, [])
  useEffect(() => { if (tokens.stocks.length > 0 && !stock) setStock(tokens.stocks[0].symbol) }, [tokens, stock])
  useEffect(() => { setQuote(null); setTrade({ status: 'idle' }) }, [direction, currency, stock, amount])

  const fromSymbol = direction === 'buy' ? currency : stock
  const toSymbol = direction === 'buy' ? stock : currency
  const amt = parseFloat(amount) || 0
  // abs(), not just > 3: on a very thin pool the reference (1-unit) quote
  // itself can be distorted enough to swing priceImpactPct sharply negative
  // (confirmed live -- a thin TSLA pool briefly quoted -762%) rather than
  // near zero. That's not "a great deal," it's the metric breaking down on
  // low depth -- exactly the situation this warning exists to catch.
  const highImpact = quote && Math.abs(quote.priceImpactPct) > 3

  const getQuote = async () => {
    setQuoting(true)
    try {
      const q = await getSwapQuote({ data: { fromSymbol, toSymbol, amountIn: amt } })
      setQuote(q || { error: true })
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setQuoting(false)
    }
  }

  const doSwap = async () => {
    setTrade({ status: 'planning' })
    try {
      const plan = await getSwapPlan({ data: { fromSymbol, toSymbol, amountIn: amt, walletAddress: address } })
      if (!plan) {
        setTrade({ status: 'error', message: 'No liquidity route for this pair yet' })
        return
      }
      setTrade({ status: plan.approvals.length > 0 ? 'approving' : 'signing' })
      await signAndConfirmSwapPlan(plan)
      setTrade({ status: 'done' })
      toast(`Swapped ${fmt(amt)} ${fromSymbol} for ${toSymbol}`)
    } catch (e) {
      setTrade({ status: 'error', message: friendlyError(e) })
    }
  }

  const busy = trade.status === 'planning' || trade.status === 'approving' || trade.status === 'signing'
  const tradeLabel =
    trade.status === 'planning' ? 'Building trade…'
    : trade.status === 'approving' ? 'Confirm approval in wallet…'
    : trade.status === 'signing' ? 'Confirm swap in wallet…'
    : 'Swap'

  return (
    <div className="grid two fade-in" style={{ alignItems: 'start' }}>
      <div className="card pad-lg">
        <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>Trade RWA stocks</div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className={'btn sm' + (direction === 'buy' ? '' : ' ghost')} onClick={() => setDirection('buy')}>Buy</button>
          <button className={'btn sm' + (direction === 'sell' ? '' : ' ghost')} onClick={() => setDirection('sell')}>Sell</button>
        </div>
        <div className="form-row">
          <label className="field-label">{direction === 'buy' ? 'Pay with' : 'Receive'}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TokenIcon symbol={currency} />
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="ETH">ETH</option>
              <option value="USDG">USDG</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <label className="field-label">{direction === 'buy' ? 'Buy' : 'Sell'}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TokenIcon symbol={stock} />
            <select className="input" value={stock} onChange={(e) => setStock(e.target.value)}>
              {tokens.stocks.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <label className="field-label">Amount ({fromSymbol || '...'})</label>
          <input className="input mono" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <button className="btn" disabled={amt <= 0 || !stock || quoting} onClick={getQuote} style={{ justifyContent: 'center', width: '100%' }}>
          {quoting ? 'Getting quote…' : 'Get quote'} <span className="circ">{I.chevron}</span>
        </button>
        {quote && quote.error && (<div className="split-total bad" style={{ marginTop: '1rem' }}>No liquidity route for this pair yet.</div>)}
        {quote && !quote.error && (
          <div className="send-preview">
            <div className="route-line"><div className="who"><b>You'll receive</b></div><span className="amt" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><TokenIcon symbol={toSymbol} size="1rem" /> ≈ {fmt(Number(quote.amountOut))} {toSymbol}</span></div>
            <div className="route-line"><div className="who"><b>Route</b></div><span style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>{quote.route}</span></div>
            {highImpact && (
              <div className="split-total bad" style={{ marginTop: '0.5rem' }}>
                High price impact (~{Math.abs(quote.priceImpactPct).toFixed(2)}%) — this pool has limited liquidity, the actual fill may differ from this quote.
              </div>
            )}
            {trade.status !== 'done' && (
              <button className="btn" disabled={busy} onClick={doSwap} style={{ justifyContent: 'center', width: '100%', marginTop: '1rem' }}>
                {tradeLabel}<span className="circ">{I.check}</span>
              </button>
            )}
            {trade.status === 'error' && (<div className="split-total bad" style={{ marginTop: '0.75rem' }}>{trade.message}</div>)}
            {trade.status === 'done' && (<div className="split-total ok" style={{ marginTop: '0.75rem' }}>Swap settled onchain — indexed by the backend</div>)}
          </div>
        )}
      </div>
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

function CreatePrivateSend({ toast, onCreated }) {
  const [recipientHandle, setRecipientHandle] = useState('')
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState('usdg')
  const [busy, setBusy] = useState(false)

  const doCreate = async () => {
    const authToken = getAuthToken()
    if (!authToken) { toast('Sign in with X first'); return }
    setBusy(true)
    try {
      await createPrivateSend({ data: { token: authToken, recipientHandle: recipientHandle.replace(/^@/, ''), amount, sendToken: token } })
      toast(`Private send to @${recipientHandle.replace(/^@/, '')} created — sign it in the Pending tab`)
      setRecipientHandle(''); setAmount('')
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
        <input className="input" style={{ flex: '2 1 12rem' }} placeholder="@recipient" value={recipientHandle} onChange={(e) => setRecipientHandle(e.target.value)} />
        <input className="input" style={{ flex: '1 1 8rem' }} type="number" min="0" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="input" style={{ flex: '0 1 7rem' }} value={token} onChange={(e) => setToken(e.target.value)}>
          <option value="usdg">USDG</option>
          <option value="native">ETH</option>
        </select>
        <button className="btn sm" disabled={busy || !recipientHandle || !amount} onClick={doCreate}>{busy ? 'Sending…' : 'Send privately'}</button>
      </div>
    </div>
  )
}

const psendToken = (p) => (p.token === 'native' ? 'ETH' : 'USDG')
const psendDecimals = (p) => (p.token === 'native' ? 18 : 6)
const fmtPsendAmount = (p) => Number(p.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })

function PrivateSendRow({ row, address, toast, onChanged }) {
  const [busy, setBusy] = useState(false)
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
        {isSender && <>to {short(row.recipientWallet)} — their wallet only sees TagioPay's pool, not you</>}
        {isRecipient && <>from TagioPay's pool — the sender's own wallet is never shown</>}
        {row.claimedBy && <> · claimed by {row.claimedBy === 'keeper' ? "TagioPay's keeper" : 'you'}</>}
      </div>
      {isRecipient && row.status === 'sent' && (
        <button className="btn sm" disabled={busy} onClick={doClaim}>{busy ? 'Signing…' : 'Claim now (skip the keeper)'}</button>
      )}
    </div>
  )
}

function PrivateSend({ toast }) {
  const { address } = useAccount()
  const query = useQuery({ queryKey: ['private-sends', address], queryFn: () => getPrivateSends({ data: address }), enabled: !!address })
  const rows = query.data || []

  return (
    <div className="fade-in">
      <CreatePrivateSend toast={toast} onCreated={() => query.refetch()} />
      {query.isLoading ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>Loading private sends…</p></div>
      ) : rows.length === 0 ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No private sends yet — send one above, or use <code>$psend amount TOKEN to @handle</code> on X.</p></div>
      ) : (
        rows.map((row) => (
          <PrivateSendRow key={row.id} row={row} address={address} toast={toast} onChanged={() => query.refetch()} />
        ))
      )}
    </div>
  )
}

// Requests created by the X bot (a mention/DM like "send 5 usdg to @friend")
// land here as unsigned payloads -- the bot never signs anything itself. This
// view is where the loop actually closes: list -> sign with the connected
// wallet -> report the resulting tx_hash back so the backend can verify it
// landed onchain before marking it done.
// Shared by the Pending tab and the on-load PendingModal so the two never
// drift apart on how a row's headline reads.
function PendingRowLabel({ row }) {
  if (row.kind === 'swap') {
    return <b style={{ fontWeight: 500 }}>Swap {row.amount} {row.token} → {row.target_value}</b>
  }
  if (row.kind === 'deposit') {
    return (
      <b style={{ fontWeight: 500 }}>
        {row.amount} {row.token === 'native' ? 'ETH' : 'USDG'} → @{row.target_value} <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}>(escrowed until they link)</span>
      </b>
    )
  }
  if (row.kind === 'claim') {
    return <b style={{ fontWeight: 500 }}>Claim {row.amount} {row.token === 'native' ? 'ETH' : 'USDG'} from escrow</b>
  }
  return (
    <b style={{ fontWeight: 500 }}>
      {row.amount} {row.token === 'native' ? 'ETH' : 'USDG'} → {row.target_type === 'hashtag' ? '#' : row.target_type === 'x_account' ? '@' : ''}{row.target_value}
    </b>
  )
}

function Pending({ rows, loading, busyId, sign, dismiss }) {
  return (
    <div className="fade-in">
      <div className="card pad-lg claim" style={{ marginBottom: '1rem' }}>
        <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>From the X bot</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          Mention or DM <b>@TagioPayBot</b> — e.g. "send 0.001 eth to @handle", "send 5 usdg to #hashtag",
          "send 0.01 eth to 0x...", or "swap 0.5 eth to GOOGL". The bot never signs anything itself;
          each recognized request shows up below for you to review and sign with your own wallet.
        </p>
      </div>
      {loading ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>Loading pending requests…</p></div>
      ) : rows.length === 0 ? (
        <div className="card pad-lg"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No pending requests yet — send the bot a mention or DM to create one.</p></div>
      ) : (
        <div className="card pad-lg">
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
                  {row.tweet_url && (<> · <a href={row.tweet_url} target="_blank" rel="noreferrer" style={{ color: 'var(--green-deep)' }}>view tweet</a></>)}
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

// On-load nudge: if there's anything waiting on your signature, surface the
// 5 most recent right away instead of making you discover the Pending tab
// on your own. Dismissing the modal just hides it for this visit -- it
// doesn't decline anything; the full list is always still in the Pending
// tab.
function PendingModal({ rows, busyId, sign, dismiss, onViewAll, onClose }) {
  const shown = rows.slice(0, 5)
  const remaining = rows.length - shown.length

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="card pad-lg fade-in" style={{ maxWidth: '32rem', width: '90%', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <div className="eyebrow">Waiting on your signature</div>
          <button className="btn ghost sm" onClick={onClose}>{I.x}</button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1rem' }}>
          {rows.length} request{rows.length === 1 ? '' : 's'} from the X bot {rows.length === 1 ? 'is' : 'are'} ready to review.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {shown.map((row) => (
            <div key={row.id} className="act-row" style={{ gridTemplateColumns: '2rem 1fr auto', alignItems: 'center' }}>
              <span className="act-ic in">{I.clock}</span>
              <div>
                <PendingRowLabel row={row} />
                <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }}>{fmtWhen(row.created_at)}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn ghost sm" disabled={busyId === row.id} onClick={() => dismiss(row)}>Decline</button>
                <button className="btn sm" disabled={busyId === row.id} onClick={() => sign(row)}>{busyId === row.id ? 'Signing…' : 'Accept'}</button>
              </div>
            </div>
          ))}
        </div>
        {remaining > 0 && (
          <button className="btn ghost sm" onClick={onViewAll} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
            + {remaining} more · view full list in Pending
          </button>
        )}
      </div>
    </div>
  )
}

const ROUTES = [
  { id: 'overview', label: 'Overview', icon: I.grid },
  { id: 'handles', label: 'Handles', icon: I.hash },
  { id: 'resolver', label: 'Resolver', icon: I.split },
  { id: 'send', label: 'Send', icon: I.send },
  { id: 'trade', label: 'Trade', icon: I.trade },
  { id: 'causes', label: 'Causes', icon: I.heart },
  { id: 'escrow', label: 'Escrow', icon: I.shield },
  { id: 'psend', label: 'Private Send', icon: I.lock },
  { id: 'pending', label: 'Pending', icon: I.clock },
  { id: 'activity', label: 'Activity', icon: I.act },
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

  // Auth gate: the moment a wallet is connected (including an auto-reconnect
  // on page load), automatically run the two-step wallet+X sign-in -- no
  // manual button. 'idle' -> no wallet connected yet. 'checking' covers both
  // the wallet-signature prompt and the backend round-trip. 'redirecting' is
  // the brief window before the browser navigates to X. Skips straight to
  // 'signed_in' if a valid-looking token is already stored, so this doesn't
  // re-run every visit.
  const [authStatus, setAuthStatus] = useState(() => (getAuthToken() ? 'signed_in' : 'idle'))
  const [authError, setAuthError] = useState('')
  const [authAttempt, setAuthAttempt] = useState(0)

  useEffect(() => {
    if (!address) { setAuthStatus('idle'); return }
    if (getAuthToken()) { setAuthStatus('signed_in'); return }

    let cancelled = false
    setAuthStatus('checking')
    setAuthError('')
    signInWithWallet()
      .then((result) => {
        if (cancelled) return
        setAuthStatus(result.status === 'signed_in' ? 'signed_in' : 'redirecting')
      })
      .catch((err) => {
        if (cancelled) return
        setAuthStatus('error')
        setAuthError(friendlyError(err))
      })
    return () => { cancelled = true }
  }, [address, authAttempt])

  const handlesQuery = useQuery({
    queryKey: ['owned-handles', address],
    enabled: Boolean(address),
    queryFn: async () => {
      const names = loadTracked(address)
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

  const go = (r) => { setView(r); setDrawer(false) }
  const toast = (msg) => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, msg }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200) }

  // Shared by the Pending tab and the on-load modal -- one fetch, one
  // sign/dismiss implementation, so they can never show conflicting state.
  const pendingQuery = useQuery({
    queryKey: ['pending-transactions', address],
    enabled: Boolean(address) && authStatus === 'signed_in',
    queryFn: () => getPendingTransactions({ data: { token: getAuthToken() } }),
  })
  const pendingRows = pendingQuery.data || []
  const [pendingBusyId, setPendingBusyId] = useState(null)
  const [pendingModalDismissed, setPendingModalDismissed] = useState(false)
  const refreshPending = () => queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })

  const signPending = async (row) => {
    const token = getAuthToken()
    setPendingBusyId(row.id)
    try {
      const primary = { to: row.unsigned_to, data: row.unsigned_data, value: row.unsigned_value }
      const hash = row.kind === 'swap'
        ? await signAndConfirmSwapPlan({ approvals: row.approvals || [], swap: primary })
        : row.kind === 'disperse'
          ? await signAndConfirmSteps([...(row.approvals || []), primary, ...(row.extra_steps || [])])
          : await signPendingTransaction(primary)
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
    const token = getAuthToken()
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

  const titles = {
    overview: ['Overview', 'Your name-native money at a glance'],
    handles: ['Handles', 'The names you own on Robinhood Chain'],
    resolver: ['Resolver', handle ? `Routing & identity for #${handle.name}` : 'Routing & identity'],
    send: ['Send', 'Pay anyone by their handle'],
    trade: ['Trade', 'Swap ETH/USDG for tokenized RWA stocks'],
    causes: ['Causes', 'Public, transparent donations with on-chain receipts'],
    escrow: ['Escrow', 'Create -> Accept -> Deliver -> Release, for freelance and any bilateral deal'],
    psend: ['Private Send', "Shields your identity from the recipient -- their wallet only ever sees TagioPay's pool, never yours"],
    pending: ['Pending', 'Requests from the X bot, waiting on your signature'],
    activity: ['Activity', 'Indexed onchain payments per hashtag'],
  }

  return (
    <div id="app">
      <div className="app">
        <div className={'scrim ' + (drawer ? 'show' : '')} onClick={() => setDrawer(false)}></div>
        <aside className={'sidebar ' + (drawer ? 'open' : '')}>
          <Link className="brand" to="/"><span className="brand-logo" role="img" aria-label="Tagio"></span></Link>
          <nav className="nav">{ROUTES.map((r) => <button key={r.id} className={'nav-item ' + (view === r.id ? 'active' : '')} onClick={() => go(r.id)}>{r.icon}{r.label}</button>)}</nav>
          <div className="side-spacer"></div>
          <div className="net-chip"><span className="live"></span>Robinhood Chain · L2</div>
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
              <button className="btn" onClick={() => go('handles')}>Claim handle <span className="circ">{I.chevron}</span></button>
            </div>
          </div>
          <div className="content">
            {!address && view !== 'send' && view !== 'trade' && view !== 'activity' && view !== 'causes' ? (
              <ConnectPrompt />
            ) : (
              <>
                {view === 'overview' && <Overview handles={handles} activity={activity} loading={handlesQuery.isLoading} go={go} manage={manage} renew={renew} renewing={renewing} />}
                {view === 'handles' && <Handles handles={handles} loading={handlesQuery.isLoading} manage={manage} renew={renew} renewing={renewing} toast={toast} refresh={refresh} />}
                {view === 'resolver' && (handle
                  ? <Resolver key={handle.name} handle={handle} toast={toast} onSaved={refresh} />
                  : <div className="card pad-lg fade-in"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>{handlesQuery.isLoading ? 'Loading your handles…' : 'No handles to configure yet — claim one first.'}</p></div>)}
                {view === 'send' && <Send toast={toast} />}
                {view === 'trade' && <Trade toast={toast} />}
                {view === 'pending' && <Pending rows={pendingRows} loading={pendingQuery.isLoading} busyId={pendingBusyId} sign={signPending} dismiss={dismissPending} />}
                {view === 'causes' && <Causes toast={toast} />}
                {view === 'escrow' && <Escrow toast={toast} />}
                {view === 'psend' && <PrivateSend toast={toast} />}
                {view === 'activity' && <Activity />}
              </>
            )}
          </div>
        </main>
        <div className="toasts">{toasts.map((t) => <div className="toast" key={t.id}><span className="dot"></span>{t.msg}</div>)}</div>
      </div>
      {address && authStatus !== 'signed_in' && (
        <AuthGate status={authStatus} error={authError} onRetry={() => setAuthAttempt((n) => n + 1)} />
      )}
      {authStatus === 'signed_in' && !pendingModalDismissed && view !== 'pending' && pendingRows.length > 0 && (
        <PendingModal
          rows={pendingRows}
          busyId={pendingBusyId}
          sign={signPending}
          dismiss={dismissPending}
          onViewAll={() => { setPendingModalDismissed(true); go('pending') }}
          onClose={() => setPendingModalDismissed(true)}
        />
      )}
    </div>
  )
}
