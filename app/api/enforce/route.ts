import { NextRequest, NextResponse } from 'next/server'
import { getPolicy } from '@/lib/policyStore'

interface EnforcementRequest {
  agentId: string
  action: string
  cost?: number
  scopes?: string[]
  userId: string
}

interface EnforcementResponse {
  allowed: boolean
  reason: string
  requiresApproval?: boolean
  decision: {
    timestamp: string
    agentId: string
    action: string
    decision: 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL'
  }
}

export async function POST(request: NextRequest) {
  try {
    const req: EnforcementRequest = await request.json()

    // Validate request
    if (!req.agentId || !req.action || !req.userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get agent's policy
    const policy = getPolicy(req.userId, req.agentId)
    if (!policy) {
      return NextResponse.json(
        { error: 'No policy found for agent' },
        { status: 403 }
      )
    }

    // Enforce spending cap
    if (req.cost && req.cost > policy.spendingCap) {
      const decision: EnforcementResponse = {
        allowed: false,
        reason: `Cost $${req.cost} exceeds spending cap $${policy.spendingCap}`,
        decision: {
          timestamp: new Date().toISOString(),
          agentId: req.agentId,
          action: req.action,
          decision: 'BLOCKED',
        },
      }

      // Log to audit trail
      await logDecision(decision)
      return NextResponse.json(decision, { status: 403 })
    }

    // Check scope isolation
    if (req.scopes) {
      const unallowedScopes = req.scopes.filter(s => !policy.allowedScopes.includes(s))
      if (unallowedScopes.length > 0) {
        const decision: EnforcementResponse = {
          allowed: false,
          reason: `Requested scopes not permitted: ${unallowedScopes.join(', ')}`,
          decision: {
            timestamp: new Date().toISOString(),
            agentId: req.agentId,
            action: req.action,
            decision: 'BLOCKED',
          },
        }

        await logDecision(decision)
        return NextResponse.json(decision, { status: 403 })
      }
    }

    // Check if approval required
    const requiresApproval = req.cost && req.cost > policy.approvalThreshold

    if (requiresApproval) {
      const decision: EnforcementResponse = {
        allowed: false,
        requiresApproval: true,
        reason: `Cost $${req.cost} exceeds approval threshold $${policy.approvalThreshold}. Human approval required.`,
        decision: {
          timestamp: new Date().toISOString(),
          agentId: req.agentId,
          action: req.action,
          decision: 'REQUIRES_APPROVAL',
        },
      }

      await logDecision(decision)
      return NextResponse.json(decision, { status: 202 })
    }

    // Action allowed
    const decision: EnforcementResponse = {
      allowed: true,
      reason: 'Within policy limits',
      decision: {
        timestamp: new Date().toISOString(),
        agentId: req.agentId,
        action: req.action,
        decision: 'ALLOWED',
      },
    }

    await logDecision(decision)
    return NextResponse.json(decision, { status: 200 })

  } catch (error) {
    console.error('Enforcement error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function logDecision(decision: EnforcementResponse) {
  // Log to audit trail (would persist to database)
  console.log('[AUDIT]', JSON.stringify(decision, null, 2))
}
