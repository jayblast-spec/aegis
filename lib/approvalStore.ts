// Single-use, request-bound approvals.
// A human approves one exact request (identified by its requestHash). The approval can be
// consumed exactly once by an enforce call whose request hashes to the same value. This is what
// stops altered-parameter attacks (different params -> different hash -> no approval) and replay
// (an approval is marked used on first consumption).
// NOTE: in-process like policyStore; mirror to a durable backend (Supabase) in production so
// approvals survive restarts and are consistent across serverless instances.

export interface Approval {
  approved: boolean
  used: boolean
  createdAt: string
  usedAt?: string
  meta?: Record<string, unknown>
}

const approvals: Record<string, Approval> = {}

// Record a human's decision on an exact request hash. Approving the same hash again before it is
// used refreshes it; approving after use creates a new unused approval (a fresh grant).
export function recordApproval(hash: string, approved: boolean, meta?: Record<string, unknown>) {
  approvals[hash] = { approved, used: false, createdAt: new Date().toISOString(), meta }
  return approvals[hash]
}

// Consume an approval for this exact hash. Returns true only if an approved, unused approval
// exists — and marks it used so it can never be replayed.
export function consumeApproval(hash: string): boolean {
  const a = approvals[hash]
  if (a && a.approved && !a.used) {
    a.used = true
    a.usedAt = new Date().toISOString()
    return true
  }
  return false
}

export function peekApproval(hash: string): Approval | undefined {
  return approvals[hash]
}
