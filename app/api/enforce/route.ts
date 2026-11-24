import { NextRequest, NextResponse } from 'next/server'
import { getPolicy, getSpendToday, recordSpend, appendAudit } from '@/lib/policyStore'
import { decide, requestHash, type Policy } from '@/lib/enforce'
import { consumeApproval } from '@/lib/approvalStore'

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

    // When an action needs approval, see if a human has approved THIS exact request (same user,
    // agent, action, validated cost and scopes). A matching approval is single-use and consumed
    // here; altered parameters hash differently and find nothing; a replay finds it already used.
    let kind = d.kind
    let reason = d.reason
    let status = d.status
    let requestHashValue: string | undefined
    if (d.kind === 'REQUIRES_APPROVAL') {
      requestHashValue = requestHash({
        userId: req.userId,
        agentId: req.agentId,
        action: req.action,
        cost: d.cost,
        scopes: req.scopes,
      })
      if (consumeApproval(requestHashValue)) {
        kind = 'ALLOWED'
        status = 200
        reason = 'Approved by human for this exact request (single-use)'
      }
    }

    // Only an ALLOWED action actually spends; record it so the daily cap accumulates.
    if (kind === 'ALLOWED' && d.cost > 0) {
      recordSpend(req.userId, req.agentId, d.cost)
    }

    appendAudit({
      timestamp: new Date().toISOString(),
      userId: req.userId,
      agentId: req.agentId,
      action: req.action,
      cost: d.cost,
      decision: kind,
      reason,
    })

    return NextResponse.json(
      {
        allowed: kind === 'ALLOWED',
        ...(kind === 'REQUIRES_APPROVAL' ? { requiresApproval: true, requestHash: requestHashValue } : {}),
        reason,
        decision: {
          timestamp: new Date().toISOString(),
          agentId: req.agentId,
          action: req.action,
          decision: kind,
        },
      },
      { status }
    )
  } catch (error) {
    console.error('Enforcement error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
