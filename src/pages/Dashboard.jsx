import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'

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
const ASSETS = ['USDG', 'USDC', 'ETH (native)', 'AAPLx', 'SPYx']

/* ---------- seed state ---------- */
const seedHandles = [
  { name: 'linda', primary: '0x8E50F07d93c58f91A3cc5b80dA44752A0F586eD6', asset: 'USDG', leasePct: 78, expiresDays: 284, splits: [{ id: 1, label: 'Primary wallet', wallet: '0x8E50F07d93c58f91A3cc5b80dA44752A0F586eD6', pct: 100 }], socials: { x: '@linda', telegram: '@linda_rh', discord: '' } },
  { name: 'payus', primary: '0x21bC4f0a9e17d2A3F5b60E1c88aa0dB7C4e39a12', asset: 'USDC', leasePct: 41, expiresDays: 150, splits: [{ id: 1, label: 'Ops', wallet: '0x21bC4f0a9e17d2A3F5b60E1c88aa0dB7C4e39a12', pct: 60 }, { id: 2, label: 'Team pool', wallet: '0x4d02Ae91bF37c5D6009a1e4c7bB2f8813Ac5602a', pct: 40 }], socials: { x: '@payus', telegram: '', discord: 'payus#0001' } },
  { name: 'finance', primary: '0x93aa11d4E7dA9639f1EAefa2De78c23396B06820', asset: 'USDG', leasePct: 12, expiresDays: 44, splits: [{ id: 1, label: 'Treasury', wallet: '0x93aa11d4E7dA9639f1EAefa2De78c23396B06820', pct: 100 }], socials: { x: '', telegram: '', discord: '' } },
]
const SEND_REGISTRY = {
  coffee: { splits: [{ label: 'Owner', wallet: '0x7f19cD3a…a1', pct: 100 }], asset: 'USDG' },
  alex: { splits: [{ label: 'Alex', wallet: '0x21bC4f0a…9a12', pct: 70 }, { label: 'Charity', wallet: '0x4d02Ae91…602a', pct: 30 }], asset: 'USDC' },
  linda: { splits: [{ label: 'Primary wallet', wallet: '0x8E50F07d…6eD6', pct: 100 }], asset: 'USDG' },
  studio: { splits: [{ label: 'Design', wallet: '0x0Ab7…5512', pct: 50 }, { label: 'Dev', wallet: '0x9Cd1…77aE', pct: 50 }], asset: 'USDG' },
}
const seedActivity = [
  { id: 1, dir: 'in', who: '@coffee', addr: 'resolved → you', amt: 120.0, asset: 'USDG', time: '2m ago', status: 'Settled' },
  { id: 2, dir: 'out', who: '@studio', addr: 'split · 2 recipients', amt: 480.0, asset: 'USDG', time: '1h ago', status: 'Settled' },
  { id: 3, dir: 'in', who: '@alex', addr: 'resolved → you', amt: 64.5, asset: 'USDC', time: '3h ago', status: 'Settled' },
  { id: 4, dir: 'in', who: '0x21bC…9a12', addr: 'direct transfer', amt: 1500.0, asset: 'USDG', time: 'Yesterday', status: 'Settled' },
  { id: 5, dir: 'out', who: '@finance', addr: 'resolved → treasury', amt: 220.0, asset: 'USDG', time: '2d ago', status: 'Settled' },
]
const chartData = [12, 18, 15, 24, 22, 31, 28, 37, 34, 42, 39, 52, 48, 61]

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
function HandleCard({ h, onManage, onRenew }) {
  return (
    <div className="card handle-card">
      <div className="top">
        <span className="name"><span className="hash">@</span>{h.name}</span>
        <span className={'pill ' + (h.expiresDays < 60 ? 'warn' : 'ok')}>{h.expiresDays < 60 ? 'Renew soon' : 'Active'}</span>
      </div>
      <div className="meta">
        <div className="row"><span>Primary</span><span className="addr-mono">{short(h.primary)}</span></div>
        <div className="row"><span>Settles in</span><span>{h.asset}</span></div>
        <div className="row"><span>Splits</span><span>{h.splits.length} recipient{h.splits.length > 1 ? 's' : ''}</span></div>
      </div>
      <div>
        <div className="row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--ink-faint)', marginBottom: '0.35rem' }}>
          <span>Lease</span><span>{h.expiresDays} days left</span>
        </div>
        <div className="lease-bar"><span style={{ width: h.leasePct + '%' }}></span></div>
      </div>
      <div className="actions">
        <button className="btn sm" onClick={onManage}>Manage</button>
        <button className="btn ghost sm" onClick={onRenew}>Renew</button>
      </div>
    </div>
  )
}
function Overview({ handles, activity, go, manage, renew }) {
  const totalIn = activity.filter((a) => a.dir === 'in').reduce((s, a) => s + a.amt, 0)
  const recips = handles.reduce((s, h) => s + h.splits.length, 0)
  return (
    <div className="fade-in">
      <div className="grid stats">
        <Stat icon={I.down} label="Received (30d)" value={fmt(totalIn)} unit="USDG" sub="+18% vs last period" />
        <Stat icon={I.hash} label="Active handles" value={handles.length} sub="All resolving" />
        <Stat icon={I.split} label="Split recipients" value={recips} sub="Across all handles" />
        <Stat icon={I.bolt} label="Avg settlement" value="~100" unit="ms" sub="Robinhood Chain L2" />
      </div>
      <div className="grid two" style={{ marginTop: '1rem' }}>
        <div className="card pad-lg">
          <div className="section-title"><div><div className="eyebrow">Inflows</div><h2>Received over time</h2></div><span className="pill ok"><span className="dot"></span>Live</span></div>
          <AreaChart data={chartData} />
        </div>
        <div className="card pad-lg">
          <div className="section-title"><h2>Recent activity</h2><button className="btn ghost sm" onClick={() => go('activity')}>View all</button></div>
          {activity.slice(0, 4).map((a) => (
            <div key={a.id} className="route-line">
              <div className="who"><b>{a.who}</b><span className="addr-mono">{a.addr}</span></div>
              <div className="amt" style={{ color: a.dir === 'in' ? 'var(--green-deep)' : 'var(--ink)' }}>{a.dir === 'in' ? '+' : '−'}{fmt(a.amt)} {a.asset}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card pad-lg" style={{ marginTop: '1rem' }}>
        <div className="section-title"><h2>Your handles</h2><button className="btn ghost sm" onClick={() => go('handles')}>Manage</button></div>
        <div className="grid handles">{handles.map((h) => <HandleCard key={h.name} h={h} onManage={() => manage(h.name)} onRenew={() => renew(h.name)} />)}</div>
      </div>
    </div>
  )
}
function Claim({ handles, toast, onClaim }) {
  const [q, setQ] = useState('')
  const norm = q.toLowerCase().trim()
  const owned = handles.map((h) => h.name)
  const takenMock = ['vault', 'pay', 'robinhood', 'admin']
  let state = 'idle'
  if (norm.length === 0) state = 'idle'
  else if (!NAME_RE.test(norm)) state = 'invalid'
  else if (owned.includes(norm) || takenMock.includes(norm)) state = 'taken'
  else state = 'available'
  return (
    <div className="card pad-lg claim fade-in">
      <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Register a name</div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 500, marginBottom: '1rem' }}>Claim a new handle</h2>
      <div className="field">
        <span className="hash">@</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="yourname" spellCheck="false" />
        <button className="btn sm" disabled={state !== 'available'} onClick={() => { onClaim(norm); setQ(''); toast(`@${norm} minted to your wallet`) }}>Register</button>
      </div>
      {state === 'invalid' && <div className="status bad">{I.x} 3–32 chars · lowercase letters, numbers, underscore only</div>}
      {state === 'taken' && <div className="status bad">{I.x} @{norm} is already registered</div>}
      {state === 'available' && <div className="status ok">{I.check} @{norm} is available · 1-year lease</div>}
      {state === 'idle' && <div className="status" style={{ color: 'var(--ink-faint)' }}>Names are minted as on-chain, transferable records on Robinhood Chain.</div>}
    </div>
  )
}
function Handles({ handles, go, toast, onClaim, manage, renew }) {
  return (
    <div className="fade-in">
      <div className="grid handles" style={{ marginBottom: '1rem' }}>{handles.map((h) => <HandleCard key={h.name} h={h} onManage={() => manage(h.name)} onRenew={() => renew(h.name)} />)}</div>
      <Claim handles={handles} toast={toast} onClaim={onClaim} />
    </div>
  )
}
function Resolver({ handle, onSave, toast }) {
  const [primary, setPrimary] = useState(handle.primary)
  const [asset, setAsset] = useState(handle.asset)
  const [splits, setSplits] = useState(handle.splits.map((s) => ({ ...s })))
  const [socials, setSocials] = useState({ ...handle.socials })
  const [verified, setVerified] = useState({ x: !!handle.socials.x, telegram: false, discord: false })
  useEffect(() => {
    setPrimary(handle.primary); setAsset(handle.asset); setSplits(handle.splits.map((s) => ({ ...s }))); setSocials({ ...handle.socials }); setVerified({ x: !!handle.socials.x, telegram: false, discord: false })
  }, [handle.name])
  const totalPct = splits.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0)
  const totalBps = Math.round(totalPct * 100)
  const valid = totalBps === 10000
  const setRow = (id, key, val) => setSplits(splits.map((r) => (r.id === id ? { ...r, [key]: val } : r)))
  const addRow = () => setSplits([...splits, { id: Date.now(), label: 'New recipient', wallet: '', pct: 0 }])
  const delRow = (id) => setSplits(splits.filter((r) => r.id !== id))
  const distribute = () => { const n = splits.length, base = Math.floor(10000 / n); setSplits(splits.map((r, i) => ({ ...r, pct: (base + (i === n - 1 ? 10000 - base * n : 0)) / 100 }))) }
  return (
    <div className="grid two fade-in" style={{ alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card pad-lg">
          <div className="section-title"><div><div className="eyebrow">Routing</div><h2>Payout splits</h2></div><button className="btn ghost sm" onClick={distribute}>Even split</button></div>
          <div className="split-row" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-faint)', marginBottom: '0.5rem' }}><span>Label</span><span>Wallet</span><span style={{ textAlign: 'right' }}>Share</span><span></span></div>
          {splits.map((r) => (
            <div className="split-row" key={r.id}>
              <div className="rlabel"><input value={r.label} onChange={(e) => setRow(r.id, 'label', e.target.value)} placeholder="Label" /></div>
              <div className="rwallet"><input value={r.wallet} onChange={(e) => setRow(r.id, 'wallet', e.target.value)} placeholder="0x…" /></div>
              <div className="rpct"><input type="number" min="0" max="100" value={r.pct} onChange={(e) => setRow(r.id, 'pct', e.target.value === '' ? '' : parseFloat(e.target.value))} /><span>%</span></div>
              <button className="rdel" onClick={() => delRow(r.id)} disabled={splits.length === 1} style={{ opacity: splits.length === 1 ? 0.3 : 1 }}>{I.x}</button>
            </div>
          ))}
          <button className="btn ghost sm" onClick={addRow} style={{ marginTop: '0.25rem' }}>+ Add recipient</button>
          <div className={'split-total ' + (valid ? 'ok' : 'bad')}><span>{valid ? 'Splits balanced' : (totalPct > 100 ? 'Over by ' + (totalPct - 100).toFixed(1) + '%' : 'Remaining ' + (100 - totalPct).toFixed(1) + '%')}</span><span>{totalPct.toFixed(1)}% <span className="bps">· {totalBps} / 10000 bps</span></span></div>
        </div>
        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>Verification</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '0.5rem' }}>Social handles</h2>
          {[['x', 'X'], ['telegram', 'Telegram'], ['discord', 'Discord']].map(([k, l]) => (
            <div className="social-row" key={k}>
              <div className="left"><span className="ic">{l[0]}</span><input value={socials[k]} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })} placeholder={'Add ' + l} /></div>
              {verified[k]
                ? <span className="pill ok">{I.check}Verified</span>
                : <button className="btn ghost sm" disabled={!socials[k]} onClick={() => { setVerified({ ...verified, [k]: true }); toast(`Signed · ${l} bound to @${handle.name}`) }}>Sign to verify</button>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: '0.75rem' }}>Destination</div>
          <div className="form-row"><label className="field-label">Primary destination</label><input className="input" style={{ fontFamily: 'ui-monospace,monospace', fontSize: '0.85rem' }} value={primary} onChange={(e) => setPrimary(e.target.value)} spellCheck="false" /></div>
          <div className="form-row" style={{ marginBottom: 0 }}><label className="field-label">Preferred settlement asset</label><select className="select" value={asset} onChange={(e) => setAsset(e.target.value)}>{ASSETS.map((a) => <option key={a}>{a}</option>)}</select></div>
        </div>
        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>Preview</div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Anyone sends to</span><b><span style={{ color: 'var(--green)' }}>@</span>{handle.name}</b></div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Resolves to</span><span>{splits.length} recipient{splits.length > 1 ? 's' : ''}</span></div>
          <div className="route-line"><span style={{ color: 'var(--ink-soft)' }}>Settles in</span><b>{asset}</b></div>
        </div>
        <button className="btn" disabled={!valid} onClick={() => onSave({ primary, asset, splits, socials })} style={{ justifyContent: 'center' }}>{valid ? 'Save resolver config' : 'Balance splits to save'}<span className="circ">{I.chevron}</span></button>
      </div>
    </div>
  )
}
function Send({ balances, onSend, toast }) {
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [resolved, setResolved] = useState(null)
  const norm = to.replace(/^@/, '').toLowerCase().trim()
  const reg = SEND_REGISTRY[norm]
  const amt = parseFloat(amount) || 0
  const resolve = () => { if (!reg) { setResolved({ error: '@' + norm + ' is not registered on Robinhood Chain' }); return } setResolved({ ...reg, name: norm }) }
  useEffect(() => { setResolved(null) }, [to, amount])
  const confirm = () => { onSend({ to: '@' + resolved.name, asset: resolved.asset, amt, splits: resolved.splits }); toast(`Sent ${fmt(amt)} ${resolved.asset} to @${resolved.name}`); setTo(''); setAmount(''); setResolved(null) }
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
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: '0.4rem' }}>Try @coffee, @alex, or @studio</div>
        </div>
        <div className="form-row"><label className="field-label">Amount</label><input className="input mono" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
        <button className="btn" disabled={!norm || amt <= 0} onClick={resolve} style={{ justifyContent: 'center', width: '100%' }}>Resolve <span className="circ">{I.chevron}</span></button>
        {resolved && resolved.error && (<div className="split-total bad" style={{ marginTop: '1rem' }}>{resolved.error}</div>)}
        {resolved && !resolved.error && (
          <div className="send-preview">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}><span className="eyebrow">Resolved · simulated</span><span className="pill ok"><span className="dot"></span>~100ms</span></div>
            {resolved.splits.map((s, i) => (
              <div className="route-line" key={i}><div className="who"><b>{s.label}</b><span className="addr-mono">{s.wallet}</span></div><span className="amt">{fmt(amt * s.pct / 100)} {resolved.asset} <span style={{ color: 'var(--ink-faint)', fontWeight: 400, fontSize: '0.8rem' }}>· {s.pct}%</span></span></div>
            ))}
            <button className="btn" onClick={confirm} style={{ justifyContent: 'center', width: '100%', marginTop: '1rem' }}>Confirm &amp; send {fmt(amt)} {resolved.asset}<span className="circ">{I.check}</span></button>
          </div>
        )}
      </div>
      <div className="card pad-lg">
        <div className="eyebrow" style={{ marginBottom: '0.9rem' }}>Balances</div>
        {Object.entries(balances).map(([k, v]) => (<div className="route-line" key={k}><b>{k}</b><span className="amt">{fmt(v)}</span></div>))}
        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(200,232,96,0.10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--green-deep)', lineHeight: 1.5 }}>Sends resolve the name, apply the on-chain split, and settle atomically. You never paste an address.</div>
      </div>
    </div>
  )
}
function Activity({ activity }) {
  return (
    <div className="card pad-lg fade-in">
      <div>
        <div className="act-row head"><span></span><span>Counterparty</span><span className="hide-m">Route</span><span className="right">Amount</span><span className="right hide-m">When</span></div>
        {activity.map((a) => (
          <div className="act-row" key={a.id}>
            <span className={'act-ic ' + a.dir}>{a.dir === 'in' ? I.down : I.up}</span>
            <div><b style={{ fontWeight: 500 }}>{a.who}</b><div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }} className="hide-m">{a.status}</div></div>
            <span className="addr-mono hide-m">{a.addr}</span>
            <span className="right amt" style={{ color: a.dir === 'in' ? 'var(--green-deep)' : 'var(--ink)' }}>{a.dir === 'in' ? '+' : '−'}{fmt(a.amt)} {a.asset}</span>
            <span className="right hide-m" style={{ color: 'var(--ink-faint)', fontSize: '0.85rem' }}>{a.time}</span>
          </div>
        ))}
      </div>
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
  const [handles, setHandles] = useState(seedHandles)
  const [selected, setSelected] = useState(seedHandles[0].name)
  const [activity, setActivity] = useState(seedActivity)
  const [balances, setBalances] = useState({ USDG: 4820.5, USDC: 1290.0, 'ETH (native)': 0.84 })
  const [toasts, setToasts] = useState([])
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    // dashboard uses a fixed 16px rem base; restore vw scaling for the marketing site on unmount
    document.documentElement.style.fontSize = '16px'
    return () => { document.documentElement.style.fontSize = '' }
  }, [])

  const go = (r) => { setView(r); setDrawer(false) }
  const toast = (msg) => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, msg }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200) }
  const handle = handles.find((h) => h.name === selected) || handles[0]
  const saveResolver = (cfg) => { setHandles(handles.map((h) => (h.name === selected ? { ...h, primary: cfg.primary, asset: cfg.asset, splits: cfg.splits, socials: cfg.socials } : h))); toast(`Resolver saved for @${selected}`) }
  const claim = (name) => { setHandles([...handles, { name, primary: '0x0000000000000000000000000000000000000000', asset: 'USDG', leasePct: 100, expiresDays: 365, splits: [{ id: Date.now(), label: 'Primary wallet', wallet: '', pct: 100 }], socials: { x: '', telegram: '', discord: '' } }]); setSelected(name) }
  const send = (tx) => { setBalances((b) => ({ ...b, [tx.asset]: Math.max(0, (b[tx.asset] || 0) - tx.amt) })); setActivity((a) => [{ id: Date.now(), dir: 'out', who: tx.to, addr: tx.splits.length > 1 ? `split · ${tx.splits.length} recipients` : 'resolved → owner', amt: tx.amt, asset: tx.asset, time: 'just now', status: 'Settled' }, ...a]) }
  const manage = (n) => { setSelected(n); go('resolver') }
  const renew = (n) => { setHandles((hs) => hs.map((h) => (h.name === n ? { ...h, expiresDays: h.expiresDays + 365, leasePct: 100 } : h))); toast(`@${n} lease renewed · +1 year`) }

  const titles = {
    overview: ['Overview', 'Your name-native money at a glance'],
    handles: ['Handles', 'The names you own on Robinhood Chain'],
    resolver: ['Resolver', `Routing & identity for @${selected}`],
    send: ['Send', 'Pay anyone by their handle'],
    activity: ['Activity', 'Every resolution and settlement'],
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
          <div className="wallet-chip"><div className="addr">{I.wallet}{short('0x8E50F07d93c58f91A3cc5b80dA44752A0F586eD6')}</div><div className="bal">{fmt(balances.USDG)} <small>USDG</small></div></div>
        </aside>
        <main className="main">
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <button className="menu-btn" onClick={() => setDrawer(true)}>{I.menu}</button>
              <div className="title"><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div>
            </div>
            <div className="actions">
              {view === 'resolver' && (<div className="handle-select"><span style={{ color: 'var(--green)' }}>@</span><select value={selected} onChange={(e) => setSelected(e.target.value)}>{handles.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}</select></div>)}
              <button className="btn" onClick={() => go('handles')}>Claim handle <span className="circ">{I.chevron}</span></button>
            </div>
          </div>
          <div className="content">
            {view === 'overview' && <Overview handles={handles} activity={activity} go={go} manage={manage} renew={renew} />}
            {view === 'handles' && <Handles handles={handles} go={go} toast={toast} onClaim={claim} manage={manage} renew={renew} />}
            {view === 'resolver' && <Resolver key={selected} handle={handle} onSave={saveResolver} toast={toast} />}
            {view === 'send' && <Send balances={balances} onSend={send} toast={toast} />}
            {view === 'activity' && <Activity activity={activity} />}
          </div>
        </main>
        <div className="toasts">{toasts.map((t) => <div className="toast" key={t.id}><span className="dot"></span>{t.msg}</div>)}</div>
      </div>
    </div>
  )
}
