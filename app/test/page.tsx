'use client'

import { useState } from 'react'
import { createAegisAgent, Policy } from '@/lib/aegisSDK'

export default function EnforcementTest() {
  const [userId] = useState('test-user-001')
  const [agentId] = useState('claude-agent-001')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const agent = createAegisAgent(userId, agentId)

  const runTest = async () => {
    setLoading(true)
    const testResults = []

    try {
      // Step 1: Set a policy
      console.log('Setting policy...')
      const policyResponse = await agent.setPolicy({
        spendingCap: 100,
        approvalThreshold: 50,
        allowedScopes: ['read', 'write', 'query'],
      })
      testResults.push({
        step: 'Set Policy',
        status: 'success',
        result: policyResponse,
      })

      // Step 2: Enforce allowed action
      console.log('Testing allowed action...')
      const allowedResponse = await agent.enforce({
        action: 'run_query',
        cost: 25,
        scopes: ['read', 'query'],
      })
      testResults.push({
        step: 'Allowed Action ($25)',
        status: allowedResponse.allowed ? 'success' : 'blocked',
        result: allowedResponse,
      })

      // Step 3: Enforce action requiring approval
      console.log('Testing action requiring approval...')
      const approvalResponse = await agent.enforce({
        action: 'write_data',
        cost: 75,
        scopes: ['write'],
      })
      testResults.push({
        step: 'Approval Required ($75)',
        status: approvalResponse.requiresApproval ? 'approval' : 'other',
        result: approvalResponse,
      })

      // Step 4: Enforce blocked action (exceeds cap)
      console.log('Testing blocked action...')
      const blockedResponse = await agent.enforce({
        action: 'expensive_operation',
        cost: 150,
        scopes: ['read'],
      })
      testResults.push({
        step: 'Blocked Action ($150, exceeds $100 cap)',
        status: !blockedResponse.allowed ? 'blocked' : 'error',
        result: blockedResponse,
      })

      // Step 5: Enforce action with unauthorized scope
      console.log('Testing unauthorized scope...')
      const scopeResponse = await agent.enforce({
        action: 'delete_data',
        cost: 10,
        scopes: ['delete'],
      })
      testResults.push({
        step: 'Unauthorized Scope',
        status: !scopeResponse.allowed ? 'blocked' : 'error',
        result: scopeResponse,
      })

    } catch (error) {
      testResults.push({
        step: 'Error',
        status: 'error',
        result: String(error),
      })
    }

    setResults(testResults)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Aegis Enforcement Backend Test</h1>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
          <div className="mb-6">
            <p className="text-slate-300 mb-2"><strong>User ID:</strong> {userId}</p>
            <p className="text-slate-300 mb-4"><strong>Agent ID:</strong> {agentId}</p>
            <button
              onClick={runTest}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              {loading ? 'Running Tests...' : 'Run Full Test Suite'}
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Test Results</h2>
            {results.map((result, idx) => (
              <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">{result.step}</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    result.status === 'success' ? 'bg-green-900 text-green-200' :
                    result.status === 'blocked' ? 'bg-red-900 text-red-200' :
                    result.status === 'approval' ? 'bg-yellow-900 text-yellow-200' :
                    'bg-slate-700 text-slate-200'
                  }`}>
                    {result.status.toUpperCase()}
                  </span>
                </div>
                <pre className="bg-slate-900 text-slate-300 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(result.result, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
