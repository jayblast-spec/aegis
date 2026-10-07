// Pure policy logic: input validation and the decision function.
// No I/O here, so every rule is unit-testable in isolation.

export type Decision = 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL'

export interface PolicyRecord {
  perActionCapCents: number
  windowCapCents: number
  windowSeconds: number
  approvalThresholdCents: number | null
  alwaysRequireApproval: boolean
  allowedScopes: string[]
}

export interface ActionRequest {
  action: string
  amountCents: number
  scopes: string[]
  params: Record<string, unknown> | null
}

export class ValidationError extends Error {}

const MAX_DOLLARS = 1_000_000_000
const SCOPE_RE = /^[A-Za-z0-9_.:-]{1,64}$/

export function dollarsToCents(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_DOLLARS) {
    throw new ValidationError(`${field} must be a number between 0 and ${MAX_DOLLARS}`)
  }
  return Math.round(value * 100)
}

export function parseScopes(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 64) throw new ValidationError(`${field} must be an array of at most 64 scopes`)
  const out = new Set<string>()
  for (const s of value) {
    if (typeof s !== 'string' || !SCOPE_RE.test(s)) throw new ValidationError(`${field} contains an invalid scope`)
    out.add(s)
  }
  return [...out].sort()
}

export interface PolicyInput {
  perActionCap?: number
  spendingCap?: number // alias of perActionCap kept for the original API shape
  windowCap?: number
  windowSeconds?: number
  approvalThreshold?: number | null
  alwaysRequireApproval?: boolean
  allowedScopes?: string[]
}

export function parsePolicy(input: unknown): PolicyRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('policy must be an object')
  const p = input as PolicyInput
  const perActionRaw = p.perActionCap ?? p.spendingCap
  if (perActionRaw === undefined) throw new ValidationError('policy.perActionCap is required')
  const perActionCapCents = dollarsToCents(perActionRaw, 'policy.perActionCap')
  const windowCapCents = p.windowCap === undefined ? perActionCapCents : dollarsToCents(p.windowCap, 'policy.windowCap')
  const windowSeconds = p.windowSeconds === undefined ? 86_400 : p.windowSeconds
  if (!Number.isInteger(windowSeconds) || windowSeconds < 60 || windowSeconds > 2_592_000) {
    throw new ValidationError('policy.windowSeconds must be an integer between 60 and 2592000')
  }
  const approvalThresholdCents =
    p.approvalThreshold === undefined || p.approvalThreshold === null ? null : dollarsToCents(p.approvalThreshold, 'policy.approvalThreshold')
  if (p.alwaysRequireApproval !== undefined && typeof p.alwaysRequireApproval !== 'boolean') {
    throw new ValidationError('policy.alwaysRequireApproval must be a boolean')
  }
  return {
    perActionCapCents,
    windowCapCents,
    windowSeconds,
    approvalThresholdCents,
    alwaysRequireApproval: p.alwaysRequireApproval ?? false,
    allowedScopes: parseScopes(p.allowedScopes ?? [], 'policy.allowedScopes'),
  }
}

export function parseActionRequest(body: Record<string, unknown>): ActionRequest {
  const action = body.action
  if (typeof action !== 'string' || action.trim().length === 0 || action.length > 200) {
    throw new ValidationError('action must be a non-empty string of at most 200 characters')
  }
  const amountCents = body.cost === undefined || body.cost === null ? 0 : dollarsToCents(body.cost, 'cost')
  const scopes = parseScopes(body.scopes, 'scopes')
  let params: Record<string, unknown> | null = null
  if (body.params !== undefined && body.params !== null) {
    if (typeof body.params !== 'object' || Array.isArray(body.params)) throw new ValidationError('params must be a JSON object')
    if (JSON.stringify(body.params).length > 8_192) throw new ValidationError('params must be at most 8 KB')
    params = body.params as Record<string, unknown>
  }
  return { action, amountCents, scopes, params }
}

export interface Evaluation {
  decision: Decision
  reason: string
  rule: 'per_action_cap' | 'scope' | 'window_cap' | 'approval' | 'within_policy'
}

export const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

/**
 * Hard limits first (per-action cap, scope isolation, rolling-window cap),
 * then the approval rule. `skipApproval` is used when releasing an action
 * the owner already approved: hard limits are still re-checked.
 */
export function evaluate(policy: PolicyRecord, req: ActionRequest, spentInWindowCents: number, skipApproval = false): Evaluation {
  if (req.amountCents > policy.perActionCapCents) {
    return { decision: 'BLOCKED', rule: 'per_action_cap', reason: `Cost ${fmt(req.amountCents)} exceeds per-action cap ${fmt(policy.perActionCapCents)}` }
  }
  const allowed = new Set(policy.allowedScopes)
  const denied = req.scopes.filter(s => !allowed.has(s))
  if (denied.length > 0) {
    return { decision: 'BLOCKED', rule: 'scope', reason: `Requested scopes not permitted: ${denied.join(', ')}` }
  }
  if (spentInWindowCents + req.amountCents > policy.windowCapCents) {
    return {
      decision: 'BLOCKED',
      rule: 'window_cap',
      reason: `Rolling-window cap: ${fmt(spentInWindowCents)} already spent in the last ${policy.windowSeconds}s; ${fmt(req.amountCents)} more would exceed ${fmt(policy.windowCapCents)}`,
    }
  }
  if (!skipApproval) {
    if (policy.alwaysRequireApproval) {
      return { decision: 'REQUIRES_APPROVAL', rule: 'approval', reason: 'Policy requires human approval for every action' }
    }
    if (policy.approvalThresholdCents !== null && req.amountCents > policy.approvalThresholdCents) {
      return {
        decision: 'REQUIRES_APPROVAL',
        rule: 'approval',
        reason: `Cost ${fmt(req.amountCents)} exceeds approval threshold ${fmt(policy.approvalThresholdCents)}. Human approval required.`,
      }
    }
  }
  return { decision: 'ALLOWED', rule: 'within_policy', reason: skipApproval ? 'Approved by owner and within hard limits' : 'Within policy limits' }
}
