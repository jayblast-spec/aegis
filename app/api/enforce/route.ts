import { NextRequest, NextResponse } from 'next/server'
import { getPolicy, getSpendToday, recordSpend, appendAudit } from '@/lib/policyStore'
import { decide, type Policy } from '@/lib/enforce'

interface EnforcementRequest {
  agentId: string
  action: string
  cost?: unknown
  scopes?: string[]
  userId: string
}

export async function POST(request: NextRequest) {
  try {
    const req: EnforcementRequest = await request.json()

    if (!req.agentId || !req.action || !req.userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // No policy → fail closed.
    const policy = getPolicy(req.userId, req.agentId) as Policy | undefined
    if (!policy) {
      return NextResponse.json({ error: 'No policy found for agent' }, { status: 403 })
    }

    const spentToday = getSpendToday(req.userId, req.agentId)
    const d = decide(policy, { action: req.action, cost: req.cost, scopes: req.scopes }, spentToday)

    // Only an ALLOWED action actually spends; record it so the daily cap accumulates.
    if (d.kind === 'ALLOWED' && d.cost > 0) {
      recordSpend(req.userId, req.agentId, d.cost)
    }

    appendAudit({
      timestamp: new Date().toISOString(),
      userId: req.userId,
      agentId: req.agentId,
      action: req.action,
      cost: d.cost,
      decision: d.kind,
      reason: d.reason,
    })

    return NextResponse.json(
      {
        allowed: d.kind === 'ALLOWED',
        ...(d.kind === 'REQUIRES_APPROVAL' ? { requiresApproval: true } : {}),
        reason: d.reason,
        decision: {
          timestamp: new Date().toISOString(),
          agentId: req.agentId,
          action: req.action,
          decision: d.kind,
        },
      },
      { status: d.status }
    )
  } catch (error) {
    console.error('Enforcement error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
