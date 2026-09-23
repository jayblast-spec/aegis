export interface Policy {
  spendingCap: number
  approvalThreshold: number
  allowedScopes: string[]
}

export interface EnforceRequest {
  agentId: string
  action: string
  cost?: number
  scopes?: string[]
}

export interface EnforceResponse {
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

export class AegisAgent {
  private userId: string
  private agentId: string
  private baseUrl: string

  constructor(userId: string, agentId: string, baseUrl = '') {
    this.userId = userId
    this.agentId = agentId
    this.baseUrl = baseUrl
  }

  async enforce(request: Omit<EnforceRequest, 'agentId'>): Promise<EnforceResponse> {
    const url = `${this.baseUrl}/api/enforce`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: this.userId,
        agentId: this.agentId,
        ...request,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Enforcement check failed')
    }

    return response.json()
  }

  async setPolicy(policy: Policy) {
    const url = `${this.baseUrl}/api/policies`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: this.userId,
        agentId: this.agentId,
        policy,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Policy setup failed')
    }

    return response.json()
  }

  async getPolicy(): Promise<Policy> {
    const url = new URL(`${this.baseUrl}/api/policies`)
    url.searchParams.set('userId', this.userId)
    url.searchParams.set('agentId', this.agentId)

    const response = await fetch(url.toString())

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch policy')
    }

    const data = await response.json()
    return data.policy
  }
}

export function createAegisAgent(userId: string, agentId: string, baseUrl?: string) {
  return new AegisAgent(userId, agentId, baseUrl)
}
