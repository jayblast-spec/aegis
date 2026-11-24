// Pure enforcement decision logic — no I/O, so it can be unit-tested and red-teamed directly.
// The route layer supplies the policy and the agent's spend-so-far; this function decides.
import { createHash } from 'crypto'

export interface Policy {
  spendingCap: number        // maximum cumulative cost per day
  approvalThreshold: number  // per-action cost above which a human must approve
  allowedScopes: string[]
}

export interface EnforceInput {
  action: string
  cost?: unknown             // untrusted: may be missing, a string, negative, NaN…
  scopes?: string[]
}

export type DecisionKind = 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL'

export interface Decision {
  kind: DecisionKind
  status: number             // HTTP status the route should return
  reason: string
  cost: number               // the validated, numeric cost actually applied
}

// A cost is valid only if it is a finite, non-negative number. Missing cost = 0 (a no-cost
// action such as a read). A present-but-malformed cost (string, NaN, negative) is treated as
// an attack and fails closed — this is what stops the `cost:-500` and `cost:"lots"` bypasses.
function validateCost(raw: unknown): { ok: true; value: number } | { ok: false; reason: string } {
  if (raw === undefined || raw === null) return { ok: true, value: 0 }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { ok: false, reason: `Invalid cost: expected a finite number, got ${JSON.stringify(raw)}` }
  }
  if (raw < 0) return { ok: false, reason: `Invalid cost: negative value ${raw} is not permitted` }
  return { ok: true, value: raw }
}

/**
 * Decide an action against a policy.
 * @param spentToday cumulative cost already ALLOWED for this agent today (0 if none).
 */
export function decide(policy: Policy, input: EnforceInput, spentToday: number): Decision {
  const v = validateCost(input.cost)
  if (!v.ok) return { kind: 'BLOCKED', status: 403, reason: v.reason, cost: 0 }
  const cost = v.value

  // Scope isolation.
  if (input.scopes && input.scopes.length) {
    const bad = input.scopes.filter(s => !policy.allowedScopes.includes(s))
    if (bad.length) {
      return { kind: 'BLOCKED', status: 403, reason: `Requested scopes not permitted: ${bad.join(', ')}`, cost }
    }
  }

  // Cumulative daily spending cap — closes the split-action / salami bypass.
  if (spentToday + cost > policy.spendingCap) {
    return {
      kind: 'BLOCKED',
      status: 403,
      reason: `Cost $${cost} would bring today's spend to $${spentToday + cost}, over the $${policy.spendingCap} daily cap (already spent $${spentToday})`,
      cost,
    }
  }

  // Per-action approval threshold.
  if (cost > policy.approvalThreshold) {
    return {
      kind: 'REQUIRES_APPROVAL',
      status: 202,
      reason: `Cost $${cost} exceeds approval threshold $${policy.approvalThreshold}. Human approval required.`,
      cost,
    }
  }

  return { kind: 'ALLOWED', status: 200, reason: 'Within policy limits', cost }
}

// Deterministic hash binding an approval to the EXACT request: same user, agent, action,
// validated cost and (order-independent) scopes. Any change to any of these yields a different
// hash, so an approval for one request cannot be reused for a different one. Pure and testable.
export interface HashableRequest {
  userId: string
  agentId: string
  action: string
  cost: number
  scopes?: string[]
}
export function requestHash(r: HashableRequest): string {
  const canonical = JSON.stringify({
    u: r.userId,
    a: r.agentId,
    act: r.action,
    c: r.cost,
    s: [...(r.scopes || [])].map(String).sort(),
  })
  return createHash('sha256').update(canonical).digest('hex')
}
