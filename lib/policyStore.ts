// Shared policy store (would use Supabase in production)
export const policyStore: Record<string, Record<string, any>> = {}

export function getPolicy(userId: string, agentId: string) {
  return policyStore[userId]?.[agentId]
}

export function setPolicy(userId: string, agentId: string, policy: any) {
  if (!policyStore[userId]) {
    policyStore[userId] = {}
  }
  policyStore[userId][agentId] = {
    ...policy,
    updatedAt: new Date().toISOString(),
  }
  return policyStore[userId][agentId]
}

export function getAllPolicies(userId: string) {
  return policyStore[userId] || {}
}

// ── Cumulative daily spend ──────────────────────────────────────────────
// Tracks cost already ALLOWED per agent per UTC day, so the spending cap is a real
// daily budget rather than a per-action check an agent can defeat by splitting.
// NOTE: in-process like policyStore; wire to the same durable backend (Supabase) in
// production so it survives restarts and is shared across serverless instances.
const spendLedger: Record<string, number> = {}
const dayKey = (userId: string, agentId: string) =>
  `${userId}:${agentId}:${new Date().toISOString().slice(0, 10)}`

export function getSpendToday(userId: string, agentId: string): number {
  return spendLedger[dayKey(userId, agentId)] || 0
}

export function recordSpend(userId: string, agentId: string, amount: number) {
  if (amount <= 0) return
  const k = dayKey(userId, agentId)
  spendLedger[k] = (spendLedger[k] || 0) + amount
}

// ── Append-only decision log ────────────────────────────────────────────
// Real, retrievable audit trail (replaces the previous console.log stub). Append-only:
// entries are never mutated or removed. NOTE: in-process; mirror to a durable append-only
// store (Supabase table with no UPDATE/DELETE grants) for tamper-evidence in production.
export interface AuditEntry {
  timestamp: string
  userId: string
  agentId: string
  action: string
  cost: number
  decision: 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL'
  reason: string
}
const auditLog: AuditEntry[] = []

export function appendAudit(entry: AuditEntry) {
  auditLog.push(Object.freeze({ ...entry }))
}

export function getAudit(userId: string, agentId?: string): AuditEntry[] {
  return auditLog.filter(e => e.userId === userId && (!agentId || e.agentId === agentId))
}
