'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { SiteHeader, SiteFooter } from './components/SiteChrome'
import { DecisionTable } from './components/DecisionTable'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { getAgentPresets, type AgentPreset } from './lib/agentPresets'
import { AegisAgent, AegisError, AegisOwner, type DecisionLogEntry, type EnforceRequest } from '@/lib/aegisSDK'

type AgentDef = { id: string; label: string; icon: string }
type LogLine = { text: string; tone: 'muted' | 'ok' | 'warn' | 'danger' }
type SimAction = { id: string; label: string; kind: 'standard' | 'financial' | 'malicious'; cost: string; desc: string }

// The sandbox runs against the live enforcement API as a throwaway owner
// account created for this browser. Its keys live in this browser only.
type SandboxState = { ownerKey: string; agents: Record<string, { id: string; key: string }> }
const SANDBOX_STORAGE = 'aegis.sandbox.v1'

function loadSandbox(): SandboxState | null {
  try {
    const raw = window.localStorage.getItem(SANDBOX_STORAGE)
    return raw ? (JSON.parse(raw) as SandboxState) : null
  } catch {
    return null
  }
}
function saveSandbox(s: SandboxState | null) {
  try {
    if (s) window.localStorage.setItem(SANDBOX_STORAGE, JSON.stringify(s))
    else window.localStorage.removeItem(SANDBOX_STORAGE)
  } catch {
    /* storage unavailable: sandbox lasts for this tab only */
  }
}

// Known agentic AI products, kept broad on purpose. Add more here as new
// agents ship, or use "Add another agent" in the sandbox UI to register one
// at runtime — the selector, delegation, and kill-switch flow all work off
// this list generically, with no per-agent code required either way.
const defaultAgents: AgentDef[] = [
  { id: 'openai-operator', label: 'OpenAI Operator / ChatGPT Agent', icon: 'bot' },
  { id: 'gemini', label: 'Google Gemini', icon: 'sparkles' },
  { id: 'claude', label: 'Anthropic Claude', icon: 'brain-circuit' },
  { id: 'copilot', label: 'Microsoft Copilot', icon: 'layout-grid' },
  { id: 'apple-intelligence', label: 'Apple Intelligence', icon: 'apple' },
  { id: 'meta-ai', label: 'Meta AI', icon: 'infinity' },
  { id: 'perplexity-comet', label: 'Perplexity Comet', icon: 'compass' },
  { id: 'agentforce', label: 'Salesforce Agentforce', icon: 'building-2' },
  { id: 'grok', label: 'xAI Grok', icon: 'zap' },
  { id: 'amazon-alexa', label: 'Amazon Alexa+', icon: 'mic' },
  { id: 'samsung-bixby', label: 'Samsung Bixby', icon: 'smartphone' },
  { id: 'mistral-le-chat', label: 'Mistral Le Chat', icon: 'wind' },
  { id: 'deepseek', label: 'DeepSeek', icon: 'waves' },
  { id: 'finagent', label: 'Autonomous Finance Agent', icon: 'dollar-sign' },
]

const simActions: SimAction[] = [
  { id: 'sim-action-1', label: 'Draft Email to Client', kind: 'standard', cost: '$0.00', desc: 'Standard task, no spend, no restricted scope.' },
  { id: 'sim-action-2', label: 'Execute $450 SaaS Renewal', kind: 'financial', cost: '$450.00', desc: 'Financial request exceeding the approval threshold.' },
  { id: 'sim-action-3', label: 'Prompt Injection: Leak PII', kind: 'malicious', cost: 'Exfiltrate API', desc: 'Malicious instruction attempting to exfiltrate data outside the granted scope.' },
]

const defaultScopes = {
  email_read: true,
  email_send: false,
  calendar_read: true,
  calendar_write: false,
  drive_read: true,
  drive_write: false,
  banking_read: true,
  banking_transfer: false,
  analytics_read: true,
  analytics_modify: false,
  customer_data_view: true,
  customer_data_export: false,
  payment_processing: true,
  vendor_apis_read: true,
}

function requestFor(action: SimAction): EnforceRequest {
  if (action.kind === 'malicious') return { action: action.label, cost: 0, scopes: ['customer_data_export', 'exfiltrate'], params: { destination: 'unknown-host' } }
  if (action.kind === 'financial') return { action: action.label, cost: 450, scopes: ['payment_processing'], params: { vendor: 'saas-vendor', term: 'annual' } }
  return { action: action.label, cost: 0, scopes: ['email_read', 'calendar_read'], params: { to: 'client' } }
}

export default function Home() {
  const [agentList, setAgentList] = useState<AgentDef[]>(defaultAgents)
  const [agent, setAgent] = useState<string>(defaultAgents[0].id)
  const [customAgentName, setCustomAgentName] = useState('')
  const currentAgent = agentList.find(a => a.id === agent) ?? agentList[0]
  const [spending, setSpending] = useState(1000)
  const [scopes, setScopes] = useState(defaultScopes)
  const [approvalTrigger, setApprovalTrigger] = useState('100')
  const [log, setLog] = useState<LogLine[]>([{ text: '// Ready. Each action below is a real call to the live /api/enforce endpoint.', tone: 'muted' }])
  const [banner, setBanner] = useState<{ text: string; tone: 'idle' | 'ok' | 'warn' | 'danger' }>({ text: 'Waiting for agent action...', tone: 'idle' })
  const [approval, setApproval] = useState<{ open: boolean; desc: string }>({ open: false, desc: '' })
  const [held, setHeld] = useState<{ actionId: string; agentKey: string; req: EnforceRequest } | null>(null)
  const [killed, setKilled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [clock, setClock] = useState('')
  const [serverLog, setServerLog] = useState<DecisionLogEntry[]>([])

  useEffect(() => {
    setClock(new Date().toLocaleTimeString('en-US', { hour12: true }))
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-US', { hour12: true })), 1000)
    return () => clearInterval(t)
  }, [])

  const refreshServerLog = useCallback(async () => {
    const s = loadSandbox()
    if (!s) return
    try {
      setServerLog(await new AegisOwner(s.ownerKey).decisions({ limit: 30 }))
    } catch {
      /* log panel is best-effort */
    }
  }, [])

  useEffect(() => {
    refreshServerLog()
  }, [refreshServerLog])

  // Form validation state
  const [validation, setValidation] = useState<{ field: string; message: string } | null>(null)

  // Apply preset configuration
  const applyPreset = (preset: AgentPreset) => {
    setSpending(preset.spending)
    setScopes(preset.scopes)
    setApprovalTrigger(preset.approvalTrigger)
    setBanner({ text: `Preset applied: ${preset.name}`, tone: 'ok' })
    setLog(prev => [...prev, { text: `// Applied preset: ${preset.name}: ${preset.description}`, tone: 'ok' }])
    setValidation(null)
  }

  // Handle spending validation
  const handleSpendingChange = (value: number) => {
    if (value < 50) {
      setValidation({ field: 'spending', message: 'Minimum spending is $50' })
      return
    }
    if (value > 2000) {
      setValidation({ field: 'spending', message: 'Maximum spending is $2,000' })
      return
    }
    setValidation(null)
    setSpending(value)
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    '?': () => {
      setLog(prev => [...prev, { text: '// Available shortcuts: R=Reset sandbox controls', tone: 'muted' }])
    },
    'r': () => {
      setAgent(defaultAgents[0].id)
      setSpending(1000)
      setApprovalTrigger('100')
      setScopes(defaultScopes)
      setLog([{ text: '// Sandbox controls reset.', tone: 'muted' }])
      setBanner({ text: 'Sandbox reset', tone: 'ok' })
    },
  })

  function timestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: true })
  }

  /** Creates (once per browser) a throwaway owner, and one Aegis agent per sandbox agent. */
  async function ensureSandboxAgent(def: AgentDef, allowCreate: boolean): Promise<{ owner: AegisOwner; agentId: string; agentKey: string }> {
    let s = loadSandbox()
    if (s) {
      try {
        await new AegisOwner(s.ownerKey).listAgents()
      } catch (err) {
        if (err instanceof AegisError && err.status === 401) s = null
        else throw err
      }
    }
    if (!s) {
      const created = await AegisOwner.create('Sandbox visitor')
      s = { ownerKey: created.ownerKey, agents: {} }
      saveSandbox(s)
    }
    const owner = new AegisOwner(s.ownerKey)
    if (!s.agents[def.id]) {
      if (!allowCreate) throw new Error(`Kill switch is on: no key exists for ${def.label} and none will be issued until you restore access`)
      const { agent: a, agentKey } = await owner.createAgent(def.label.slice(0, 80))
      s = { ...s, agents: { ...s.agents, [def.id]: { id: a.id, key: agentKey } } }
      saveSandbox(s)
    }
    return { owner, agentId: s.agents[def.id].id, agentKey: s.agents[def.id].key }
  }

  async function runAction(action: SimAction) {
    if (busy) return
    setBusy(true)
    const t = timestamp()
    try {
      const { owner, agentId, agentKey } = await ensureSandboxAgent(currentAgent, !killed)
      const enabledScopes = Object.entries(scopes).filter(([, enabled]) => enabled).map(([scope]) => scope)
      // Revoked agents keep their (dead) key so you can watch the server block them; policy edits are skipped.
      if (!killed) {
        await owner.setPolicy(agentId, {
          perActionCap: spending,
          windowCap: spending,
          windowSeconds: 86_400,
          approvalThreshold: approvalTrigger === 'always' ? null : Number(approvalTrigger),
          alwaysRequireApproval: approvalTrigger === 'always',
          allowedScopes: enabledScopes,
        })
      }
      const req = requestFor(action)
      setLog(l => [...l, { text: `[${t}] ${currentAgent.label} → POST /api/enforce "${action.label}"`, tone: 'muted' }])
      const result = await new AegisAgent(agentKey).enforce(req)
      const verdict = result.decision.decision
      if (verdict === 'ALLOWED') {
        setLog(l => [...l, { text: `[${t}] 200 ALLOWED: ${result.reason}`, tone: 'ok' }])
        setBanner({ text: `Allowed: ${action.label}`, tone: 'ok' })
      } else if (verdict === 'REQUIRES_APPROVAL' && result.pendingActionId) {
        const pendingId = result.pendingActionId
        setHeld({ actionId: pendingId, agentKey, req })
        setLog(l => [...l, { text: `[${t}] 202 HELD: ${result.reason} Pending action ${pendingId.slice(0, 8)}… queued for you.`, tone: 'warn' }])
        setBanner({ text: 'Held for your approval', tone: 'warn' })
        setApproval({ open: true, desc: `${currentAgent.label} requested "${action.label}" ($${(req.cost ?? 0).toFixed(2)}). The server is holding it until you decide.` })
      } else {
        setLog(l => [...l, { text: `[${t}] 403 BLOCKED: ${result.reason}`, tone: 'danger' }])
        setBanner({ text: `Blocked: ${action.label}`, tone: 'danger' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'enforcement check failed'
      setLog(l => [...l, { text: `[${t}] ERROR: ${msg}`, tone: 'danger' }])
      setBanner({ text: 'Enforcement error', tone: 'danger' })
    } finally {
      setBusy(false)
      refreshServerLog()
    }
  }

  async function decide(approved: boolean) {
    const s = loadSandbox()
    if (!held || !s) return
    setBusy(true)
    const t = timestamp()
    try {
      await new AegisOwner(s.ownerKey).decide(held.actionId, approved)
      if (!approved) {
        setLog(l => [...l, { text: `[${t}] You denied it. The held action can never be released.`, tone: 'danger' }])
        setBanner({ text: 'Denied by you', tone: 'danger' })
      } else {
        setLog(l => [...l, { text: `[${t}] You approved it. The agent now polls for its single-use release token…`, tone: 'ok' }])
        const agentClient = new AegisAgent(held.agentKey)
        const state = await agentClient.poll(held.actionId)
        if (state.approvalToken) {
          const released = await agentClient.enforce({ ...held.req, approvalToken: state.approvalToken })
          setLog(l => [...l, { text: `[${t}] ${released.allowed ? '200 RELEASED' : '403 BLOCKED'}: ${released.reason}`, tone: released.allowed ? 'ok' : 'danger' }])
          const replay = await agentClient.enforce({ ...held.req, approvalToken: state.approvalToken })
          setLog(l => [...l, { text: `[${t}] Replay of the same token → ${replay.decision.decision}: ${replay.reason}`, tone: replay.allowed ? 'warn' : 'muted' }])
          setBanner({ text: released.allowed ? 'Approved and released once' : 'Release blocked', tone: released.allowed ? 'ok' : 'danger' })
        } else {
          setLog(l => [...l, { text: `[${t}] Action is ${state.status}; nothing to release.`, tone: 'warn' }])
        }
      }
    } catch (e) {
      setLog(l => [...l, { text: `[${t}] ERROR: ${e instanceof Error ? e.message : 'decision failed'}`, tone: 'danger' }])
    } finally {
      setApproval({ open: false, desc: '' })
      setHeld(null)
      setBusy(false)
      refreshServerLog()
    }
  }

  async function killSwitch() {
    const s = loadSandbox()
    const t = timestamp()
    if (!s) {
      setLog(l => [...l, { text: `[${t}] No sandbox agents exist yet; nothing to revoke.`, tone: 'muted' }])
      return
    }
    setBusy(true)
    try {
      const revoked = await new AegisOwner(s.ownerKey).revokeAll()
      setKilled(true)
      setApproval({ open: false, desc: '' })
      setHeld(null)
      setLog(l => [...l, { text: `[${t}] KILL SWITCH: ${revoked.length} agent key(s) revoked on the server. Try an action: /api/enforce now returns 403.`, tone: 'danger' }])
      setBanner({ text: 'All sandbox agents revoked', tone: 'danger' })
    } catch (e) {
      setLog(l => [...l, { text: `[${t}] ERROR: ${e instanceof Error ? e.message : 'revoke failed'}`, tone: 'danger' }])
    } finally {
      setBusy(false)
      refreshServerLog()
    }
  }

  function restoreAccess() {
    const s = loadSandbox()
    // Revoked keys stay revoked forever; restoring means issuing fresh agents.
    if (s) saveSandbox({ ...s, agents: {} })
    setKilled(false)
    setLog(l => [...l, { text: `[${timestamp()}] Fresh agent keys will be issued on the next action. The revoked keys stay dead.`, tone: 'muted' }])
  }

  const toneClass: Record<string, string> = { muted: 'text-gray-500', ok: 'text-emerald-400', warn: 'text-amber-400', danger: 'text-rose-400' }


  return (
    <>
      <div className="aegis-home min-h-screen bg-[#07090E] text-gray-100 font-sans" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="fixed inset-0 pointer-events-none opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(16,185,129,.08) 1px, transparent 1px), radial-gradient(rgba(6,182,212,.05) 1px, transparent 1px)', backgroundSize: '32px 32px', backgroundPosition: '0 0, 16px 16px' }} />

        <SiteHeader />

        <section className="relative pt-12 pb-24 md:pt-20 md:pb-32 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <i data-lucide="zap" className="w-3.5 h-3.5" />
                  <span>EARLY BUILD — LIVE ENFORCEMENT API</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
                  Set Portable, Enforceable <br className="hidden sm:block" />
                  <span style={{ background: 'linear-gradient(135deg,#10B981 0%,#06B6D4 50%,#3B82F6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Boundaries for Every AI</span>
                </h1>
                <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto lg:mx-0 font-normal leading-relaxed">
                  AI should feel liberating, not like handing your life to a black box. Aegis is an early build of a human-first trust protocol: your data stays in your control, sensitive actions wait for your approval, and every agent can be stopped in one click.
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <span className="text-gray-500 uppercase tracking-wider font-semibold mr-1">Modeled for:</span>
                  {[
                    { label: 'OpenAI Operator', slug: null, color: null },
                    { label: 'Google Gemini', slug: 'googlegemini', color: null },
                    { label: 'Apple Intelligence', slug: 'apple', color: 'ffffff' },
                    { label: 'Meta Llama', slug: 'meta', color: null },
                    { label: 'Stripe', slug: 'stripe', color: null },
                    { label: 'Plaid', slug: null, color: null },
                  ].map(v => (
                    <span key={v.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-900/90 border border-gray-800 text-gray-300">
                      {v.slug && <img src={`https://cdn.simpleicons.org/${v.slug}${v.color ? '/' + v.color : ''}`} alt="" className="w-3.5 h-3.5" />}
                      {v.label}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500">Conceptual cross-model architecture. No affiliation or current integration with these providers is implied.</p>
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
                    <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Protocol</div>
                    <div className="text-xs text-gray-400">Not yet production security</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-emerald-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Live</div>
                    <div className="text-xs text-gray-400">Sandbox calls the real API</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-cyan-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Logged</div>
                    <div className="text-xs text-gray-400">Append-only decision log</div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 relative flex items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8 }}
                  className="relative w-full aspect-square rounded-3xl overflow-hidden"
                  style={{ background: 'radial-gradient(circle at 30% 20%, rgba(6,182,212,.2), rgba(59,130,246,.1))', boxShadow: '0 0 60px rgba(6,182,212,.3)' }}
                >
                  {/* Animated shield visual */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      animate={{ scale: [1, 1.02, 1], rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity }}
                      className="relative"
                    >
                      <svg width="280" height="280" viewBox="0 0 280 280" className="drop-shadow-lg" style={{ filter: 'drop-shadow(0 0 30px rgba(6,182,212,.6))' }}>
                        <defs>
                          <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="rgba(6,182,212,.8)" />
                            <stop offset="100%" stopColor="rgba(59,130,246,.6)" />
                          </linearGradient>
                        </defs>
                        <path d="M140,20 L60,60 L60,140 Q60,200 140,240 Q220,200 220,140 L220,60 Z" fill="url(#shieldGradient)" stroke="rgba(6,182,212,.6)" strokeWidth="2" />
                        <circle cx="140" cy="130" r="50" fill="none" stroke="rgba(6,182,212,.8)" strokeWidth="2" />
                        <circle cx="140" cy="130" r="30" fill="rgba(6,182,212,.1)" />
                        <text x="140" y="140" textAnchor="middle" fontSize="24" fill="rgba(6,182,212,.9)" fontWeight="bold">AI</text>
                      </svg>
                    </motion.div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        <section id="thesis" className="py-24 border-y border-gray-800/80 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/10 blur-[140px] rounded-full pointer-events-none" />
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs mb-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span>WHY THIS HAS TO EXIST</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-6">Not another AI assistant. The trust layer every agent will need.</h2>
            <p className="text-lg text-gray-300 leading-relaxed mb-4">
              Aegis is designed to let a person set portable, enforceable boundaries for every AI they use: what it may access and do, spending and sharing limits, when approval is mandatory, and a universal action receipt with a revoke button and a kill switch.
            </p>
            <p className="text-lg text-gray-300 leading-relaxed mb-4">
              As agents take on more of representing people — across assistants, phones, banks, and everyday apps — someone has to hold that boundary. A platform that also builds the agent has a structural conflict of interest in also being the referee over it. They can ship a better chatbot; they can&rsquo;t credibly own the neutral authority layer across their own rivals.
            </p>
            <p className="text-sm text-gray-500 mb-12">
              Today this exists as a working sandbox, not a live integration with any provider below — see &ldquo;Modeled for&rdquo; above and the honest capability table in <Link href="/compare" className="text-emerald-400 hover:underline">/compare</Link>.
            </p>

            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>The urgency is real</h3>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="p-6 rounded-2xl border border-gray-800" style={{ background: 'rgba(13,17,23,.75)' }}>
                <div className="text-3xl font-extrabold text-emerald-400 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>57%</div>
                <p className="text-sm text-gray-300 leading-relaxed">of consumers say data security and privacy would most increase their willingness to trust a personal AI assistant — ahead of transparency (48%) and human oversight (46%).</p>
                <a href="https://www.zendesk.com/newsroom/press-releases/global-survey-reveals-growing-consumer-trust-in-personal-ai-assistants/" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-emerald-400 mt-3 inline-block">Zendesk / YouGov, 2026 CX Trends Report →</a>
              </div>
              <div className="p-6 rounded-2xl border border-gray-800" style={{ background: 'rgba(13,17,23,.75)' }}>
                <div className="text-3xl font-extrabold text-cyan-400 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>+63%</div>
                <p className="text-sm text-gray-300 leading-relaxed">year-over-year rise in consumer demand for AI transparency — yet only 37% of organizations currently explain how their AI reaches a decision.</p>
                <a href="https://www.zendesk.com/blog/zendesk-insights/expertise/cutting-through-the-noise-how-ai-transparency-is-changing-cx-for-good/" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-emerald-400 mt-3 inline-block">Zendesk, 2026 CX Trends Report →</a>
              </div>
              <div className="p-6 rounded-2xl border border-gray-800" style={{ background: 'rgba(13,17,23,.75)' }}>
                <div className="text-lg font-bold text-white mb-2">NIST AI RMF</div>
                <p className="text-sm text-gray-300 leading-relaxed">names transparency, accountability, and human oversight matched to risk as core requirements for trustworthy AI — exactly the properties a delegation boundary is built to enforce.</p>
                <a href="https://www.nist.gov/itl/ai-risk-management-framework" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-emerald-400 mt-3 inline-block">NIST AI Risk Management Framework →</a>
              </div>
              <div className="p-6 rounded-2xl border border-gray-800" style={{ background: 'rgba(13,17,23,.75)' }}>
                <div className="text-lg font-bold text-white mb-2">&ldquo;Unlikely to ever be fully solved&rdquo;</div>
                <p className="text-sm text-gray-300 leading-relaxed">is how OpenAI describes prompt injection for browser agents — malicious instructions hidden in ordinary web content that can hijack what an agent does next.</p>
                <a href="https://openai.com/index/hardening-atlas-against-prompt-injection/" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-emerald-400 mt-3 inline-block">OpenAI, hardening ChatGPT Atlas →</a>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 bg-gray-900/40 border-b border-gray-800/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto">
              <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/60 space-y-3">
                <p className="text-xs text-gray-400">The sandbox below talks to the live enforcement API. On your first action it creates a throwaway owner account and one API key per agent you try, kept in this browser. The kill switch revokes those keys on the server, so every later call is refused there, not just greyed out here.</p>
                <button onClick={killed ? restoreAccess : killSwitch} disabled={busy} className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm shadow-xl transition-all flex items-center justify-center gap-3 tracking-wider uppercase group disabled:opacity-50 ${killed ? 'bg-gray-800 text-gray-300' : 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-600/30 hover:shadow-rose-600/50'}`}>
                  <i data-lucide="power" className="w-5 h-5" />
                  <span>{killed ? 'Issue Fresh Agent Keys' : 'Revoke All Agent Access (server-side)'}</span>
                </button>
                <p className="text-[11px] text-gray-500">Want your own durable account, agent keys and approval queue? Use the <Link href="/console" className="text-emerald-400 hover:underline">owner console</Link>.</p>
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
              <p className="text-gray-300 text-base">Set boundaries, then fire sample agent actions. Each one is a real request to the live <code>/api/enforce</code> endpoint with a real agent key, decided server-side and written to a durable decision log. The actions themselves are samples: no email is sent and no money moves.</p>
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
                    {agentList.map(a => (
                      <button key={a.id} onClick={() => setAgent(a.id)} className={`p-3 rounded-xl border text-xs flex flex-col items-center gap-2 text-center transition-all ${agent === a.id ? 'border-emerald-500/50 bg-emerald-500/10 text-white' : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:border-gray-700'}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <i data-lucide={a.icon} className="w-5 h-5" />
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={customAgentName}
                      onChange={e => setCustomAgentName(e.target.value)}
                      placeholder="Add another agent by name…"
                      className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        const label = customAgentName.trim()
                        if (!label) return
                        const id = `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
                        setAgentList(list => [...list, { id, label, icon: 'bot' }])
                        setAgent(id)
                        setCustomAgentName('')
                      }}
                      className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 text-xs font-semibold hover:border-emerald-500/40 hover:text-emerald-300"
                    >
                      + Add
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500">Any agent can be targeted here — this list isn&rsquo;t hardcoded to a fixed set of providers, and any of them can be granted access and killed the same way.</p>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span className="text-gray-400 uppercase">Daily spending limit</span>
                    <span className="text-emerald-400 font-bold text-sm">${spending} / day</span>
                  </div>
                  <input type="range" min={50} max={2000} step={50} value={spending} onChange={e => handleSpendingChange(Number(e.target.value))} className="w-full accent-emerald-500 bg-gray-800 h-2 rounded-lg cursor-pointer" />
                  <div className="flex justify-between text-[10px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>$50</span><span>$1,000</span><span>$2,000</span>
                  </div>
                  {validation?.field === 'spending' && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-red-400 mt-2"
                    >
                      {validation.message}
                    </motion.p>
                  )}
                </div>
                <div className="space-y-3 pt-4 border-t border-gray-800/50">
                  <label className="text-xs text-gray-400 uppercase tracking-wider block" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Quick Presets</label>
                  <div className="grid grid-cols-2 gap-2">
                    {getAgentPresets().map(preset => (
                      <motion.button
                        key={preset.id}
                        onClick={() => applyPreset(preset)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="px-3 py-2 text-xs rounded-lg bg-gray-800/50 hover:bg-gray-700 border border-gray-700 hover:border-emerald-500/50 transition-all text-gray-300 hover:text-emerald-400 text-left"
                      >
                        <div className="font-semibold text-gray-200">{preset.name}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">${preset.spending}/day</div>
                      </motion.button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 pt-4 border-t border-gray-800/50">
                  <label className="text-xs text-gray-400 uppercase tracking-wider block mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Permitted scope isolation</label>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase px-2">Communication</div>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="mail" className="w-3.5 h-3.5 text-cyan-400" />Email read</span>
                        <input type="checkbox" checked={scopes.email_read} onChange={e => setScopes({...scopes, email_read: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="send" className="w-3.5 h-3.5 text-amber-400" />Email send</span>
                        <input type="checkbox" checked={scopes.email_send} onChange={e => setScopes({...scopes, email_send: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="calendar" className="w-3.5 h-3.5 text-blue-400" />Calendar read</span>
                        <input type="checkbox" checked={scopes.calendar_read} onChange={e => setScopes({...scopes, calendar_read: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="calendar-plus" className="w-3.5 h-3.5 text-purple-400" />Calendar write</span>
                        <input type="checkbox" checked={scopes.calendar_write} onChange={e => setScopes({...scopes, calendar_write: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase px-2">Storage & Files</div>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="folder" className="w-3.5 h-3.5 text-emerald-400" />Drive read</span>
                        <input type="checkbox" checked={scopes.drive_read} onChange={e => setScopes({...scopes, drive_read: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="file-plus" className="w-3.5 h-3.5 text-red-400" />Drive write</span>
                        <input type="checkbox" checked={scopes.drive_write} onChange={e => setScopes({...scopes, drive_write: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase px-2">Finance & Transactions</div>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="eye" className="w-3.5 h-3.5 text-cyan-400" />Banking read</span>
                        <input type="checkbox" checked={scopes.banking_read} onChange={e => setScopes({...scopes, banking_read: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="credit-card" className="w-3.5 h-3.5 text-rose-400" />Banking transfer</span>
                        <input type="checkbox" checked={scopes.banking_transfer} onChange={e => setScopes({...scopes, banking_transfer: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="zap" className="w-3.5 h-3.5 text-amber-400" />Payment processing</span>
                        <input type="checkbox" checked={scopes.payment_processing} onChange={e => setScopes({...scopes, payment_processing: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase px-2">Analytics & Insights</div>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="bar-chart-2" className="w-3.5 h-3.5 text-blue-400" />Analytics read</span>
                        <input type="checkbox" checked={scopes.analytics_read} onChange={e => setScopes({...scopes, analytics_read: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="sliders" className="w-3.5 h-3.5 text-purple-400" />Analytics modify</span>
                        <input type="checkbox" checked={scopes.analytics_modify} onChange={e => setScopes({...scopes, analytics_modify: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase px-2">Sensitive Data</div>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="users" className="w-3.5 h-3.5 text-emerald-400" />Customer data view</span>
                        <input type="checkbox" checked={scopes.customer_data_view} onChange={e => setScopes({...scopes, customer_data_view: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="download" className="w-3.5 h-3.5 text-rose-400" />Customer data export</span>
                        <input type="checkbox" checked={scopes.customer_data_export} onChange={e => setScopes({...scopes, customer_data_export: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                      <label className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/50 border border-gray-800 cursor-pointer hover:border-gray-700 transition-all">
                        <span className="flex items-center gap-2 text-xs text-gray-300"><i data-lucide="lock" className="w-3.5 h-3.5 text-purple-400" />Vendor APIs read</span>
                        <input type="checkbox" checked={scopes.vendor_apis_read} onChange={e => setScopes({...scopes, vendor_apis_read: e.target.checked})} className="w-3.5 h-3.5 rounded accent-emerald-500" />
                      </label>
                    </div>
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
                <div className="flex items-center gap-2 pt-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <i data-lucide="check-circle-2" className="w-3.5 h-3.5 shrink-0" />
                  <span className="overflow-hidden text-ellipsis">Boundaries set for {currentAgent.label}: ${spending}/day · {Object.entries(scopes).filter(([, v]) => v).length} scope{Object.entries(scopes).filter(([, v]) => v).length !== 1 ? 's' : ''} · approval {approvalTrigger === 'always' ? 'on every action' : `over $${approvalTrigger}`}</span>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="rounded-2xl p-6 space-y-6" style={{ background: 'rgba(13,17,23,.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.08)' }}>
                  <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><i data-lucide="terminal" className="w-5 h-5 text-cyan-400" />2. Send agent actions</h3>
                    <span className="text-xs text-emerald-400 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{killed ? 'Agents revoked' : 'Live API'}</span>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {simActions.map((a, idx) => (
                      <motion.button
                        key={a.id}
                        onClick={() => runAction(a)}
                        disabled={busy}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`p-3 rounded-xl text-left transition-all group disabled:opacity-40 ${a.kind === 'malicious' ? 'bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30' : 'bg-gray-900 hover:bg-gray-800 border border-gray-700'}`}
                      >
                        <div className={`text-xs mb-1 ${a.kind === 'malicious' ? 'text-rose-400' : a.kind === 'financial' ? 'text-amber-400' : 'text-gray-400'}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{a.kind === 'malicious' ? 'Malicious threat' : a.kind === 'financial' ? 'Financial request' : 'Standard task'}</div>
                        <div className="text-sm font-semibold text-white">{a.label}</div>
                        <div className="text-[11px] text-gray-500 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Cost: {a.cost}</div>
                      </motion.button>
                    ))}
                  </div>
                  <div className="bg-black/80 rounded-xl p-4 border border-gray-800 text-xs space-y-3 min-h-[220px] flex flex-col justify-between overflow-hidden shadow-inner" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <div className="flex items-center justify-between border-b border-gray-800/80 pb-2 text-gray-500 text-[11px]">
                      <span>AEGIS ENFORCEMENT LOG</span>
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
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                      className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-amber-300"><i data-lucide="shield-alert" className="w-5 h-5 text-amber-400" /><span>MANDATORY APPROVAL REQUIRED</span></div>
                        <span className="text-xs bg-amber-500/20 px-2 py-0.5 rounded" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Risk: HIGH</span>
                      </div>
                      <p className="text-xs text-gray-300">{approval.desc}</p>
                      <div className="flex gap-3 pt-1">
                        <motion.button
                          onClick={() => decide(true)}
                          disabled={busy}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs transition-all flex items-center gap-1.5"
                        >
                          <i data-lucide="check-circle" className="w-4 h-4" />Approve
                        </motion.button>
                        <motion.button
                          onClick={() => decide(false)}
                          disabled={busy}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs transition-all flex items-center gap-1.5"
                        >
                          <i data-lucide="x-circle" className="w-4 h-4" />Deny
                        </motion.button>
                      </div>
                    </motion.div>
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
                { icon: 'power', color: 'rose', title: 'One-Click Kill Switch', body: 'One click revokes an agent’s API key on the server; its very next enforcement call is blocked, and any approval it was waiting on is cancelled.', points: ['Single-click revoke', 'Visible, timestamped action log'] },
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
            <div className="grid lg:grid-cols-12 gap-12 items-start">
              <div className="lg:col-span-4 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <i data-lucide="file-check-2" className="w-3.5 h-3.5" /><span>DECISION LOG</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Every decision, on the record</h2>
                <p className="text-gray-300 text-base leading-relaxed">Each enforcement decision, approval, denial and revoke is written to an append-only table in Postgres with the actor and a server timestamp. The database rejects edits and deletes to it, including from the app itself. The rows on the right are your sandbox&rsquo;s, read back from the server.</p>
                <div className="space-y-3 pt-2">
                  <div className="p-4 rounded-xl border border-gray-800 flex items-start gap-3" style={{ background: 'rgba(13,17,23,.75)' }}>
                    <i data-lucide="key-round" className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div><h4 className="text-sm font-bold text-white">Single-use approvals</h4><p className="text-xs text-gray-400">Approving a held action mints one token bound to the hash of that exact request. A different amount, recipient or agent is refused, and a second use is refused.</p></div>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-800 flex items-start gap-3" style={{ background: 'rgba(13,17,23,.75)' }}>
                    <i data-lucide="shield-alert" className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div><h4 className="text-sm font-bold text-white">Honest limits</h4><p className="text-xs text-gray-400">Aegis decides; it does not intercept. An agent that never calls the API is not stopped, and log entries are not cryptographically signed yet.</p></div>
                  </div>
                </div>
                <Link href="/console" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gray-900 border border-emerald-500/40 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/10">
                  <i data-lucide="layout-dashboard" className="w-4 h-4" />Open the owner console
                </Link>
              </div>
              <div className="lg:col-span-8">
                <div className="rounded-2xl p-6 border border-gray-800 relative overflow-hidden" style={{ background: 'rgba(13,17,23,.75)', backdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center justify-between pb-4 border-b border-gray-800 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span className="text-gray-400 flex items-center gap-2"><i data-lucide="list-tree" className="w-4 h-4 text-emerald-400" />SERVER DECISION LOG</span>
                    <span className={killed ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>{killed ? 'AGENTS REVOKED' : 'RUNNING'}</span>
                  </div>
                  <div className="mt-4 max-h-[420px] overflow-y-auto">
                    {serverLog.length === 0 ? (
                      <div className="text-gray-500 p-3 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>No entries yet. Run an action in the sandbox above.</div>
                    ) : (
                      <DecisionTable rows={serverLog} />
                    )}
                  </div>
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
                    <th className="py-4 px-4 text-emerald-400 bg-emerald-500/5 rounded-t-xl font-bold">Aegis model (concept)</th>
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
            <p className="text-center text-xs text-gray-500 mt-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>This table describes design intent for this concept, not certified or audited capabilities of any listed company&rsquo;s products.</p>
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

        <section className="py-24 border-t border-gray-800/80 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">Protect Human Sovereignty in the Age of Autonomous AI</h2>
            <p className="text-gray-300 text-lg">A protocol concept built for the institutions and developers who will need this once agents act on their behalf across rival platforms — try the sandbox yourself, no signup required.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <a href="#sandbox" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                <i data-lucide="play-circle" className="w-5 h-5" />
                Launch Interactive Sandbox
              </a>
              <Link href="/compare" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gray-900/80 hover:bg-gray-800 border border-gray-700/80 text-gray-200 font-semibold hover:text-white transition-all flex items-center justify-center gap-3">
                <i data-lucide="git-compare" className="w-5 h-5 text-cyan-400" />
                Compare to Real Platforms
              </Link>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </>
  )
}
