// Integration tests: real route handlers, real Postgres (PGlite) with the
// production migration, running as the restricted aegis_app role.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setDb } from '@/lib/server/db'
import { createTestDb } from './helpers/testDb'
import * as owners from '@/app/api/owners/route'
import * as agents from '@/app/api/agents/route'
import * as revoke from '@/app/api/agents/[id]/revoke/route'
import * as revokeAll from '@/app/api/agents/revoke-all/route'
import * as policies from '@/app/api/policies/route'
import * as enforceRoute from '@/app/api/enforce/route'
import * as actions from '@/app/api/actions/[id]/route'
import * as approvals from '@/app/api/approvals/route'
import * as decisions from '@/app/api/decisions/route'

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let t: Awaited<ReturnType<typeof createTestDb>>
let ipCounter = 0

beforeAll(async () => {
  t = await createTestDb()
  setDb(t.db)
})
afterAll(async () => {
  setDb(null)
  await t.close()
})

function request(method: string, path: string, key?: string | null, body?: unknown, ip?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-real-ip': ip ?? `10.0.0.${++ipCounter % 250}` }
  if (key) headers.authorization = `Bearer ${key}`
  return new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function call(res: Promise<Response>): Promise<{ status: number; body: Json }> {
  const r = await res
  return { status: r.status, body: (await r.json()) as Json }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function newOwner() {
  const res = await call(owners.POST(request('POST', '/api/owners', null, { label: 'test owner' })))
  expect(res.status).toBe(201)
  return res.body as { ownerId: string; ownerKey: string }
}

async function newAgent(ownerKey: string, policy?: Json) {
  const res = await call(agents.POST(request('POST', '/api/agents', ownerKey, { name: 'agent' })))
  expect(res.status).toBe(201)
  const agent = res.body as { agent: { id: string }; agentKey: string }
  if (policy) {
    const p = await call(policies.PUT(request('PUT', '/api/policies', ownerKey, { agentId: agent.agent.id, policy })))
    expect(p.status).toBe(200)
  }
  return { id: agent.agent.id, key: agent.agentKey }
}

const enforce = (agentKey: string | null, body: Json) => call(enforceRoute.POST(request('POST', '/api/enforce', agentKey, body)))
const poll = (agentKey: string, id: string) => call(actions.GET(request('GET', `/api/actions/${id}`, agentKey), params(id)))
const decide = (ownerKey: string, actionId: string, approve: boolean) =>
  call(approvals.POST(request('POST', '/api/approvals', ownerKey, { actionId, approve })))

const POLICY = { perActionCap: 500, windowCap: 2000, windowSeconds: 86_400, approvalThreshold: 100, allowedScopes: ['read', 'write', 'banking_transfer'] }
const PAYMENT = { action: 'pay_invoice', cost: 450, scopes: ['banking_transfer'], params: { to: 'acme-saas', invoice: 'INV-1' } }

describe('authentication and ownership', () => {
  it('stores owner and agent keys only as hashes', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey)
    const rows = await t.admin<{ owner_hash: string; agent_hash: string }>(
      'select o.key_hash as owner_hash, a.key_hash as agent_hash from aegis.owners o join aegis.agents a on a.owner_id = o.id where o.id = $1',
      [o.ownerId],
    )
    expect(rows[0].owner_hash).toHaveLength(64)
    expect(rows[0].owner_hash).not.toContain(o.ownerKey)
    expect(rows[0].agent_hash).not.toContain(a.key)
    const dump = JSON.stringify(await t.admin('select * from aegis.owners union all select null, name, key_hash, key_prefix, null, created_at from aegis.agents'))
    expect(dump).not.toContain(o.ownerKey)
    expect(dump).not.toContain(a.key)
  })

  it('rejects unauthenticated, wrong-type and foreign policy writes', async () => {
    const victim = await newOwner()
    const attacker = await newOwner()
    const agent = await newAgent(victim.ownerKey, POLICY)
    const evil = { agentId: agent.id, policy: { perActionCap: 1_000_000, allowedScopes: ['exfiltrate'] } }

    expect((await call(policies.POST(request('POST', '/api/policies', null, evil)))).status).toBe(401)
    expect((await call(policies.POST(request('POST', '/api/policies', 'aeg_own_' + 'x'.repeat(43), evil)))).status).toBe(401)
    expect((await call(policies.POST(request('POST', '/api/policies', agent.key, evil)))).status).toBe(401) // agent key is not an owner key
    expect((await call(policies.POST(request('POST', '/api/policies', attacker.ownerKey, evil)))).status).toBe(404)
    // the legacy unauthenticated shape is rejected too
    expect((await call(policies.POST(request('POST', '/api/policies', null, { userId: 'u', agentId: 'a', policy: { spendingCap: 1 } })))).status).toBe(401)

    const read = await call(policies.GET(request('GET', `/api/policies?agentId=${agent.id}`, victim.ownerKey)))
    expect(read.body.policy.perActionCap).toBe(500)
    expect(read.body.policy.allowedScopes).not.toContain('exfiltrate')
    expect((await call(policies.GET(request('GET', `/api/policies?agentId=${agent.id}`, attacker.ownerKey)))).status).toBe(404)
  })

  it('requires an agent key for /api/enforce and fails closed without a policy', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey)
    expect((await enforce(null, { action: 'x' })).status).toBe(401)
    expect((await enforce(o.ownerKey, { action: 'x' })).status).toBe(401)
    expect((await enforce('aeg_agt_' + 'y'.repeat(43), { action: 'x' })).status).toBe(401)
    const r = await enforce(a.key, { action: 'x', cost: 0 })
    expect(r.status).toBe(403)
    expect(r.body.reason).toMatch(/No policy/)
  })

  it('an owner cannot see or decide another owner\'s approvals or log', async () => {
    const a = await newOwner()
    const b = await newOwner()
    const agent = await newAgent(a.ownerKey, POLICY)
    const held = await enforce(agent.key, PAYMENT)
    expect(held.status).toBe(202)
    expect((await decide(b.ownerKey, held.body.pendingActionId, true)).status).toBe(404)
    const bQueue = await call(approvals.GET(request('GET', '/api/approvals', b.ownerKey)))
    expect(bQueue.body.actions).toHaveLength(0)
    const bLog = await call(decisions.GET(request('GET', '/api/decisions', b.ownerKey)))
    expect(bLog.body.decisions.every((d: Json) => d.agentId !== agent.id)).toBe(true)
    expect((await call(decisions.GET(request('GET', '/api/decisions', null)))).status).toBe(401)
  })

  it('rate-limits owner creation per network', async () => {
    process.env.AEGIS_OWNER_SIGNUPS_PER_HOUR = '3'
    try {
      const statuses: number[] = []
      for (let i = 0; i < 4; i++) statuses.push((await owners.POST(request('POST', '/api/owners', null, {}, '203.0.113.9'))).status)
      expect(statuses).toEqual([201, 201, 201, 429])
    } finally {
      delete process.env.AEGIS_OWNER_SIGNUPS_PER_HOUR
    }
  })
})

describe('enforcement decisions', () => {
  it('returns ALLOWED, REQUIRES_APPROVAL and BLOCKED with the right status codes', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, POLICY)
    const ok = await enforce(a.key, { action: 'read_report', cost: 25, scopes: ['read'] })
    expect(ok.status).toBe(200)
    expect(ok.body.decision.decision).toBe('ALLOWED')
    const held = await enforce(a.key, PAYMENT)
    expect(held.status).toBe(202)
    expect(held.body.requiresApproval).toBe(true)
    expect(held.body.pendingActionId).toMatch(/[0-9a-f-]{36}/)
    const overCap = await enforce(a.key, { action: 'wire', cost: 900, scopes: ['banking_transfer'] })
    expect(overCap.status).toBe(403)
    expect(overCap.body.reason).toMatch(/per-action cap/)
    const scope = await enforce(a.key, { action: 'leak', cost: 0, scopes: ['exfiltrate'] })
    expect(scope.status).toBe(403)
    expect(scope.body.reason).toMatch(/not permitted/)
  })

  it('rolling-window cap blocks task-splitting', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, { perActionCap: 100, windowCap: 200, windowSeconds: 3600, approvalThreshold: 100, allowedScopes: ['banking_transfer'] })
    const split = { action: 'transfer_part', cost: 90, scopes: ['banking_transfer'] }
    const results = []
    for (let i = 0; i < 5; i++) results.push((await enforce(a.key, split)).status)
    expect(results).toEqual([200, 200, 403, 403, 403])
    const blocked = await enforce(a.key, split)
    expect(blocked.body.reason).toMatch(/Rolling-window cap/)
    // A $20 action still fits ($180 + $20 = $200).
    expect((await enforce(a.key, { ...split, cost: 20 })).status).toBe(200)

    // Once the window rolls past those spends, capacity returns (simulate the clock
    // by back-dating rows; needs the append-only trigger lifted by a superuser).
    await t.admin('alter table aegis.decision_log disable trigger decision_log_no_update_delete')
    await t.admin("update aegis.decision_log set created_at = created_at - interval '2 hours' where agent_id = $1", [a.id])
    await t.admin('alter table aegis.decision_log enable trigger decision_log_no_update_delete')
    expect((await enforce(a.key, split)).status).toBe(200)
  })

  it('concurrent split requests cannot race past the window cap', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, { perActionCap: 100, windowCap: 200, approvalThreshold: 100, allowedScopes: [] })
    const statuses = (await Promise.all(Array.from({ length: 6 }, () => enforce(a.key, { action: 'split', cost: 90 })))).map(r => r.status)
    expect(statuses.filter(s => s === 200)).toHaveLength(2)
    expect(statuses.filter(s => s === 403)).toHaveLength(4)
  })
})

describe('approval queue', () => {
  it('approval releases exactly the matching action once; replay and substitution are rejected', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, POLICY)
    const held = await enforce(a.key, PAYMENT)
    const id = held.body.pendingActionId as string

    const before = await poll(a.key, id)
    expect(before.body.status).toBe('pending')
    expect(before.body.approvalToken).toBeUndefined()

    const queue = await call(approvals.GET(request('GET', '/api/approvals', o.ownerKey)))
    expect(queue.body.actions.map((x: Json) => x.id)).toContain(id)

    const approved = await decide(o.ownerKey, id, true)
    expect(approved.status).toBe(200)
    expect(approved.body.action.status).toBe('approved')

    const issued = await poll(a.key, id)
    expect(issued.body.status).toBe('approved')
    const token = issued.body.approvalToken as string
    expect(token).toMatch(/^aeg_apv_/)
    // The token is minted once; later polls do not reveal it again.
    const again = await poll(a.key, id)
    expect(again.body.approvalToken).toBeUndefined()
    expect(again.body.tokenIssued).toBe(true)

    // Substitution: same token, different amount / recipient → blocked, token not consumed.
    const bigger = await enforce(a.key, { ...PAYMENT, cost: 499, approvalToken: token })
    expect(bigger.status).toBe(403)
    expect(bigger.body.reason).toMatch(/payload hash mismatch/)
    const redirected = await enforce(a.key, { ...PAYMENT, params: { to: 'mallory', invoice: 'INV-1' }, approvalToken: token })
    expect(redirected.status).toBe(403)

    // Another agent of the same owner cannot use the token.
    const other = await newAgent(o.ownerKey, POLICY)
    expect((await enforce(other.key, { ...PAYMENT, approvalToken: token })).status).toBe(403)

    // Exact payload → released.
    const released = await enforce(a.key, { ...PAYMENT, approvalToken: token })
    expect(released.status).toBe(200)
    expect(released.body.released).toBe(true)
    expect(released.body.pendingActionId).toBe(id)

    // Replay → rejected.
    const replay = await enforce(a.key, { ...PAYMENT, approvalToken: token })
    expect(replay.status).toBe(403)
    expect(replay.body.reason).toMatch(/already used/)

    const final = await poll(a.key, id)
    expect(final.body.status).toBe('consumed')
  })

  it('approving one action does not release a different held action', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, POLICY)
    const first = await enforce(a.key, PAYMENT)
    const second = await enforce(a.key, { ...PAYMENT, params: { to: 'acme-saas', invoice: 'INV-2' } })
    await decide(o.ownerKey, first.body.pendingActionId, true)
    const token = (await poll(a.key, first.body.pendingActionId)).body.approvalToken
    const wrong = await enforce(a.key, { ...PAYMENT, params: { to: 'acme-saas', invoice: 'INV-2' }, approvalToken: token })
    expect(wrong.status).toBe(403)
    const secondState = await poll(a.key, second.body.pendingActionId)
    expect(secondState.body.status).toBe('pending')
    expect(secondState.body.approvalToken).toBeUndefined()
  })

  it('denied actions can never be released', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, POLICY)
    const held = await enforce(a.key, PAYMENT)
    const denied = await decide(o.ownerKey, held.body.pendingActionId, false)
    expect(denied.body.action.status).toBe('denied')
    const p = await poll(a.key, held.body.pendingActionId)
    expect(p.body.status).toBe('denied')
    expect(p.body.approvalToken).toBeUndefined()
    expect((await decide(o.ownerKey, held.body.pendingActionId, true)).status).toBe(409)
  })

  it('pending actions expire, and so do unreleased approvals', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, POLICY)
    const held = await enforce(a.key, PAYMENT)
    await t.admin("update aegis.pending_actions set expires_at = now() - interval '1 second' where id = $1", [held.body.pendingActionId])
    expect((await decide(o.ownerKey, held.body.pendingActionId, true)).status).toBe(409)
    expect((await poll(a.key, held.body.pendingActionId)).body.status).toBe('expired')

    const held2 = await enforce(a.key, { ...PAYMENT, params: { invoice: 'INV-9' } })
    await decide(o.ownerKey, held2.body.pendingActionId, true)
    const token = (await poll(a.key, held2.body.pendingActionId)).body.approvalToken
    await t.admin("update aegis.pending_actions set release_expires_at = now() - interval '1 second' where id = $1", [held2.body.pendingActionId])
    const late = await enforce(a.key, { ...PAYMENT, params: { invoice: 'INV-9' }, approvalToken: token })
    expect(late.status).toBe(403)
    expect(late.body.reason).toMatch(/expired/)
  })
})

describe('revoke', () => {
  it('one-click revoke blocks the agent immediately and cancels its open approvals', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, POLICY)
    expect((await enforce(a.key, { action: 'read', cost: 1, scopes: ['read'] })).status).toBe(200)
    const held = await enforce(a.key, PAYMENT)

    const other = await newOwner()
    expect((await call(revoke.POST(request('POST', `/api/agents/${a.id}/revoke`, other.ownerKey), params(a.id)))).status).toBe(404)
    expect((await call(revoke.POST(request('POST', `/api/agents/${a.id}/revoke`, null), params(a.id)))).status).toBe(401)

    const r = await call(revoke.POST(request('POST', `/api/agents/${a.id}/revoke`, o.ownerKey), params(a.id)))
    expect(r.status).toBe(200)
    const after = await enforce(a.key, { action: 'read', cost: 1, scopes: ['read'] })
    expect(after.status).toBe(403)
    expect(after.body.reason).toMatch(/revoked/)
    expect((await decide(o.ownerKey, held.body.pendingActionId, true)).status).toBe(409)
    expect((await poll(a.key, held.body.pendingActionId)).status).toBe(403)
  })

  it('revoke also kills an already-issued approval token', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, POLICY)
    const held = await enforce(a.key, PAYMENT)
    await decide(o.ownerKey, held.body.pendingActionId, true)
    const token = (await poll(a.key, held.body.pendingActionId)).body.approvalToken
    await revoke.POST(request('POST', `/api/agents/${a.id}/revoke`, o.ownerKey), params(a.id))
    expect((await enforce(a.key, { ...PAYMENT, approvalToken: token })).status).toBe(403)
  })

  it('kill switch revokes every agent of the owner and nobody else\'s', async () => {
    const o = await newOwner()
    const bystander = await newOwner()
    const a1 = await newAgent(o.ownerKey, POLICY)
    const a2 = await newAgent(o.ownerKey, POLICY)
    const b1 = await newAgent(bystander.ownerKey, POLICY)
    const res = await call(revokeAll.POST(request('POST', '/api/agents/revoke-all', o.ownerKey)))
    expect(res.body.revoked).toHaveLength(2)
    for (const a of [a1, a2]) expect((await enforce(a.key, { action: 'x', cost: 0 })).status).toBe(403)
    expect((await enforce(b1.key, { action: 'x', cost: 0 })).status).toBe(200)
  })
})

describe('decision log', () => {
  it('records every decision, approval, denial and revoke with actor and timestamp', async () => {
    const o = await newOwner()
    const a = await newAgent(o.ownerKey, POLICY)
    await enforce(a.key, { action: 'read', cost: 1, scopes: ['read'] })
    const held = await enforce(a.key, PAYMENT)
    await decide(o.ownerKey, held.body.pendingActionId, true)
    const token = (await poll(a.key, held.body.pendingActionId)).body.approvalToken
    await enforce(a.key, { ...PAYMENT, approvalToken: token })
    const held2 = await enforce(a.key, { ...PAYMENT, params: { invoice: 'X' } })
    await decide(o.ownerKey, held2.body.pendingActionId, false)
    await enforce(a.key, { action: 'leak', scopes: ['exfiltrate'] })
    await revoke.POST(request('POST', `/api/agents/${a.id}/revoke`, o.ownerKey), params(a.id))
    await enforce(a.key, { action: 'read', cost: 1, scopes: ['read'] })

    const log = await call(decisions.GET(request('GET', `/api/decisions?agentId=${a.id}&limit=100`, o.ownerKey)))
    const events = (log.body.decisions as Json[]).reverse().map(d => `${d.eventType}:${d.decision ?? '-'}:${d.actorType}`)
    expect(events).toEqual([
      'agent_created:-:owner',
      'policy_set:-:owner',
      'enforce:ALLOWED:agent',
      'enforce:REQUIRES_APPROVAL:agent',
      'approve:-:owner',
      'release:ALLOWED:agent',
      'enforce:REQUIRES_APPROVAL:agent',
      'deny:BLOCKED:owner',
      'enforce:BLOCKED:agent',
      'revoke:BLOCKED:owner',
      'enforce:BLOCKED:agent',
    ])
    for (const d of log.body.decisions as Json[]) {
      expect(Number.isNaN(Date.parse(d.createdAt))).toBe(false)
      expect(d.actorId).toBeTruthy()
    }
  })

  it('is append-only for the app role and for superusers', async () => {
    const o = await newOwner()
    await newAgent(o.ownerKey, POLICY)
    await expect(t.asApp('update aegis.decision_log set reason = $1', ['tampered'], o.ownerId)).rejects.toThrow(/permission denied/)
    await expect(t.asApp('delete from aegis.decision_log', [], o.ownerId)).rejects.toThrow(/permission denied/)
    await expect(t.admin("update aegis.decision_log set reason = 'tampered'")).rejects.toThrow(/append-only/)
    await expect(t.admin('delete from aegis.decision_log')).rejects.toThrow(/append-only/)
    await expect(t.admin('truncate aegis.decision_log cascade')).rejects.toThrow(/append-only/)
  })

  it('row-level security hides rows without the matching owner context', async () => {
    const o = await newOwner()
    const other = await newOwner()
    await newAgent(o.ownerKey, POLICY)
    expect(await t.asApp('select * from aegis.agents', [], null)).toHaveLength(0)
    expect(await t.asApp('select * from aegis.decision_log', [], null)).toHaveLength(0)
    const mine = await t.asApp<{ owner_id: string }>('select owner_id from aegis.decision_log', [], o.ownerId)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every(r => r.owner_id === o.ownerId)).toBe(true)
    // Writing a row for another owner is refused by the RLS with-check.
    await expect(
      t.asApp("insert into aegis.agents (owner_id, name, key_hash, key_prefix) values ($1, 'x', repeat('a', 64), 'x')", [other.ownerId], o.ownerId),
    ).rejects.toThrow(/row-level security/)
    // The Supabase API roles have no access at all.
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await t.admin('begin')
      await t.admin(`set local role ${role}`)
      await expect(t.admin('select * from aegis.agents')).rejects.toThrow(/permission denied/)
      await t.admin('rollback')
    }
  })
})
