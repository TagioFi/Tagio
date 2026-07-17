import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { checkHashtag, getHashtag, resolveHashtag, getHashtagTransactions } from '../lib/tagio'
import { registerOnchain, renewOnchain, payOnchain, updatePayoutsOnchain, updateMetadataOnchain, friendlyError } from '../lib/resolver-actions'
import { wagmiConfig } from '../lib/wagmi'
import { WalletControl } from '../components/WalletControl'
import { signInWithWallet, getAuthToken } from '../lib/auth'

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
  menu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
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
        <span className="name"><span className="hash">@</span>{h.name}</span>
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
              <div className="who"><b>@{tx.hashtag}</b><span className="addr-mono">{short(tx.signature)}</span></div>
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
      toast(`@${name} registered onchain · 30-day subscription`)
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
        <span className="hash">@</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="yourname" spellCheck="false" />
        {state === 'taken' && <Link className="btn sm" to="/h/$name" params={{ name: norm }}>View record</Link>}
        {state === 'available' && <button className="btn sm" disabled={reg.status === 'busy'} onClick={doRegister}>{reg.status === 'busy' ? 'Confirm in wallet…' : 'Register'}</button>}
      </div>
      {reg.status === 'error' && <div className="status bad">{I.x} {reg.message}</div>}
      {reg.status === 'done' && <div className="status ok">{I.check} @{reg.name} is yours · <Link to="/h/$name" params={{ name: reg.name }} style={{ color: 'var(--green-deep)', textDecoration: 'underline' }}>view record</Link></div>}
      {state === 'invalid' && <div className="status bad">{I.x} 3–32 chars · lowercase letters, numbers, underscore only</div>}
      {state === 'checking' && <div className="status" style={{ color: 'var(--ink-faint)' }}>Checking availability…</div>}
      {state === 'taken' && <div className="status bad">{I.x} @{norm} is already registered</div>}
      {state === 'available' && reg.status === 'idle' && <div className="status ok">{I.check} @{norm} is available · registering mints the NFT to your wallet (30-day subscription)</div>}
      {state === 'error' && <div className="status bad">{I.x} Availability check failed — try again</div>}
      {state === 'idle' && reg.status === 'idle' && <div className="status" style={{ color: 'var(--ink-faint)' }}>Names are minted as on-chain, transferable records on Robinhood Chain.</div>}
    </div>
  )
}
function ImportHandle({ address, toast, onImported }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const norm = q.toLowerCase().trim().replace(/^[#@]+/, '')
  const doImport = async () => {
    setBusy(true)
    try {
      const r = await getHashtag({ data: norm })
      if (!r || !r.active) { toast(`@${norm} isn't registered`) }
      else if (r.owner_wallet?.toLowerCase() !== address.toLowerCase()) { toast(`@${norm} is owned by ${short(r.owner_wallet)}, not your wallet`) }
      else { addTracked(address, r.hashtag); setQ(''); toast(`@${r.hashtag} added to your handles`); onImported?.() }
    } catch {
      toast('Lookup failed — try again')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card pad-lg claim" style={{ marginBottom: '1rem' }}>
      <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Already own a handle?</div>
      <div className="field">
        <span className="hash">@</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="handle you own" spellCheck="false" onKeyDown={(e) => { if (e.key === 'Enter' && NAME_RE.test(norm)) doImport() }} />
        <button className="btn sm" disabled={!NAME_RE.test(norm) || busy} onClick={doImport}>{busy ? 'Checking…' : 'Import'}</button>
      </div>
      <div className="status" style={{ color: 'var(--ink-faint)' }}>Handles registered from another browser aren't listed automatically yet — import them here.</div>
    </div>
  )
}
function Handles({ handles, loading, address, manage, renew, renewing, toast, refresh }) {
  return (
    <div className="fade-in">
      {handles.length === 0 && (
        <div className="card pad-lg" style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>{loading ? 'Loading your handles…' : 'No handles tracked for this wallet yet.'}</p>
        </div>
      )}
      <div className="grid handles" style={{ marginBottom: '1rem' }}>{handles.map((h) => <HandleCard key={h.name} h={h} onManage={() => manage(h.name)} onRenew={() => renew(h.name)} renewing={renewing === h.name} />)}</div>
      {address && <ImportHandle address={address} toast={toast} onImported={refresh} />}
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
      toast(`Resolver config saved onchain for @${handle.name}`)
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
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Anyone sends to</span><b><span style={{ color: 'var(--green)' }}>@</span>{handle.name}</b></div>
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
      setResolved(r || { error: '@' + norm + ' is not registered (or has expired) on Robinhood Chain' })
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
      toast(`Sent ${fmt(amt)} ETH to @${resolved.hashtag}`)
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
            <span style={{ color: 'var(--green)', fontSize: '1.1rem' }}>@</span>
            <input value={to.replace(/^@/, '')} onChange={(e) => setTo(e.target.value)} placeholder="handle" spellCheck="false" style={{ flex: 1, border: 'none', outline: 'none', fontSize: '1rem', background: 'none' }} />
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: '0.4rem' }}>Any registered hashtag resolves to its live onchain routing.</div>
        </div>
        <div className="form-row"><label className="field-label">Amount (native ETH)</label><input className="input mono" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
        <button className="btn" disabled={!NAME_RE.test(norm) || amt <= 0 || resolving} onClick={resolve} style={{ justifyContent: 'center', width: '100%' }}>{resolving ? 'Resolving…' : 'Resolve'} <span className="circ">{I.chevron}</span></button>
        {resolved && resolved.error && (<div className="split-total bad" style={{ marginTop: '1rem' }}>{resolved.error}</div>)}
        {resolved && !resolved.error && (
          <div className="send-preview">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}><span className="eyebrow">Resolved · live</span><span className="pill ok"><span className="dot"></span>@{resolved.hashtag}</span></div>
            <div className="route-line"><div className="who"><b>Primary destination</b></div><span className="addr-mono">{short(resolved.primaryDestination)}</span></div>
            {resolved.payouts.map((p, i) => (
              <div className="route-line" key={i}><div className="who"><b>Recipient {i + 1}</b><span className="addr-mono">{short(p.wallet)}</span></div><span className="amt">{fmt(amt * p.percentage_bps / 10000)} ETH <span style={{ color: 'var(--ink-faint)', fontWeight: 400, fontSize: '0.8rem' }}>· {(p.percentage_bps / 100).toFixed(1)}%</span></span></div>
            ))}
            {pay.status !== 'done' && (
              <button className="btn" disabled={pay.status === 'busy'} onClick={sendOnchain} style={{ justifyContent: 'center', width: '100%', marginTop: '1rem' }}>{pay.status === 'busy' ? 'Confirm in wallet…' : `Send ${fmt(amt)} ETH onchain`}<span className="circ">{I.check}</span></button>
            )}
            {pay.status === 'error' && (<div className="split-total bad" style={{ marginTop: '0.75rem' }}>{pay.message}</div>)}
            {pay.status === 'done' && (<div className="split-total ok" style={{ marginTop: '0.75rem' }}>Payment settled onchain · indexed by the backend</div>)}
            <Link className="btn ghost" to="/h/$name" params={{ name: resolved.hashtag }} style={{ justifyContent: 'center', width: '100%', marginTop: '0.75rem' }}>View @{resolved.hashtag} record <span className="circ">{I.chevron}</span></Link>
          </div>
        )}
      </div>
      <WalletPanel />
    </div>
  )
}
function WalletPanel() {
  const { isConnected } = useAccount()
  // 'signed_out' | 'signing_in' | 'signed_in' -- reflects whether a TagioPay
  // JWT is already stored, not just whether a wallet is connected. Auth is
  // two-step (wallet signature + linked X account), so this button may
  // redirect to X instead of completing immediately.
  const [authState, setAuthState] = useState(() => (getAuthToken() ? 'signed_in' : 'signed_out'))
  const [authError, setAuthError] = useState('')

  const handleSignIn = async () => {
    setAuthState('signing_in')
    setAuthError('')
    try {
      const result = await signInWithWallet()
      if (result.status === 'signed_in') setAuthState('signed_in')
      // 'redirecting_to_x' means the browser is already navigating away.
    } catch (err) {
      setAuthState('signed_out')
      setAuthError(friendlyError(err))
    }
  }

  return (
    <div className="card pad-lg">
      <div className="eyebrow" style={{ marginBottom: '0.9rem' }}>Wallet</div>
      {isConnected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
          <WalletControl variant="chip" />
          {authState === 'signed_in' ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--green-deep)' }}>Signed in to TagioPay ✓</div>
          ) : (
            <button className="btn sm" onClick={handleSignIn} disabled={authState === 'signing_in'}>
              {authState === 'signing_in' ? 'Signing in…' : 'Sign in to TagioPay'}
            </button>
          )}
          {authError && <div className="status bad" style={{ fontSize: '0.8rem' }}>{authError}</div>}
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
          <span className="hash">@</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="hashtag" spellCheck="false" onKeyDown={(e) => { if (e.key === 'Enter' && NAME_RE.test(norm)) lookup() }} />
          <button className="btn sm" disabled={!NAME_RE.test(norm) || state === 'loading'} onClick={lookup}>{state === 'loading' ? 'Loading…' : 'Look up'}</button>
        </div>
        {state === 'error' && <div className="status bad">{I.x} Lookup failed — try again</div>}
      </div>
      {state === 'done' && (
        <div className="card pad-lg">
          <div className="section-title"><h2>Payments to @{looked}</h2><Link className="btn ghost sm" to="/h/$name" params={{ name: looked }}>View record</Link></div>
          {rows.length === 0 && <p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>No payments indexed for @{looked} yet.</p>}
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

const ROUTES = [
  { id: 'overview', label: 'Overview', icon: I.grid },
  { id: 'handles', label: 'Handles', icon: I.hash },
  { id: 'resolver', label: 'Resolver', icon: I.split },
  { id: 'send', label: 'Send', icon: I.send },
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
      toast(`@${n} renewed onchain · +30 days`)
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
    resolver: ['Resolver', handle ? `Routing & identity for @${handle.name}` : 'Routing & identity'],
    send: ['Send', 'Pay anyone by their handle'],
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
              {view === 'resolver' && handles.length > 0 && (<div className="handle-select"><span style={{ color: 'var(--green)' }}>@</span><select value={handle?.name || ''} onChange={(e) => setSelected(e.target.value)}>{handles.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}</select></div>)}
              <button className="btn" onClick={() => go('handles')}>Claim handle <span className="circ">{I.chevron}</span></button>
            </div>
          </div>
          <div className="content">
            {!address && view !== 'send' && view !== 'activity' ? (
              <ConnectPrompt />
            ) : (
              <>
                {view === 'overview' && <Overview handles={handles} activity={activity} loading={handlesQuery.isLoading} go={go} manage={manage} renew={renew} renewing={renewing} />}
                {view === 'handles' && <Handles handles={handles} loading={handlesQuery.isLoading} address={address} manage={manage} renew={renew} renewing={renewing} toast={toast} refresh={refresh} />}
                {view === 'resolver' && (handle
                  ? <Resolver key={handle.name} handle={handle} toast={toast} onSaved={refresh} />
                  : <div className="card pad-lg fade-in"><p style={{ fontSize: '0.9rem', color: 'var(--ink-faint)' }}>{handlesQuery.isLoading ? 'Loading your handles…' : 'No handles to configure yet — claim one first.'}</p></div>)}
                {view === 'send' && <Send toast={toast} />}
                {view === 'activity' && <Activity />}
              </>
            )}
          </div>
        </main>
        <div className="toasts">{toasts.map((t) => <div className="toast" key={t.id}><span className="dot"></span>{t.msg}</div>)}</div>
      </div>
    </div>
  )
}
