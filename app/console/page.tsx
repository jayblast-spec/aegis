'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteHeader, SiteFooter } from '../components/SiteChrome'
import { AegisError, AegisOwner, type AgentView, type DecisionLogEntry, type PendingAction } from '@/lib/aegisSDK'
import { DecisionTable } from '../components/DecisionTable'

const OWNER_KEY_STORAGE = 'aegis.ownerKey'
const mono = { fontFamily: "'JetBrains Mono', monospace" }
const panel = { background: 'rgba(13,17,23,.75)', border: '1px solid rgba(255,255,255,.08)' }

function readStoredKey(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY_STORAGE)
  } catch {
    return null
  }
}
function storeKey(key: string | null) {
  try {
    if (key) window.localStorage.setItem(OWNER_KEY_STORAGE, key)
    else window.localStorage.removeItem(OWNER_KEY_STORAGE)
  } catch {
    /* storage unavailable: key lives for this tab only */
  }
}

export default function ConsolePage() {
  const [ownerKey, setOwnerKey] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [label, setLabel] = useState('')
  const [pasteKey, setPasteKey] = useState('')
  const [revealedOwnerKey, setRevealedOwnerKey] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentView[]>([])
  const [pending, setPending] = useState<PendingAction[]>([])
  const [log, setLog] = useState<DecisionLogEntry[]>([])
  const [newAgentName, setNewAgentName] = useState('')
  const [revealedAgentKey, setRevealedAgentKey] = useState<{ name: string; key: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setOwnerKey(readStoredKey())
    setReady(true)
  }, [])

  const owner = ownerKey ? new AegisOwner(ownerKey) : null

  const refresh = useCallback(async () => {
    if (!ownerKey) return
    const o = new AegisOwner(ownerKey)
    try {
      const [a, p, d] = await Promise.all([o.listAgents(), o.approvals('pending'), o.decisions({ limit: 100 })])
      setAgents(a)
      setPending(p)
      setLog(d)
    } catch (err) {
      if (err instanceof AegisError && err.status === 401) {
        setMessage({ text: 'That owner key is not valid. Sign in again.', tone: 'err' })
        storeKey(null)
        setOwnerKey(null)
      }
    }
  }, [ownerKey])

  useEffect(() => {
    refresh()
    if (!ownerKey) return
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [ownerKey, refresh])

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
      if (ok) setMessage({ text: ok, tone: 'ok' })
      await refresh()
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Request failed', tone: 'err' })
    } finally {
      setBusy(false)
    }
  }

  const createOwner = () =>
    run(async () => {
      const { ownerKey: key } = await AegisOwner.create(label.trim() || 'Aegis owner')
      storeKey(key)
      setRevealedOwnerKey(key)
      setOwnerKey(key)
    }, 'Owner account created.')

  const signIn = () =>
    run(async () => {
      const key = pasteKey.trim()
      await new AegisOwner(key).listAgents()
      storeKey(key)
      setOwnerKey(key)
      setPasteKey('')
    }, 'Signed in.')

  const signOut = () => {
    storeKey(null)
    setOwnerKey(null)
    setAgents([])
    setPending([])
    setLog([])
    setRevealedOwnerKey(null)
    setRevealedAgentKey(null)
  }

  if (!ready) return null

  return (
    <div className="aegis-home min-h-screen bg-[#07090E] text-gray-100" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs" style={mono}>
            OWNER CONSOLE · EARLY BUILD
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Set limits once. Approve, revoke, audit.</h1>
          <p className="text-gray-300 max-w-3xl">
            Every agent you register gets its own API key. It must call <code className="text-emerald-300">/api/enforce</code> before acting, and the
            answer is allowed, held for your approval, or blocked. Everything below is read from the server&rsquo;s database, not this browser.
          </p>
        </div>

        <div aria-live="polite" className="min-h-[1.5rem]">
          {message && <p className={`text-sm ${message.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>{message.text}</p>}
        </div>

        {!owner ? (
          <section className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl p-6 space-y-4" style={panel}>
              <h2 className="text-lg font-bold text-white">Create an owner account</h2>
              <p className="text-sm text-gray-400">You get an owner key, shown once. Aegis stores only its SHA-256 hash, so it cannot be recovered. Keep it like a password.</p>
              <label className="block text-xs text-gray-400" htmlFor="owner-label">Label (optional)</label>
              <input id="owner-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Personal agents" className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              <button onClick={createOwner} disabled={busy} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-semibold disabled:opacity-50">Create owner account</button>
            </div>
            <div className="rounded-2xl p-6 space-y-4" style={panel}>
              <h2 className="text-lg font-bold text-white">Sign in with an owner key</h2>
              <label className="block text-xs text-gray-400" htmlFor="owner-key">Owner key</label>
              <input id="owner-key" value={pasteKey} onChange={e => setPasteKey(e.target.value)} placeholder="aeg_own_…" autoComplete="off" className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" style={mono} />
              <button onClick={signIn} disabled={busy || !pasteKey.trim()} className="w-full py-3 rounded-xl bg-gray-900 border border-emerald-500/40 text-emerald-300 font-semibold disabled:opacity-50">Sign in</button>
              <p className="text-xs text-gray-500">The key is kept in this browser&rsquo;s local storage until you sign out.</p>
            </div>
          </section>
        ) : (
          <>
            {revealedOwnerKey && <SecretBox title="Your owner key (shown once)" secret={revealedOwnerKey} onDone={() => setRevealedOwnerKey(null)} />}

            <section className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between rounded-2xl p-4" style={panel}>
              <div className="text-xs text-gray-400" style={mono}>
                Signed in with <span className="text-emerald-300">{ownerKey!.slice(0, 14)}…</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => run(async () => { const ids = await owner.revokeAll(); setMessage({ text: `Kill switch: ${ids.length} agent(s) revoked.`, tone: 'ok' }) })}
                  disabled={busy || !agents.some(a => a.status === 'active')}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 text-white text-xs font-extrabold uppercase tracking-wider disabled:opacity-40"
                >
                  Revoke all agents
                </button>
                <button onClick={signOut} className="px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-300 text-xs font-semibold">Sign out</button>
              </div>
            </section>

            <section className="rounded-2xl p-6 space-y-5" style={panel}>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
                <h2 className="text-lg font-bold text-white">Agents</h2>
                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const n = newAgentName.trim(); if (!n) return; run(async () => { const r = await owner.createAgent(n); setRevealedAgentKey({ name: n, key: r.agentKey }); setNewAgentName(''); setEditing(r.agent.id) }, 'Agent registered. Set its policy below; until then every request is blocked.') }}>
                  <label htmlFor="agent-name" className="sr-only">Agent name</label>
                  <input id="agent-name" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="Agent name" maxLength={80} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
                  <button disabled={busy || !newAgentName.trim()} className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm font-semibold disabled:opacity-50">Register</button>
                </form>
              </div>
              {revealedAgentKey && <SecretBox title={`API key for “${revealedAgentKey.name}” (shown once)`} secret={revealedAgentKey.key} onDone={() => setRevealedAgentKey(null)} />}
              {agents.length === 0 ? (
                <p className="text-sm text-gray-500">No agents yet.</p>
              ) : (
                <ul className="space-y-3">
                  {agents.map(a => (
                    <li key={a.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-3 justify-between">
                        <div>
                          <div className="font-semibold text-white">{a.name}</div>
                          <div className="text-[11px] text-gray-500" style={mono}>{a.id} · key {a.keyPrefix}…</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded border ${a.status === 'active' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-rose-300 border-rose-500/30 bg-rose-500/10'}`} style={mono}>{a.status.toUpperCase()}</span>
                          {a.status === 'active' && (
                            <>
                              <button onClick={() => setEditing(editing === a.id ? null : a.id)} className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200">{editing === a.id ? 'Close' : 'Edit policy'}</button>
                              <button onClick={() => run(async () => { await owner.revoke(a.id) }, `${a.name} revoked. Its key is now blocked.`)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:opacity-50">Revoke</button>
                            </>
                          )}
                        </div>
                      </div>
                      <PolicySummary agent={a} />
                      {editing === a.id && a.status === 'active' && (
                        <PolicyEditor agent={a} busy={busy} onSave={policy => run(async () => { await owner.setPolicy(a.id, policy); setEditing(null) }, 'Policy saved.')} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl p-6 space-y-4" style={panel}>
              <h2 className="text-lg font-bold text-white">Waiting for your approval <span className="text-sm text-gray-500 font-normal">({pending.length})</span></h2>
              {pending.length === 0 ? (
                <p className="text-sm text-gray-500">Nothing is held right now.</p>
              ) : (
                <ul className="space-y-3">
                  {pending.map(p => (
                    <li key={p.id} className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div className="text-sm text-amber-100"><span className="font-semibold">{p.agentName}</span> wants to <span className="font-semibold">{p.action}</span> for <span className="font-semibold">${p.amount.toFixed(2)}</span></div>
                        <div className="text-[11px] text-amber-300/80" style={mono}>expires {new Date(p.expiresAt).toLocaleTimeString()}</div>
                      </div>
                      <div className="text-[11px] text-gray-400 break-all" style={mono}>scopes [{p.scopes.join(', ')}]{p.params ? ` · params ${JSON.stringify(p.params)}` : ''}</div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => run(async () => { await owner.decide(p.id, true) }, 'Approved. The agent can release this exact action once.')} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-bold text-xs disabled:opacity-50">Approve</button>
                        <button onClick={() => run(async () => { await owner.decide(p.id, false) }, 'Denied.')} disabled={busy} className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 font-bold text-xs disabled:opacity-50">Deny</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl p-6 space-y-4" style={panel}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Decision log</h2>
                <span className="text-[11px] text-gray-500" style={mono}>append-only · newest first</span>
              </div>
              <DecisionTable rows={log} />
            </section>
          </>
        )}

        <p className="text-xs text-gray-500">
          Early build, not externally audited. Agents that never call the API are not stopped. See the <Link href="/" className="text-emerald-400 hover:underline">sandbox</Link> and the README for current limits.
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}

function SecretBox({ title, secret, onDone }: { title: string; secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4 space-y-2" role="status">
      <div className="text-sm font-semibold text-cyan-200">{title}</div>
      <code className="block break-all text-xs text-white bg-black/50 rounded-lg p-3" style={mono}>{secret}</code>
      <div className="flex gap-2">
        <button onClick={() => { navigator.clipboard?.writeText(secret).then(() => setCopied(true)).catch(() => undefined) }} className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-xs font-semibold">{copied ? 'Copied' : 'Copy'}</button>
        <button onClick={onDone} className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 text-xs">I saved it</button>
      </div>
    </div>
  )
}

function PolicySummary({ agent }: { agent: AgentView }) {
  const p = agent.policy
  if (!p) return <p className="text-xs text-amber-300">No policy yet: every request from this agent is blocked (fail closed).</p>
  return (
    <p className="text-xs text-gray-400" style={mono}>
      ≤ ${p.perActionCap.toFixed(2)}/action · ${p.windowCap.toFixed(2)} per {Math.round(p.windowSeconds / 3600) || 1}h rolling · approval{' '}
      {p.alwaysRequireApproval ? 'always' : p.approvalThreshold === null ? 'never' : `over $${p.approvalThreshold.toFixed(2)}`} · scopes [{p.allowedScopes.join(', ')}]
    </p>
  )
}

function PolicyEditor({ agent, busy, onSave }: { agent: AgentView; busy: boolean; onSave: (p: { perActionCap: number; windowCap: number; windowSeconds: number; approvalThreshold: number | null; alwaysRequireApproval: boolean; allowedScopes: string[] }) => void }) {
  const p = agent.policy
  const [perAction, setPerAction] = useState(String(p?.perActionCap ?? 100))
  const [windowCap, setWindowCap] = useState(String(p?.windowCap ?? 250))
  const [windowHours, setWindowHours] = useState(String(p ? p.windowSeconds / 3600 : 24))
  const [threshold, setThreshold] = useState(p?.approvalThreshold === null ? '' : String(p?.approvalThreshold ?? 50))
  const [always, setAlways] = useState(p?.alwaysRequireApproval ?? false)
  const [scopes, setScopes] = useState((p?.allowedScopes ?? ['read']).join(', '))
  const field = 'w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none'
  return (
    <form
      className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-gray-800"
      onSubmit={e => {
        e.preventDefault()
        onSave({
          perActionCap: Number(perAction),
          windowCap: Number(windowCap),
          windowSeconds: Math.round(Number(windowHours) * 3600),
          approvalThreshold: threshold.trim() === '' ? null : Number(threshold),
          alwaysRequireApproval: always,
          allowedScopes: scopes.split(',').map(s => s.trim()).filter(Boolean),
        })
      }}
    >
      <label className="text-xs text-gray-400 space-y-1"><span>Per-action cap ($)</span><input type="number" min={0} step="0.01" value={perAction} onChange={e => setPerAction(e.target.value)} className={field} /></label>
      <label className="text-xs text-gray-400 space-y-1"><span>Rolling-window cap ($)</span><input type="number" min={0} step="0.01" value={windowCap} onChange={e => setWindowCap(e.target.value)} className={field} /></label>
      <label className="text-xs text-gray-400 space-y-1"><span>Window length (hours)</span><input type="number" min={0.02} max={720} step="0.01" value={windowHours} onChange={e => setWindowHours(e.target.value)} className={field} /></label>
      <label className="text-xs text-gray-400 space-y-1"><span>Approval over ($, blank = never)</span><input type="number" min={0} step="0.01" value={threshold} onChange={e => setThreshold(e.target.value)} className={field} /></label>
      <label className="text-xs text-gray-400 space-y-1 sm:col-span-2"><span>Allowed scopes (comma separated)</span><input value={scopes} onChange={e => setScopes(e.target.value)} className={field} style={{ fontFamily: "'JetBrains Mono', monospace" }} /></label>
      <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={always} onChange={e => setAlways(e.target.checked)} className="accent-emerald-500" />Require approval for every action</label>
      <div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-bold text-xs disabled:opacity-50">Save policy</button></div>
    </form>
  )
}
