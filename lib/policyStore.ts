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
