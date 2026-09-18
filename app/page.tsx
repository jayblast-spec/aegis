'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'

type AgentKey = 'openai' | 'gemini' | 'finagent'
type LogLine = { text: string; tone: 'muted' | 'ok' | 'warn' | 'danger' }
type SimAction = { id: string; label: string; kind: 'standard' | 'financial' | 'malicious'; cost: string; desc: string }

const agents: Record<AgentKey, { label: string; icon: string }> = {
  openai: { label: 'OpenAI Operator', icon: 'bot' },
  gemini: { label: 'Gemini Executive', icon: 'sparkles' },
  finagent: { label: 'Autonomous Finance', icon: 'dollar-sign' },
}

const simActions: SimAction[] = [
  { id: 'sim-action-1', label: 'Draft Email to Client', kind: 'standard', cost: '$0.00', desc: 'Standard task, no spend, no restricted scope.' },
  { id: 'sim-action-2', label: 'Execute $450 SaaS Renewal', kind: 'financial', cost: '$450.00', desc: 'Financial request exceeding the approval threshold.' },
  { id: 'sim-action-3', label: 'Prompt Injection: Leak PII', kind: 'malicious', cost: 'Exfiltrate API', desc: 'Malicious instruction attempting to exfiltrate data outside the granted scope.' },
]

export default function Home() {
  const [agent, setAgent] = useState<AgentKey>('openai')
  const [spending, setSpending] = useState(250)
  const [scopeEmail, setScopeEmail] = useState(true)
  const [scopeBank, setScopeBank] = useState(true)
  const [scopePii, setScopePii] = useState(false)
  const [approvalTrigger, setApprovalTrigger] = useState('100')
  const [log, setLog] = useState<LogLine[]>([{ text: '// System ready. Click any action above to test the policy simulator...', tone: 'muted' }])
  const [banner, setBanner] = useState<{ text: string; tone: 'idle' | 'ok' | 'warn' | 'danger' }>({ text: 'Waiting for agent action...', tone: 'idle' })
  const [approval, setApproval] = useState<{ open: boolean; desc: string }>({ open: false, desc: '' })
  const [killed, setKilled] = useState(false)
  const [clock, setClock] = useState('')

  useEffect(() => {
    setClock(new Date().toLocaleTimeString('en-US', { hour12: true }))
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-US', { hour12: true })), 1000)
    return () => clearInterval(t)
  }, [])

  function timestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: true })
  }

  function runAction(action: SimAction) {
    const t = timestamp()
    if (action.kind === 'malicious') {
      setLog(l => [...l, { text: `[${t}] ${agents[agent].label} → "${action.label}"`, tone: 'muted' }, { text: `[${t}] BLOCKED — request falls outside granted scope isolation.`, tone: 'danger' }])
      setBanner({ text: `Blocked: ${action.label}`, tone: 'danger' })
      setApproval({ open: false, desc: '' })
      return
    }
    if (action.kind === 'financial') {
      const cost = 450
      if (cost > Number(approvalTrigger) || approvalTrigger === 'always') {
        setLog(l => [...l, { text: `[${t}] ${agents[agent].label} → "${action.label}"`, tone: 'muted' }, { text: `[${t}] SUSPENDED — exceeds approval threshold ($${approvalTrigger === 'always' ? '0' : approvalTrigger}). Awaiting your decision.`, tone: 'warn' }])
        setBanner({ text: 'Awaiting mandatory approval...', tone: 'warn' })
        setApproval({ open: true, desc: `Agent requested a $${cost.toFixed(2)} transfer exceeding your threshold. Action suspended pending your decision.` })
        return
      }
      setLog(l => [...l, { text: `[${t}] ${agents[agent].label} → "${action.label}"`, tone: 'muted' }, { text: `[${t}] ALLOWED — within daily limit ($${spending}/day).`, tone: 'ok' }])
      setBanner({ text: `Allowed: ${action.label}`, tone: 'ok' })
      return
    }
    setLog(l => [...l, { text: `[${t}] ${agents[agent].label} → "${action.label}"`, tone: 'muted' }, { text: `[${t}] ALLOWED — read/draft scope, no spend.`, tone: 'ok' }])
    setBanner({ text: `Allowed: ${action.label}`, tone: 'ok' })
  }

  function decide(approved: boolean) {
    const t = timestamp()
    if (approved) {
      setLog(l => [...l, { text: `[${t}] You approved the suspended action.`, tone: 'ok' }])
      setBanner({ text: 'Approved by you', tone: 'ok' })
    } else {
      setLog(l => [...l, { text: `[${t}] You blocked the suspended action.`, tone: 'danger' }])
      setBanner({ text: 'Blocked by you', tone: 'danger' })
    }
    setApproval({ open: false, desc: '' })
  }

  const toneClass: Record<string, string> = { muted: 'text-gray-500', ok: 'text-emerald-400', warn: 'text-amber-400', danger: 'text-rose-400' }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      <Script id="tailwind-config" strategy="beforeInteractive">{`
        tailwind.config = { corePlugins: { preflight: false }, theme: { extend: { colors: { cyberBg: '#07090E' } } } };
      `}</Script>
      <Script src="https://unpkg.com/lucide@latest" strategy="afterInteractive" onLoad={() => { (window as any).lucide?.createIcons?.() }} />
      <div className="min-h-screen bg-[#07090E] text-gray-100 font-sans" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="fixed inset-0 pointer-events-none opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(16,185,129,.08) 1px, transparent 1px), radial-gradient(rgba(6,182,212,.05) 1px, transparent 1px)', backgroundSize: '32px 32px', backgroundPosition: '0 0, 16px 16px' }} />

        <header className="sticky top-0 z-50 w-full border-b border-gray-800/80 bg-[#07090E]/90 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 p-[1px] shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-all">
                  <div className="w-full h-full bg-[#07090E] rounded-[11px] flex items-center justify-center">
                    <i data-lucide="shield-check" className="w-5 h-5 text-emerald-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xl tracking-tight text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>AEGIS</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">Prototype</span>
                  </div>
                  <span className="text-[11px] text-gray-400 hidden sm:block" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Independent Trust &amp; Delegation</span>
                </div>
              </Link>
              <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900/80 border border-gray-800 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-gray-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>DEMO MODE: <span className="text-emerald-400 font-semibold">RUNNING LOCALLY</span></span>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
              <a href="#platform" className="hover:text-emerald-400 transition-colors">Platform</a>
              <a href="#sandbox" className="hover:text-emerald-400 transition-colors">Sandbox</a>
              <a href="#receipt" className="hover:text-emerald-400 transition-colors">Action Ledger</a>
              <a href="#neutral-advantage" className="hover:text-emerald-400 transition-colors">Neutrality</a>
              <Link href="/compare" className="hover:text-emerald-400 transition-colors">Compare</Link>
            </nav>
            <a href="#sandbox" className="relative group overflow-hidden rounded-xl p-[1px] font-semibold text-xs sm:text-sm">
              <span className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 opacity-80 group-hover:opacity-100 transition-all" />
              <span className="relative px-4 py-2.5 rounded-[11px] bg-[#07090E] flex items-center gap-2 group-hover:bg-transparent text-white">Try the Sandbox</span>
            </a>
          </div>
        </header>

        <section className="relative pt-12 pb-24 md:pt-20 md:pb-32 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <i data-lucide="shield" className="w-3.5 h-3.5" />
                  <span>NEUTRAL AUTHORITY LAYER FOR AGENTIC AI — PROTOTYPE</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
                  Set Portable, Enforceable <br className="hidden sm:block" />
                  <span style={{ background: 'linear-gradient(135deg,#10B981 0%,#06B6D4 50%,#3B82F6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Boundaries for Every AI</span>
                </h1>
                <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto lg:mx-0 font-normal leading-relaxed">
                  AI should feel liberating, not like handing your life to a black box. Aegis is a working design prototype for a human-first trust layer: your data stays in your control, sensitive actions wait for your approval, and every agent can be stopped in one click.
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <span className="text-gray-500 uppercase tracking-wider font-semibold mr-1">Modeled for:</span>
                  {['OpenAI Operator', 'Google Gemini', 'Apple Intelligence', 'Meta Llama', 'Stripe & Plaid APIs'].map(v => (
                    <span key={v} className="px-2.5 py-1 rounded-md bg-gray-900/90 border border-gray-800 text-gray-300">{v}</span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500">Conceptual cross-model architecture — no affiliation or current integration with these providers is implied.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
                  <a href="#sandbox" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-semibold text-base shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                    <i data-lucide="play-circle" className="w-5 h-5" />
                    <span>Explore Interactive Sandbox</span>
                  </a>
                  <Link href="/compare" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gray-900/80 hover:bg-gray-800 border border-gray-700/80 text-gray-200 font-semibold text-base hover:text-white transition-all flex items-center justify-center gap-3">
                    <i data-lucide="cpu" className="w-5 h-5 text-cyan-400" />
                    <span>Compare to Real Platforms</span>
                  </Link>
                </div>
                <div className="pt-8 border-t border-gray-800/80 grid grid-cols-3 gap-4 text-center lg:text-left">
                  <div>
                    <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Prototype</div>
                    <div className="text-xs text-gray-400">Not yet production security</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-emerald-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Live</div>
                    <div className="text-xs text-gray-400">Sandbox runs in your browser</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-cyan-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Local-only</div>
                    <div className="text-xs text-gray-400">No data leaves this page</div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 relative">
                <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: 'rgba(13,17,23,.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(16,185,129,.25)', boxShadow: '0 0 25px -5px rgba(16,185,129,.15)' }}>
                  <div className="flex items-center justify-between pb-4 border-b border-gray-800 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      <span className="text-emerald-400 font-semibold">AEGIS SANDBOX: {killed ? 'LOCKED DOWN' : 'ACTIVE'}</span>
                    </div>
                  </div>
                  <div className="relative w-full h-[300px] my-4 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-2xl border border-emerald-500/20" style={{ background: 'radial-gradient(circle at center, rgba(16,185,129,.08), transparent 70%)' }} />
                    <div className="relative w-40 h-40 rounded-full border border-emerald-500/30 flex items-center justify-center animate-spin-slow">
                      <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(16,185,129,.35), transparent 70%)' }} />
                    </div>
                    <i data-lucide={killed ? 'shield-off' : 'shield-check'} className={`absolute w-16 h-16 ${killed ? 'text-rose-500' : 'text-emerald-400'}`} />
                    <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2" style={{ fontFamily: "'JetBrains Mono', monospace", background: 'rgba(13,17,23,.75)' }}>
                      <i data-lucide="lock" className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Spending limit: <strong className="text-white">${spending}/day</strong></span>
                    </div>
                    <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg border border-cyan-500/30 text-[11px] text-cyan-300 flex items-center gap-2" style={{ fontFamily: "'JetBrains Mono', monospace", background: 'rgba(13,17,23,.75)' }}>
                      <i data-lucide="shield-alert" className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Injection test: <strong className="text-white">{log.some(l => l.tone === 'danger') ? 'BLOCKED' : 'READY'}</strong></span>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-800 text-xs text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    Scroll down to run this yourself in the sandbox below — every result here is generated live in your browser, nothing is prerecorded.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="sandbox" className="py-20 border-y border-gray-800/80 relative" style={{ background: 'rgba(13,17,23,.6)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <i data-lucide="sliders" className="w-3.5 h-3.5" />
                <span>LIVE POLICY SIMULATOR</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Interactive Agent Governance Sandbox</h2>
              <p className="text-gray-300 text-base">Set boundaries, then simulate agent actions to see how Aegis&rsquo;s policy model would respond. This runs entirely in your browser — it is a design simulation, not a connection to any real AI agent.</p>
            </div>

            <div className="grid lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 rounded-2xl p-6 space-y-6" style={{ background: 'rgba(13,17,23,.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.08)' }}>
                <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-4">
                  <i data-lucide="settings-2" className="w-5 h-5 text-emerald-400" />
                  1. Select agent &amp; set boundaries
                </h3>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 uppercase tracking-wider block" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Target AI agent</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(agents) as AgentKey[]).map(key => (
                      <button key={key} onClick={() => setAgent(key)} className={`p-3 rounded-xl border text-xs flex flex-col items-center gap-2 text-center transition-all ${agent === key ? 'border-emerald-500/50 bg-emerald-500/10 text-white' : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:border-gray-700'}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <i data-lucide={agents[key].icon} className="w-5 h-5" />
                        {agents[key].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span className="text-gray-400 uppercase">Daily spending limit</span>
                    <span className="text-emerald-400 font-bold text-sm">${spending} / day</span>
                  </div>
                  <input type="range" min={50} max={2000} step={50} value={spending} onChange={e => setSpending(Number(e.target.value))} className="w-full accent-emerald-500 bg-gray-800 h-2 rounded-lg cursor-pointer" />
                  <div className="flex justify-between text-[10px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>$50</span><span>$1,000</span><span>$2,000</span>
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <label className="text-xs text-gray-400 uppercase tracking-wider block" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Permitted scope isolation</label>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between p-3 rounded-xl bg-gray-900/80 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                      <span className="flex items-center gap-2 text-sm text-gray-200"><i data-lucide="mail" className="w-4 h-4 text-cyan-400" />Email read/draft only</span>
                      <input type="checkbox" checked={scopeEmail} onChange={e => setScopeEmail(e.target.checked)} className="w-4 h-4 rounded accent-emerald-500" />
                    </label>
                    <label className="flex items-center justify-between p-3 rounded-xl bg-gray-900/80 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                      <span className="flex items-center gap-2 text-sm text-gray-200"><i data-lucide="credit-card" className="w-4 h-4 text-emerald-400" />Bank wire / transfer API</span>
                      <input type="checkbox" checked={scopeBank} onChange={e => setScopeBank(e.target.checked)} className="w-4 h-4 rounded accent-emerald-500" />
                    </label>
                    <label className="flex items-center justify-between p-3 rounded-xl bg-gray-900/80 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                      <span className="flex items-center gap-2 text-sm text-gray-200"><i data-lucide="database" className="w-4 h-4 text-purple-400" />Export PII / customer data</span>
                      <input type="checkbox" checked={scopePii} onChange={e => setScopePii(e.target.checked)} className="w-4 h-4 rounded accent-emerald-500" />
                    </label>
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <label className="text-xs text-gray-400 uppercase tracking-wider block" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Mandatory approval trigger</label>
                  <select value={approvalTrigger} onChange={e => setApprovalTrigger(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-sm text-gray-200 focus:border-emerald-500 focus:outline-none" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <option value="100">Any action over $100.00</option>
                    <option value="500">Any action over $500.00</option>
                    <option value="always">Require approval for all actions</option>
                  </select>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="rounded-2xl p-6 space-y-6" style={{ background: 'rgba(13,17,23,.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.08)' }}>
                  <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><i data-lucide="terminal" className="w-5 h-5 text-cyan-400" />2. Simulate agent actions</h3>
                    <span className="text-xs text-emerald-400 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Sandbox active</span>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {simActions.map(a => (
                      <button key={a.id} onClick={() => runAction(a)} disabled={killed} className={`p-3 rounded-xl text-left transition-all group disabled:opacity-40 ${a.kind === 'malicious' ? 'bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30' : 'bg-gray-900 hover:bg-gray-800 border border-gray-700'}`}>
                        <div className={`text-xs mb-1 ${a.kind === 'malicious' ? 'text-rose-400' : a.kind === 'financial' ? 'text-amber-400' : 'text-gray-400'}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{a.kind === 'malicious' ? 'Malicious threat' : a.kind === 'financial' ? 'Financial request' : 'Standard task'}</div>
                        <div className="text-sm font-semibold text-white">{a.label}</div>
                        <div className="text-[11px] text-gray-500 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Cost: {a.cost}</div>
                      </button>
                    ))}
                  </div>
                  <div className="bg-black/80 rounded-xl p-4 border border-gray-800 text-xs space-y-3 min-h-[220px] flex flex-col justify-between overflow-hidden shadow-inner" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <div className="flex items-center justify-between border-b border-gray-800/80 pb-2 text-gray-500 text-[11px]">
                      <span>AEGIS SANDBOX LOG</span>
                      <span>{clock}</span>
                    </div>
                    <div className="space-y-2 text-gray-300 overflow-y-auto max-h-[160px] pr-2">
                      {log.map((l, i) => <div key={i} className={toneClass[l.tone]}>{l.text}</div>)}
                    </div>
                    <div className="p-3 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 flex items-center justify-between">
                      <span className="flex items-center gap-2"><i data-lucide="info" className="w-4 h-4 text-cyan-400" /><span className={toneClass[banner.tone === 'idle' ? 'muted' : banner.tone]}>{banner.text}</span></span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-gray-800">{banner.tone.toUpperCase()}</span>
                    </div>
                  </div>
                  {approval.open && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-amber-300"><i data-lucide="shield-alert" className="w-5 h-5 text-amber-400" /><span>MANDATORY APPROVAL REQUIRED</span></div>
                        <span className="text-xs bg-amber-500/20 px-2 py-0.5 rounded" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Risk: HIGH</span>
                      </div>
                      <p className="text-xs text-gray-300">{approval.desc}</p>
                      <div className="flex gap-3 pt-1">
                        <button onClick={() => decide(true)} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs transition-all flex items-center gap-1.5"><i data-lucide="check-circle" className="w-4 h-4" />Approve</button>
                        <button onClick={() => decide(false)} className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs transition-all flex items-center gap-1.5"><i data-lucide="x-circle" className="w-4 h-4" />Block</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="platform" className="py-24 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <i data-lucide="layers" className="w-3.5 h-3.5" /><span>SYSTEM ARCHITECTURE</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">Four Pillars of Portable Agent Trust</h2>
              <p className="text-gray-400 text-lg">The interface model for safely delegating authority to autonomous AI across competing tech ecosystems.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: 'shield-check', color: 'emerald', title: 'Access & Action Governance', body: 'Granular scope isolation. Specify exactly what APIs, files, and channels an agent can touch — regardless of which model runs it.', points: ['Scope isolation per vendor', 'Boundary defined before access'] },
                { icon: 'dollar-sign', color: 'cyan', title: 'Spending & Time Caps', body: 'Rate limits, balance ceilings, and auto-expiring temporary delegation passes to stop runaway agent spending before it happens.', points: ['Daily / per-transaction caps', 'Auto-expiring access windows'] },
                { icon: 'user-check', color: 'amber', title: 'Mandatory Approvals', body: 'Configurable human-in-the-loop triggers that force explicit sign-off for high-risk actions, transfers, or sensitive data exports.', points: ['Manual approval popups', 'Risk-based step-ups'] },
                { icon: 'power', color: 'rose', title: 'One-Click Kill Switch', body: 'A visible action ledger with a single-click revoke that immediately marks an agent’s authority as void in this interface.', points: ['Single-click revoke', 'Visible, timestamped action log'] },
              ].map(p => (
                <div key={p.title} className={`p-8 rounded-2xl border border-gray-800 hover:border-${p.color}-500/40 transition-all duration-300 group hover:-translate-y-1`} style={{ background: 'rgba(13,17,23,.75)', backdropFilter: 'blur(12px)' }}>
                  <div className={`w-12 h-12 rounded-xl bg-${p.color}-500/10 border border-${p.color}-500/30 flex items-center justify-center mb-6`}>
                    <i data-lucide={p.icon} className={`w-6 h-6 text-${p.color}-400`} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{p.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed mb-4">{p.body}</p>
                  <ul className="space-y-2 text-xs text-gray-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.points.map(pt => <li key={pt} className="flex items-center gap-2"><i data-lucide="check" className={`w-3.5 h-3.5 text-${p.color}-400`} />{pt}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="receipt" className="py-20 border-y border-gray-800/80" style={{ background: 'rgba(13,17,23,.4)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-5 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <i data-lucide="file-check-2" className="w-3.5 h-3.5" /><span>ACTION LEDGER</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Visible Receipts &amp; Instant Kill Switch</h2>
                <p className="text-gray-300 text-base leading-relaxed">Every simulated action produces a timestamped, visible entry in the action ledger below. If an agent goes rogue in this demo, trigger the kill switch to revoke its authority instantly.</p>
                <div className="space-y-3 pt-2">
                  <div className="p-4 rounded-xl border border-gray-800 flex items-start gap-3" style={{ background: 'rgba(13,17,23,.75)' }}>
                    <i data-lucide="shield-alert" className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div><h4 className="text-sm font-bold text-white">Revoke marks authority void</h4><p className="text-xs text-gray-400">This demo revoke updates the interface state immediately — it does not call any external provider.</p></div>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-800 flex items-start gap-3" style={{ background: 'rgba(13,17,23,.75)' }}>
                    <i data-lucide="file-text" className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div><h4 className="text-sm font-bold text-white">Plain, readable receipts</h4><p className="text-xs text-gray-400">Each entry records the agent, the action, the decision, and the time — no cryptographic signing is implemented in this prototype.</p></div>
                  </div>
                </div>
                <div className="pt-4">
                  <button onClick={() => setKilled(k => !k)} className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm shadow-xl transition-all flex items-center justify-center gap-3 tracking-wider uppercase group ${killed ? 'bg-gray-800 text-gray-300' : 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-600/30 hover:shadow-rose-600/50'}`}>
                    <i data-lucide="power" className="w-5 h-5" />
                    <span>{killed ? 'Restore Sandbox' : 'Trigger Kill Switch (Demo)'}</span>
                  </button>
                </div>
              </div>
              <div className="lg:col-span-7">
                <div className="rounded-2xl p-6 border border-gray-800 relative overflow-hidden" style={{ background: 'rgba(13,17,23,.75)', backdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center justify-between pb-4 border-b border-gray-800 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span className="text-gray-400 flex items-center gap-2"><i data-lucide="list-tree" className="w-4 h-4 text-emerald-400" />LIVE SANDBOX LOG</span>
                    <span className="text-emerald-400 font-bold">{killed ? 'HALTED' : 'RUNNING'}</span>
                  </div>
                  <div className="mt-4 space-y-3 text-xs max-h-[380px] overflow-y-auto pr-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {log.length <= 1 ? (
                      <div className="text-gray-500 p-3">No actions run yet — try the sandbox above.</div>
                    ) : log.map((l, i) => (
                      <div key={i} className={`p-3 rounded-xl bg-gray-900/90 border border-gray-800 ${toneClass[l.tone]}`}>{l.text}</div>
                    ))}
                  </div>
                  {killed && (
                    <div className="absolute inset-0 bg-rose-950/90 backdrop-blur-md p-8 flex flex-col items-center justify-center text-center space-y-4 z-20">
                      <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center"><i data-lucide="shield-off" className="w-8 h-8 text-rose-500" /></div>
                      <h3 className="text-2xl font-extrabold text-white tracking-wider">SANDBOX LOCKED DOWN</h3>
                      <p className="text-xs text-rose-200 max-w-md" style={{ fontFamily: "'JetBrains Mono', monospace" }}>This demo agent&rsquo;s authority has been marked void in the interface.</p>
                      <button onClick={() => setKilled(false)} className="px-6 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-gray-200 transition-all" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Restore Sandbox</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="neutral-advantage" className="py-24 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <i data-lucide="shield-alert" className="w-3.5 h-3.5" /><span>THE AEGIS PROTOCOL · FUTURE VISION</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">The trust protocol agents will need.</h2>
              <p className="text-gray-300 text-base sm:text-lg">Aegis imagines a future where every agent carries a human-readable mandate, receives only time-bound authority, emits a signed receipt, and can be revoked everywhere at once. Platforms build the intelligence; people keep the authority.</p>
            </div>
            <div className="rounded-3xl p-6 sm:p-8 border border-gray-800 overflow-x-auto" style={{ background: 'rgba(13,17,23,.75)', backdropFilter: 'blur(12px)' }}>
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <th className="py-4 px-4">Governance vector</th>
                    <th className="py-4 px-4">OpenAI / tech silos</th>
                    <th className="py-4 px-4">Big tech OS (Apple/Google)</th>
                    <th className="py-4 px-4 text-emerald-400 bg-emerald-500/5 rounded-t-xl font-bold">Aegis model (prototype)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 text-sm">
                  {[
                    { vector: 'Cross-rival portability', icon: 'globe', silo: 'Locked to internal ecosystem', os: 'Restricted to native OS APIs', aegis: 'Designed to be model-agnostic' },
                    { vector: 'Who defines the boundary', icon: 'user', silo: 'Vendor-defined defaults', os: 'Platform-defined defaults', aegis: 'The person delegating, by design' },
                    { vector: 'Conflict of interest', icon: 'scale', silo: 'Referees its own agent', os: 'Referees its own ecosystem', aegis: 'Not a model vendor itself' },
                    { vector: 'Revocation scope', icon: 'power', silo: 'Per-vendor only', os: 'Per-OS only', aegis: 'Intended to span providers' },
                  ].map(r => (
                    <tr key={r.vector}>
                      <td className="py-4 px-4 font-semibold text-white flex items-center gap-2"><i data-lucide={r.icon} className="w-4 h-4 text-cyan-400" />{r.vector}</td>
                      <td className="py-4 px-4 text-gray-400">{r.silo}</td>
                      <td className="py-4 px-4 text-gray-400">{r.os}</td>
                      <td className="py-4 px-4 text-emerald-300 font-semibold bg-emerald-500/5">{r.aegis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-center text-xs text-gray-500 mt-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>This table describes design intent for a prototype, not certified or audited capabilities of any listed company&rsquo;s products.</p>
          </div>
        </section>

        <section className="py-20 border-t border-gray-800/80">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">See how Aegis compares to what exists today</h2>
            <p className="text-gray-400">Real platforms already solve pieces of this problem for engineering teams. Read honest, researched comparisons before assuming this replaces them.</p>
            <Link href="/compare" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-semibold hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all">
              <i data-lucide="git-compare" className="w-5 h-5" />
              Compare Aegis to real platforms
            </Link>
          </div>
        </section>

        <footer className="border-t border-gray-800/80 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-2 text-gray-300"><i data-lucide="shield-check" className="w-4 h-4 text-emerald-400" />AEGIS</span>
            <span>Your rules travel with you. No model owns your life.</span>
            <span className="uppercase tracking-wider">Prototype · Local demo only</span>
          </div>
        </footer>
      </div>
    </>
  )
}
