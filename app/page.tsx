'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { Session } from '@supabase/supabase-js'
import { supabase, type DelegationRow } from '@/lib/supabaseClient'
import { OAUTH_PROVIDERS, buildOAuthAuthUrl } from '@/lib/oauthProviders'
import { SiteHeader, SiteFooter } from './components/SiteChrome'
import { SandboxLog } from './components/SandboxLog'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { exportDelegationsToCSV } from './lib/exportUtils'
import { getAgentPresets, type AgentPreset } from './lib/agentPresets'

type OAuthConnectionRow = {
  id: string
  provider: string
  account_email: string | null
  scope: string
  status: 'active' | 'revoked'
  created_at: string
  revoked_at: string | null
}

type AgentDef = { id: string; label: string; icon: string }
type LogLine = { text: string; tone: 'muted' | 'ok' | 'warn' | 'danger' }
type SimAction = { id: string; label: string; kind: 'standard' | 'financial' | 'malicious'; cost: string; desc: string }

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

export default function Home() {
  const [agentList, setAgentList] = useState<AgentDef[]>(defaultAgents)
  const [agent, setAgent] = useState<string>(defaultAgents[0].id)
  const [customAgentName, setCustomAgentName] = useState('')
  const currentAgent = agentList.find(a => a.id === agent) ?? agentList[0]
  const [spending, setSpending] = useState(250)
  const [scopes, setScopes] = useState({
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
    payment_processing: false,
    vendor_apis_read: true,
  })
  const [approvalTrigger, setApprovalTrigger] = useState('100')
  const [log, setLog] = useState<LogLine[]>([{ text: '// System ready. Click any action above to test the policy simulator...', tone: 'muted' }])
  const [banner, setBanner] = useState<{ text: string; tone: 'idle' | 'ok' | 'warn' | 'danger' }>({ text: 'Waiting for agent action...', tone: 'idle' })
  const [approval, setApproval] = useState<{ open: boolean; desc: string }>({ open: false, desc: '' })
  const [killed, setKilled] = useState(false)
  const [clock, setClock] = useState('')

  const [session, setSession] = useState<Session | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authStatus, setAuthStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [delegation, setDelegation] = useState<DelegationRow | null>(null)
  const [delegationBusy, setDelegationBusy] = useState(false)
  const [oauthConnections, setOauthConnections] = useState<OAuthConnectionRow[]>([])
  const [oauthBusyProvider, setOauthBusyProvider] = useState<string | null>(null)

  useEffect(() => {
    setClock(new Date().toLocaleTimeString('en-US', { hour12: true }))
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-US', { hour12: true })), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setDelegation(null); return }
    supabase
      .from('delegations')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDelegation(data as DelegationRow)
          setKilled(data.status === 'revoked')
        }
      })
  }, [session])

  useEffect(() => {
    if (!session) { setOauthConnections([]); return }
    supabase
      .from('oauth_connections')
      .select('id, provider, account_email, scope, status, created_at, revoked_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOauthConnections((data as OAuthConnectionRow[]) ?? []))
  }, [session])

  // Apply preset configuration
  const applyPreset = (preset: AgentPreset) => {
    setSpending(preset.spending)
    setScopes(preset.scopes)
    setApprovalTrigger(preset.approvalTrigger)
    setBanner({ text: `Preset applied: ${preset.name}`, tone: 'ok' })
    setLog(prev => [...prev, { text: `// Applied preset: ${preset.name} — ${preset.description}`, tone: 'ok' }])
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    '?': () => {
      setLog(prev => [...prev, { text: '// Available shortcuts: R=Reset, E=Export, S=Submit action', tone: 'muted' }])
    },
    'r': () => {
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
        payment_processing: false,
        vendor_apis_read: true,
      }
      setAgent(defaultAgents[0].id)
      setSpending(250)
      setApprovalTrigger('100')
      setScopes(defaultScopes)
      setLog([{ text: '// System ready. Sandbox reset.', tone: 'muted' }])
      setBanner({ text: 'Sandbox reset', tone: 'ok' })
    },
    'e': () => {
      if (delegation) {
        const exportData = {
          id: delegation.id,
          provider: delegation.agent_name || 'Unknown',
          account_email: null,
          scope: 'mixed',
          status: delegation.status as 'active' | 'revoked',
          created_at: delegation.created_at,
          revoked_at: delegation.revoked_at,
        }
        exportDelegationsToCSV([exportData])
        setBanner({ text: 'Delegation exported to CSV', tone: 'ok' })
      } else {
        setBanner({ text: 'No delegation to export', tone: 'warn' })
      }
    },
  })

  function connectionFor(providerId: string) {
    return oauthConnections.find(c => c.provider === providerId && c.status === 'active') ?? null
  }

  function connectRealAccount(providerId: string) {
    if (typeof window === 'undefined') return
    window.location.href = buildOAuthAuthUrl(providerId, window.location.origin)
  }

  async function revokeRealConnection(connectionId: string, providerLabel: string) {
    if (!session) return
    setOauthBusyProvider(connectionId)
    const res = await fetch('/api/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ connectionId }),
    })
    const json = await res.json()
    setOauthBusyProvider(null)
    if (res.ok) {
      setOauthConnections(list => list.map(c => c.id === connectionId ? { ...c, status: 'revoked', revoked_at: new Date().toISOString() } : c))
      const t = timestamp()
      setLog(l => [...l, { text: `[${t}] REVOKED — ${providerLabel}'s own OAuth server invalidated the token${json.providerRevokeOk ? '' : ' (local record updated; provider call did not confirm)'}. This is a real, independently checkable revoke.`, tone: 'danger' }])
    }
  }

  async function sendMagicLink() {
    if (!authEmail) return
    setAuthStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    })
    setAuthStatus(error ? 'error' : 'sent')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setDelegation(null)
    setKilled(false)
  }

  async function saveRealDelegation() {
    if (!session) return
    setDelegationBusy(true)
    const { data, error } = await supabase
      .from('delegations')
      .insert({
        user_id: session.user.id,
        agent_name: currentAgent.label,
        scope_email: scopes.email_read || scopes.email_send,
        scope_bank: scopes.banking_read || scopes.banking_transfer,
        scope_pii: scopes.customer_data_view || scopes.customer_data_export,
        spending_cap_cents: spending * 100,
        approval_trigger_cents: approvalTrigger === 'always' ? 0 : Number(approvalTrigger) * 100,
      })
      .select()
      .single()
    setDelegationBusy(false)
    if (!error && data) {
      setDelegation(data as DelegationRow)
      setKilled(false)
      const t = timestamp()
      setLog(l => [...l, { text: `[${t}] Real delegation saved to your account for ${currentAgent.label}. This persists across refresh.`, tone: 'ok' }])
    }
  }

  async function revokeRealDelegation() {
    if (!session || !delegation) return
    setDelegationBusy(true)
    const { error } = await supabase
      .from('delegations')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', delegation.id)
      .eq('user_id', session.user.id)
    if (!error) {
      await supabase.from('delegation_events').insert({
        delegation_id: delegation.id,
        user_id: session.user.id,
        event_type: 'revoked',
        detail: 'Revoked by user from sandbox kill switch',
      })
      setDelegation({ ...delegation, status: 'revoked', revoked_at: new Date().toISOString() })
      setKilled(true)
      const t = timestamp()
      setLog(l => [...l, { text: `[${t}] REVOKED — your real delegation to ${delegation.agent_name} was updated in your account. This survives a refresh.`, tone: 'danger' }])
    }
    setDelegationBusy(false)
  }

  function timestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: true })
  }

  function runAction(action: SimAction) {
    const t = timestamp()
    if (action.kind === 'malicious') {
      setLog(l => [...l, { text: `[${t}] ${currentAgent.label} → "${action.label}"`, tone: 'muted' }, { text: `[${t}] BLOCKED — request falls outside granted scope isolation.`, tone: 'danger' }])
      setBanner({ text: `Blocked: ${action.label}`, tone: 'danger' })
      setApproval({ open: false, desc: '' })
      return
    }
    if (action.kind === 'financial') {
      const cost = 450
      if (cost > Number(approvalTrigger) || approvalTrigger === 'always') {
        setLog(l => [...l, { text: `[${t}] ${currentAgent.label} → "${action.label}"`, tone: 'muted' }, { text: `[${t}] SUSPENDED — exceeds approval threshold ($${approvalTrigger === 'always' ? '0' : approvalTrigger}). Awaiting your decision.`, tone: 'warn' }])
        setBanner({ text: 'Awaiting mandatory approval...', tone: 'warn' })
        setApproval({ open: true, desc: `Agent requested a $${cost.toFixed(2)} transfer exceeding your threshold. Action suspended pending your decision.` })
        return
      }
      setLog(l => [...l, { text: `[${t}] ${currentAgent.label} → "${action.label}"`, tone: 'muted' }, { text: `[${t}] ALLOWED — within daily limit ($${spending}/day).`, tone: 'ok' }])
      setBanner({ text: `Allowed: ${action.label}`, tone: 'ok' })
      return
    }
    setLog(l => [...l, { text: `[${t}] ${currentAgent.label} → "${action.label}"`, tone: 'muted' }, { text: `[${t}] ALLOWED — read/draft scope, no spend.`, tone: 'ok' }])
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
                  <i data-lucide="shield" className="w-3.5 h-3.5" />
                  <span>NEUTRAL AUTHORITY LAYER FOR AGENTIC AI — PROTOCOL</span>
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
                    <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Protocol</div>
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

        <section id="thesis" className="py-24 border-y border-gray-800/80 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/10 blur-[140px] rounded-full pointer-events-none" />
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs mb-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span>WHY THIS HAS TO EXIST</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-6">Not another AI assistant. The trust layer every agent will need.</h2>
            <p className="text-lg text-gray-300 leading-relaxed mb-4">
              Aegis is designed to let a person set portable, enforceable boundaries for every AI they use — what it may access and do, spending and sharing limits, when approval is mandatory, and a universal action receipt with a revoke button and a kill switch.
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
                {session ? (
                  <div className="p-3 rounded-xl border border-gray-800 bg-gray-900/60 text-xs text-gray-400 flex items-center justify-between" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>Signed in as <span className="text-emerald-400">{session.user.email}</span></span>
                    <button onClick={signOut} className="text-gray-500 hover:text-white">Sign out</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400">Sign in to make your delegation and kill switch real — persisted to your account, not just this browser tab.</p>
                    <div className="flex gap-2">
                      <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@email.com" className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:border-emerald-500 focus:outline-none" />
                      <button onClick={sendMagicLink} disabled={authStatus === 'sending'} className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 disabled:opacity-50">
                        {authStatus === 'sending' ? 'Sending…' : 'Send magic link'}
                      </button>
                    </div>
                    {authStatus === 'sent' && <p className="text-[11px] text-emerald-400">Check your email for a sign-in link.</p>}
                    {authStatus === 'error' && <p className="text-[11px] text-rose-400">Couldn&rsquo;t send the link — try again.</p>}
                    <button onClick={() => setKilled(k => !k)} className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm shadow-xl transition-all flex items-center justify-center gap-3 tracking-wider uppercase group ${killed ? 'bg-gray-800 text-gray-300' : 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-600/30 hover:shadow-rose-600/50'}`}>
                      <i data-lucide="power" className="w-5 h-5" />
                      <span>{killed ? 'Restore Sandbox (local only)' : 'Trigger Kill Switch (local demo — sign in above to make it real)'}</span>
                    </button>
                  </div>
                )}
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
                  <input type="range" min={50} max={2000} step={50} value={spending} onChange={e => setSpending(Number(e.target.value))} className="w-full accent-emerald-500 bg-gray-800 h-2 rounded-lg cursor-pointer" />
                  <div className="flex justify-between text-[10px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>$50</span><span>$1,000</span><span>$2,000</span>
                  </div>
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
                  <span className="overflow-hidden text-ellipsis">Boundaries set for {currentAgent.label}: ${spending}/day · {Object.entries(scopes).filter(([_, v]) => v).length} scope{Object.entries(scopes).filter(([_, v]) => v).length !== 1 ? 's' : ''} · approval {approvalTrigger === 'always' ? 'on every action' : `over $${approvalTrigger}`}</span>
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
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Visible Receipts &amp; a Kill Switch That Persists</h2>
                <p className="text-gray-300 text-base leading-relaxed">Sign in below and every delegation you grant is a real, database-backed record tied to your account. Revoking it updates that record for good — it survives a refresh, and it stays revoked. Without signing in, the sandbox still runs, but only as a local browser demo.</p>
                <div className="space-y-3 pt-2">
                  <div className="p-4 rounded-xl border border-gray-800 flex items-start gap-3" style={{ background: 'rgba(13,17,23,.75)' }}>
                    <i data-lucide="shield-alert" className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div><h4 className="text-sm font-bold text-white">Real revoke, honestly scoped</h4><p className="text-xs text-gray-400">Signed in, revoke really does mark your delegation record void in Aegis&rsquo;s database, protected by row-level security so only you can read or change it. It does not call OpenAI, Google, or any other provider&rsquo;s API — no such live integration exists yet.</p></div>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-800 flex items-start gap-3" style={{ background: 'rgba(13,17,23,.75)' }}>
                    <i data-lucide="file-text" className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div><h4 className="text-sm font-bold text-white">Plain, readable receipts</h4><p className="text-xs text-gray-400">Each entry records the agent, the action, the decision, and the time — no cryptographic signing is implemented in this build.</p></div>
                  </div>
                </div>
                <div className="pt-4 space-y-3">
                  {session && delegation && delegation.status === 'active' && (
                    <button onClick={revokeRealDelegation} disabled={delegationBusy} className="w-full py-4 px-6 rounded-2xl font-extrabold text-sm shadow-xl transition-all flex items-center justify-center gap-3 tracking-wider uppercase bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-600/30 hover:shadow-rose-600/50 disabled:opacity-50">
                      <i data-lucide="power" className="w-5 h-5" />
                      <span>{delegationBusy ? 'Revoking…' : `Revoke Real Delegation (${delegation.agent_name})`}</span>
                    </button>
                  )}
                  {session && (!delegation || delegation.status === 'revoked') && (
                    <button onClick={saveRealDelegation} disabled={delegationBusy} className="w-full py-4 px-6 rounded-2xl font-extrabold text-sm shadow-xl transition-all flex items-center justify-center gap-3 tracking-wider uppercase bg-gray-900 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                      <i data-lucide="shield-check" className="w-5 h-5" />
                      <span>{delegationBusy ? 'Saving…' : `Grant Real Delegation to ${currentAgent.label}`}</span>
                    </button>
                  )}

                  {session && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>REAL CONNECTIONS — each of these calls a real provider&rsquo;s OAuth server, not just Aegis&rsquo;s own database. More providers plug into this same list over time.</p>
                      {Object.values(OAUTH_PROVIDERS).map(provider => {
                        const revokedConnection = oauthConnections.find(c => c.provider === provider.id && c.status === 'revoked')
                        const active = connectionFor(provider.id)
                        const busy = oauthBusyProvider === active?.id
                        return (
                          <div key={provider.id} className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-3">
                            <div className="flex items-center gap-2 text-xs text-cyan-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              <i data-lucide={provider.icon} className="w-4 h-4" />
                              <span>{provider.label}</span>
                            </div>
                            {active ? (
                              <>
                                <p className="text-xs text-gray-400">Connected as <span className="text-white">{active.account_email ?? 'your account'}</span>. Revoking below calls the real OAuth revoke endpoint — independently verifiable, not just a database flag.</p>
                                <button onClick={() => revokeRealConnection(active.id, provider.label)} disabled={busy} className="w-full py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-rose-600 to-red-700 text-white disabled:opacity-50">
                                  {busy ? 'Revoking…' : `Revoke Real ${provider.label} Access`}
                                </button>
                              </>
                            ) : revokedConnection ? (
                              <>
                                <p className="text-xs text-emerald-400">Revoked — this connection has been cut off for good. Connect again to test another round.</p>
                                <button onClick={() => connectRealAccount(provider.id)} className="w-full py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider bg-gray-900 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
                                  Connect {provider.label} (real)
                                </button>
                              </>
                            ) : (
                              <>
                                <p className="text-xs text-gray-400">Not connected yet. Aegis requests real, scoped access via {provider.label.split(' (')[0]}&rsquo;s actual OAuth flow, and the revoke button actually calls it to invalidate the token.</p>
                                <button onClick={() => connectRealAccount(provider.id)} className="w-full py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider bg-gray-900 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
                                  Connect {provider.label} (real)
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
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
                      <h3 className="text-2xl font-extrabold text-white tracking-wider">{session && delegation ? 'DELEGATION REVOKED' : 'SANDBOX LOCKED DOWN'}</h3>
                      <p className="text-xs text-rose-200 max-w-md" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {session && delegation
                          ? 'This is permanent for this delegation record — it stays revoked even after a refresh. Grant a fresh delegation below to continue testing.'
                          : "This demo agent's authority has been marked void in the interface."}
                      </p>
                      {session && delegation ? (
                        <button onClick={saveRealDelegation} disabled={delegationBusy} className="px-6 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-gray-200 transition-all disabled:opacity-50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{delegationBusy ? 'Saving…' : 'Grant New Delegation'}</button>
                      ) : (
                        <button onClick={() => setKilled(false)} className="px-6 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-gray-200 transition-all" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Restore Sandbox</button>
                      )}
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
