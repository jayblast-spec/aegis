// Typed client for the Aegis enforcement API. Works in the browser and in Node 18+.

export type Decision = 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL'

export interface Policy {
  perActionCap: number
  windowCap?: number
  windowSeconds?: number
  approvalThreshold?: number | null
  alwaysRequireApproval?: boolean
  allowedScopes: string[]
}

export interface PolicyView extends Required<Omit<Policy, 'approvalThreshold'>> {
  approvalThreshold: number | null
  updatedAt: string
}

export interface AgentView {
  id: string
  name: string
  keyPrefix: string
  status: 'active' | 'revoked'
  createdAt: string
  revokedAt: string | null
  policy: PolicyView | null
}

export interface EnforceRequest {
  action: string
  cost?: number
  scopes?: string[]
  params?: Record<string, unknown>
  approvalToken?: string
}

export interface EnforceResponse {
  allowed: boolean
  reason: string
  requiresApproval?: boolean
  pendingActionId?: string
  expiresAt?: string
  released?: boolean
  logId: string
  decision: { timestamp: string; agentId: string; action: string; decision: Decision }
}

export interface PendingAction {
  id: string
  agentId: string
  agentName?: string
  action: string
  amount: number
  scopes: string[]
  params: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed' | 'cancelled'
  reason: string | null
  createdAt: string
  expiresAt: string
  decidedAt: string | null
  releaseExpiresAt: string | null
  approvalToken?: string
  tokenIssued?: boolean
}

export interface DecisionLogEntry {
  id: string
  agentId: string | null
  agentName: string | null
  pendingActionId: string | null
  eventType: string
  decision: Decision | null
  reason: string
  actorType: 'owner' | 'agent' | 'system'
  actorId: string
  action: string | null
  amount: number | null
  payloadHash: string | null
  createdAt: string
}

export class AegisError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(baseUrl: string, method: string, path: string, key: string | null, body?: unknown, okStatuses: number[] = []): Promise<{ status: number; data: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string }
  if (!res.ok && !okStatuses.includes(res.status)) throw new AegisError(res.status, data.code ?? 'error', data.error ?? `HTTP ${res.status}`)
  return { status: res.status, data }
}

/** The person delegating authority. Holds the owner key. */
export class AegisOwner {
  constructor(
    readonly ownerKey: string,
    readonly baseUrl = '',
  ) {}

  static async create(label = 'Aegis owner', baseUrl = ''): Promise<{ owner: AegisOwner; ownerId: string; ownerKey: string }> {
    const { data } = await request<{ ownerId: string; ownerKey: string }>(baseUrl, 'POST', '/api/owners', null, { label })
    return { owner: new AegisOwner(data.ownerKey, baseUrl), ownerId: data.ownerId, ownerKey: data.ownerKey }
  }

  async createAgent(name: string): Promise<{ agent: AgentView; agentKey: string }> {
    return (await request<{ agent: AgentView; agentKey: string }>(this.baseUrl, 'POST', '/api/agents', this.ownerKey, { name })).data
  }

  async listAgents(): Promise<AgentView[]> {
    return (await request<{ agents: AgentView[] }>(this.baseUrl, 'GET', '/api/agents', this.ownerKey)).data.agents
  }

  async setPolicy(agentId: string, policy: Policy): Promise<PolicyView> {
    return (await request<{ policy: PolicyView }>(this.baseUrl, 'PUT', '/api/policies', this.ownerKey, { agentId, policy })).data.policy
  }

  async approvals(status: PendingAction['status'] | 'all' = 'pending'): Promise<PendingAction[]> {
    return (await request<{ actions: PendingAction[] }>(this.baseUrl, 'GET', `/api/approvals?status=${status}`, this.ownerKey)).data.actions
  }

  async decide(actionId: string, approve: boolean): Promise<PendingAction> {
    return (await request<{ action: PendingAction }>(this.baseUrl, 'POST', '/api/approvals', this.ownerKey, { actionId, approve })).data.action
  }

  async revoke(agentId: string): Promise<{ agentId: string; revoked: boolean; alreadyRevoked: boolean }> {
    return (await request<{ agentId: string; revoked: boolean; alreadyRevoked: boolean }>(this.baseUrl, 'POST', `/api/agents/${agentId}/revoke`, this.ownerKey)).data
  }

  async revokeAll(): Promise<string[]> {
    return (await request<{ revoked: string[] }>(this.baseUrl, 'POST', '/api/agents/revoke-all', this.ownerKey)).data.revoked
  }

  async decisions(opts: { limit?: number; agentId?: string } = {}): Promise<DecisionLogEntry[]> {
    const q = new URLSearchParams()
    if (opts.limit) q.set('limit', String(opts.limit))
    if (opts.agentId) q.set('agentId', opts.agentId)
    return (await request<{ decisions: DecisionLogEntry[] }>(this.baseUrl, 'GET', `/api/decisions?${q}`, this.ownerKey)).data.decisions
  }
}

/** An AI agent. Holds only its own agent key; calls enforce before acting. */
export class AegisAgent {
  constructor(
    readonly agentKey: string,
    readonly baseUrl = '',
  ) {}

  /** Returns the decision for 200, 202 and 403 responses; throws for auth/validation errors. */
  async enforce(req: EnforceRequest): Promise<EnforceResponse> {
    return (await request<EnforceResponse>(this.baseUrl, 'POST', '/api/enforce', this.agentKey, req, [202, 403])).data
  }

  async poll(actionId: string): Promise<PendingAction> {
    return (await request<PendingAction>(this.baseUrl, 'GET', `/api/actions/${actionId}`, this.agentKey)).data
  }

  /**
   * Waits for the owner's decision on a held action, then releases it with the
   * single-use approval token. The request must be identical to the held one.
   */
  async waitAndRelease(req: Omit<EnforceRequest, 'approvalToken'>, actionId: string, opts: { intervalMs?: number; timeoutMs?: number } = {}): Promise<EnforceResponse | PendingAction> {
    const deadline = Date.now() + (opts.timeoutMs ?? 120_000)
    while (Date.now() < deadline) {
      const state = await this.poll(actionId)
      if (state.status === 'approved' && state.approvalToken) return this.enforce({ ...req, approvalToken: state.approvalToken })
      if (state.status !== 'pending') return state
      await new Promise(r => setTimeout(r, opts.intervalMs ?? 2_000))
    }
    throw new AegisError(408, 'timeout', 'Timed out waiting for owner decision')
  }
}
