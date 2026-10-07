import { describe, expect, it } from 'vitest'
import { canonicalJson, generateSecret, payloadHash, secretKind, sha256Hex } from '@/lib/server/crypto'
import { evaluate, parseActionRequest, parsePolicy, ValidationError, type PolicyRecord } from '@/lib/server/policy'

const policy: PolicyRecord = {
  perActionCapCents: 10_000,
  windowCapCents: 20_000,
  windowSeconds: 86_400,
  approvalThresholdCents: 5_000,
  alwaysRequireApproval: false,
  allowedScopes: ['query', 'read', 'write'],
}
const req = (amountCents: number, scopes: string[] = ['read']) => ({ action: 'a', amountCents, scopes, params: null })

describe('evaluate (pure decision function)', () => {
  it('allows an action within every limit', () => {
    expect(evaluate(policy, req(2_500), 0).decision).toBe('ALLOWED')
  })

  it('blocks above the per-action cap before anything else', () => {
    const ev = evaluate(policy, req(15_000, ['exfiltrate']), 0)
    expect(ev).toMatchObject({ decision: 'BLOCKED', rule: 'per_action_cap' })
  })

  it('blocks scopes outside the allow-list', () => {
    expect(evaluate(policy, req(100, ['read', 'banking_transfer']), 0)).toMatchObject({ decision: 'BLOCKED', rule: 'scope' })
  })

  it('blocks when the rolling window would be exceeded (task-splitting)', () => {
    expect(evaluate(policy, req(4_500), 18_000)).toMatchObject({ decision: 'BLOCKED', rule: 'window_cap' })
    expect(evaluate(policy, req(2_000), 18_000).decision).toBe('ALLOWED')
  })

  it('requires approval above the threshold, and always when configured', () => {
    expect(evaluate(policy, req(7_500), 0).decision).toBe('REQUIRES_APPROVAL')
    expect(evaluate(policy, req(5_000), 0).decision).toBe('ALLOWED') // threshold is strictly "over"
    expect(evaluate({ ...policy, alwaysRequireApproval: true }, req(0), 0).decision).toBe('REQUIRES_APPROVAL')
    expect(evaluate({ ...policy, approvalThresholdCents: null }, req(9_000), 0).decision).toBe('ALLOWED')
  })

  it('release (skipApproval) still enforces hard limits', () => {
    expect(evaluate(policy, req(7_500), 0, true).decision).toBe('ALLOWED')
    expect(evaluate(policy, req(7_500), 15_000, true)).toMatchObject({ decision: 'BLOCKED', rule: 'window_cap' })
  })
})

describe('input validation', () => {
  it('parses dollars to integer cents and defaults the window', () => {
    expect(parsePolicy({ spendingCap: 100.5, approvalThreshold: 50, allowedScopes: ['b', 'a', 'a'] })).toEqual({
      perActionCapCents: 10_050,
      windowCapCents: 10_050,
      windowSeconds: 86_400,
      approvalThresholdCents: 5_000,
      alwaysRequireApproval: false,
      allowedScopes: ['a', 'b'],
    })
  })

  it('rejects malformed policies and actions', () => {
    expect(() => parsePolicy({ perActionCap: -1 })).toThrow(ValidationError)
    expect(() => parsePolicy({ perActionCap: 1, windowSeconds: 5 })).toThrow(ValidationError)
    expect(() => parsePolicy({ perActionCap: 1, allowedScopes: ['bad scope!'] })).toThrow(ValidationError)
    expect(() => parsePolicy({})).toThrow(ValidationError)
    expect(() => parseActionRequest({ action: '' })).toThrow(ValidationError)
    expect(() => parseActionRequest({ action: 'x', cost: 'free' })).toThrow(ValidationError)
    expect(() => parseActionRequest({ action: 'x', params: [1] })).toThrow(ValidationError)
  })
})

describe('crypto helpers', () => {
  it('canonical JSON is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }))
  })

  it('payload hash binds agent, action, amount, scopes and params', () => {
    const base = { agentId: 'x', action: 'pay', amountCents: 45_000, scopes: ['b', 'a'], params: { to: 'acme' } }
    const h = payloadHash(base)
    expect(payloadHash({ ...base, scopes: ['a', 'b'] })).toBe(h)
    expect(payloadHash({ ...base, amountCents: 45_001 })).not.toBe(h)
    expect(payloadHash({ ...base, params: { to: 'mallory' } })).not.toBe(h)
    expect(payloadHash({ ...base, agentId: 'y' })).not.toBe(h)
    expect(payloadHash({ ...base, action: 'pay2' })).not.toBe(h)
  })

  it('secrets are typed, high-entropy and stored only as hashes', () => {
    const s = generateSecret('agent')
    expect(secretKind(s.secret)).toBe('agent')
    expect(secretKind('aeg_own_short')).toBeNull()
    expect(s.hash).toBe(sha256Hex(s.secret))
    expect(s.hash).not.toContain(s.secret)
    expect(generateSecret('agent').secret).not.toBe(s.secret)
  })
})
