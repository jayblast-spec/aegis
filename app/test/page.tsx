'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AegisAgent, AegisOwner } from '@/lib/aegisSDK'

type Step = { name: string; expected: string; got: string; pass: boolean }

const mono = { fontFamily: "'JetBrains Mono', monospace" }

/**
 * Live self-test: runs the full enforcement lifecycle against this
 * deployment's API with a fresh throwaway owner and reports pass/fail.
 */
export default function EnforcementSelfTest() {
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    const out: Step[] = []
    const record = (name: string, expected: string, got: string) => {
      out.push({ name, expected, got, pass: expected === got })
      setSteps([...out])
    }
    try {
      const { owner } = await AegisOwner.create('Self-test')
      const { agent: a, agentKey } = await owner.createAgent('Self-test agent')
      const agent = new AegisAgent(agentKey)
      await owner.setPolicy(a.id, { perActionCap: 500, windowCap: 600, windowSeconds: 3600, approvalThreshold: 100, allowedScopes: ['read', 'payments'] })

      record('$25 read within limits', 'ALLOWED', (await agent.enforce({ action: 'read_report', cost: 25, scopes: ['read'] })).decision.decision)
      record('Out-of-scope export', 'BLOCKED', (await agent.enforce({ action: 'export_pii', cost: 0, scopes: ['export'] })).decision.decision)
      record('$900 over per-action cap', 'BLOCKED', (await agent.enforce({ action: 'wire', cost: 900, scopes: ['payments'] })).decision.decision)

      const payment = { action: 'pay_invoice', cost: 450, scopes: ['payments'], params: { invoice: 'INV-1' } }
      const held = await agent.enforce(payment)
      record('$450 over approval threshold', 'REQUIRES_APPROVAL', held.decision.decision)
      await owner.decide(held.pendingActionId!, true)
      const state = await agent.poll(held.pendingActionId!)
      record('Altered payload with approval token', 'BLOCKED', (await agent.enforce({ ...payment, cost: 499, approvalToken: state.approvalToken })).decision.decision)
      record('Exact payload with approval token', 'ALLOWED', (await agent.enforce({ ...payment, approvalToken: state.approvalToken })).decision.decision)
      record('Replay of the same token', 'BLOCKED', (await agent.enforce({ ...payment, approvalToken: state.approvalToken })).decision.decision)
      record('$90 more: $25 + $450 + $90 > $600 window', 'BLOCKED', (await agent.enforce({ action: 'small_payment', cost: 90, scopes: ['payments'] })).decision.decision)

      await owner.revoke(a.id)
      record('Any action after revoke', 'BLOCKED', (await agent.enforce({ action: 'read_report', cost: 0, scopes: ['read'] })).decision.decision)

      const log = await owner.decisions({ limit: 50 })
      record('Decision log rows written', 'yes', log.length >= 10 ? 'yes' : `only ${log.length}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Self-test failed')
    } finally {
      setRunning(false)
    }
  }

  const passed = steps.filter(s => s.pass).length
  return (
    <div className="min-h-screen bg-[#07090E] text-gray-100 p-6 sm:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/" className="text-xs text-emerald-400 hover:underline" style={mono}>← Aegis</Link>
        <h1 className="text-3xl font-bold text-white">Enforcement self-test</h1>
        <p className="text-gray-300 text-sm">
          Creates a throwaway owner and agent on this deployment, then walks the full lifecycle: allowed, blocked, held for approval, approve and release,
          substitution and replay refused, rolling-window cap, and revoke. Every step is a real API call.
        </p>
        <button onClick={run} disabled={running} className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-semibold disabled:opacity-50">
          {running ? 'Running…' : 'Run self-test'}
        </button>
        {error && <p className="text-rose-400 text-sm" role="alert">{error}</p>}
        {steps.length > 0 && (
          <div className="rounded-2xl border border-gray-800 overflow-hidden" style={mono}>
            <div className="px-4 py-3 border-b border-gray-800 text-xs text-gray-400">{passed}/{steps.length} passed</div>
            <ul className="divide-y divide-gray-800 text-xs">
              {steps.map(s => (
                <li key={s.name} className="px-4 py-3 flex flex-wrap justify-between gap-2">
                  <span className="text-gray-200">{s.name}</span>
                  <span className={s.pass ? 'text-emerald-400' : 'text-rose-400'}>
                    {s.pass ? 'PASS' : 'FAIL'} · expected {s.expected}, got {s.got}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
