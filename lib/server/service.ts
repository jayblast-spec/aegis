// Aegis enforcement service: every state change and every decision goes
// through here, inside one database transaction, and is written to the
// append-only decision log in that same transaction.

import type { Db, Queryable } from './db'
import { generateSecret, payloadHash, secretKind, sha256Hex } from './crypto'
import { evaluate, fmt, parseActionRequest, parsePolicy, ValidationError, type Decision, type PolicyRecord } from './policy'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface AgentAuth {
  agentId: string
  ownerId: string
  status: 'active' | 'revoked'
}

const pendingTtlSeconds = () => intEnv('AEGIS_PENDING_TTL_SECONDS', 900)
const releaseTtlSeconds = () => intEnv('AEGIS_RELEASE_TTL_SECONDS', 600)
export const ownerSignupsPerHour = () => intEnv('AEGIS_OWNER_SIGNUPS_PER_HOUR', 10)

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 ? n : fallback
}

// ------------------------------------------------------------------ auth

export async function createOwner(db: Db, label: unknown, ipHash: string | null) {
  const cleanLabel = typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : 'Aegis owner'
  const key = generateSecret('owner')
  try {
    const ownerId = await db.tx(null, async q => {
      const { rows } = await q.query<{ id: string }>('select aegis.create_owner($1, $2, $3, $4, $5) as id', [
        cleanLabel,
        key.hash,
        key.prefix,
        ipHash,
        ownerSignupsPerHour(),
      ])
      return rows[0].id
    })
    return { ownerId, ownerKey: key.secret, label: cleanLabel }
  } catch (err) {
    if (err instanceof Error && err.message.includes('aegis_rate_limited')) {
      throw new HttpError(429, 'rate_limited', 'Too many owner accounts created from this network in the last hour')
    }
    throw err
  }
}

export async function authOwner(db: Db, secret: string | null): Promise<string> {
  if (!secret || secretKind(secret) !== 'owner') throw new HttpError(401, 'unauthorized', 'Owner key required (Authorization: Bearer aeg_own_...)')
  const ownerId = await db.tx(null, async q => {
    const { rows } = await q.query<{ id: string | null }>('select aegis.resolve_owner($1) as id', [sha256Hex(secret)])
    return rows[0]?.id ?? null
  })
  if (!ownerId) throw new HttpError(401, 'unauthorized', 'Invalid owner key')
  return ownerId
}

export async function authAgent(db: Db, secret: string | null): Promise<AgentAuth> {
  if (!secret || secretKind(secret) !== 'agent') throw new HttpError(401, 'unauthorized', 'Agent key required (Authorization: Bearer aeg_agt_...)')
  const row = await db.tx(null, async q => {
    const { rows } = await q.query<{ agent_id: string; owner_id: string; status: 'active' | 'revoked' }>(
      'select agent_id, owner_id, status from aegis.resolve_agent($1)',
      [sha256Hex(secret)],
    )
    return rows[0] ?? null
  })
  if (!row) throw new HttpError(401, 'unauthorized', 'Invalid agent key')
  return { agentId: row.agent_id, ownerId: row.owner_id, status: row.status }
}

// ------------------------------------------------------------------ log

interface LogEntry {
  ownerId: string
  agentId: string | null
  pendingActionId?: string | null
  eventType: 'enforce' | 'release' | 'approve' | 'deny' | 'expire' | 'revoke' | 'policy_set' | 'agent_created'
  decision?: Decision | null
  reason: string
  actorType: 'owner' | 'agent' | 'system'
  actorId: string
  action?: string | null
  amountCents?: number | null
  payloadHash?: string | null
  countsTowardSpend?: boolean
}

async function writeLog(q: Queryable, e: LogEntry): Promise<{ id: string; createdAt: string }> {
  const { rows } = await q.query<{ id: string; created_at: Date | string }>(
    `insert into aegis.decision_log
       (owner_id, agent_id, pending_action_id, event_type, decision, reason, actor_type, actor_id, action, amount_cents, payload_hash, counts_toward_spend)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id::text as id, created_at`,
    [
      e.ownerId,
      e.agentId,
      e.pendingActionId ?? null,
      e.eventType,
      e.decision ?? null,
      e.reason,
      e.actorType,
      e.actorId,
      e.action ?? null,
      e.amountCents ?? null,
      e.payloadHash ?? null,
      e.countsTowardSpend ?? false,
    ],
  )
  return { id: rows[0].id, createdAt: iso(rows[0].created_at) }
}

function iso(v: Date | string | null): string {
  if (v === null) return ''
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

/** Serialises enforce / revoke / release for one agent so limits can't be raced. */
async function lockAgent(q: Queryable, agentId: string) {
  await q.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', ['aegis-agent:' + agentId])
}

// ------------------------------------------------------------------ agents

export interface AgentView {
  id: string
  name: string
  keyPrefix: string
  status: 'active' | 'revoked'
  createdAt: string
  revokedAt: string | null
  policy: PolicyView | null
}

export interface PolicyView {
  perActionCap: number
  windowCap: number
  windowSeconds: number
  approvalThreshold: number | null
  alwaysRequireApproval: boolean
  allowedScopes: string[]
  updatedAt: string
}

export async function createAgent(db: Db, ownerId: string, name: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw new ValidationError('name must be 1-80 characters')
  const key = generateSecret('agent')
  return db.tx(ownerId, async q => {
    const { rows } = await q.query<{ id: string; created_at: Date }>(
      'insert into aegis.agents (owner_id, name, key_hash, key_prefix) values ($1, $2, $3, $4) returning id, created_at',
      [ownerId, name.trim(), key.hash, key.prefix],
    )
    const agentId = rows[0].id
    await writeLog(q, {
      ownerId,
      agentId,
      eventType: 'agent_created',
      reason: `Agent "${name.trim()}" created; key ${key.prefix}… issued`,
      actorType: 'owner',
      actorId: ownerId,
    })
    return {
      agent: { id: agentId, name: name.trim(), keyPrefix: key.prefix, status: 'active' as const, createdAt: iso(rows[0].created_at), revokedAt: null, policy: null },
      agentKey: key.secret,
    }
  })
}

type PolicyRow = {
  per_action_cap_cents: number
  window_cap_cents: number
  window_seconds: number
  approval_threshold_cents: number | null
  always_require_approval: boolean
  allowed_scopes: string[]
  updated_at: Date | string
}

const POLICY_COLUMNS = `per_action_cap_cents::float8 as per_action_cap_cents, window_cap_cents::float8 as window_cap_cents,
  window_seconds, approval_threshold_cents::float8 as approval_threshold_cents, always_require_approval, allowed_scopes, updated_at`

function toPolicyRecord(r: PolicyRow): PolicyRecord {
  return {
    perActionCapCents: Number(r.per_action_cap_cents),
    windowCapCents: Number(r.window_cap_cents),
    windowSeconds: Number(r.window_seconds),
    approvalThresholdCents: r.approval_threshold_cents === null ? null : Number(r.approval_threshold_cents),
    alwaysRequireApproval: r.always_require_approval,
    allowedScopes: r.allowed_scopes ?? [],
  }
}

function toPolicyView(r: PolicyRow): PolicyView {
  const p = toPolicyRecord(r)
  return {
    perActionCap: p.perActionCapCents / 100,
    windowCap: p.windowCapCents / 100,
    windowSeconds: p.windowSeconds,
    approvalThreshold: p.approvalThresholdCents === null ? null : p.approvalThresholdCents / 100,
    alwaysRequireApproval: p.alwaysRequireApproval,
    allowedScopes: p.allowedScopes,
    updatedAt: iso(r.updated_at),
  }
}

export async function listAgents(db: Db, ownerId: string): Promise<AgentView[]> {
  return db.tx(ownerId, async q => {
    const { rows } = await q.query<
      { id: string; name: string; key_prefix: string; status: 'active' | 'revoked'; created_at: Date; revoked_at: Date | null; has_policy: boolean } & PolicyRow
    >(
      `select a.id, a.name, a.key_prefix, a.status, a.created_at, a.revoked_at, (p.agent_id is not null) as has_policy,
              p.per_action_cap_cents::float8 as per_action_cap_cents, p.window_cap_cents::float8 as window_cap_cents, p.window_seconds,
              p.approval_threshold_cents::float8 as approval_threshold_cents, p.always_require_approval, p.allowed_scopes, p.updated_at
         from aegis.agents a left join aegis.policies p on p.agent_id = a.id
        where a.owner_id = $1
        order by a.created_at desc`,
      [ownerId],
    )
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.key_prefix,
      status: r.status,
      createdAt: iso(r.created_at),
      revokedAt: r.revoked_at ? iso(r.revoked_at) : null,
      policy: r.has_policy ? toPolicyView(r) : null,
    }))
  })
}

export async function revokeAgent(db: Db, ownerId: string, agentId: string) {
  assertUuid(agentId, 'agentId')
  return db.tx(ownerId, async q => {
    await lockAgent(q, agentId)
    const { rows } = await q.query<{ id: string; name: string; status: string }>(
      'select id, name, status from aegis.agents where id = $1 and owner_id = $2 for update',
      [agentId, ownerId],
    )
    if (!rows[0]) throw new HttpError(404, 'not_found', 'Agent not found')
    if (rows[0].status === 'revoked') return { agentId, revoked: true, alreadyRevoked: true }
    await revokeLocked(q, ownerId, agentId, rows[0].name, 'Revoked by owner (one-click revoke)')
    return { agentId, revoked: true, alreadyRevoked: false }
  })
}

async function revokeLocked(q: Queryable, ownerId: string, agentId: string, name: string, reason: string) {
  await q.query("update aegis.agents set status = 'revoked', revoked_at = now(), revoked_by = $2 where id = $1", [agentId, 'owner:' + ownerId])
  const cancelled = await q.query<{ id: string }>(
    `update aegis.pending_actions set status = 'cancelled', reason = 'Agent revoked'
      where agent_id = $1 and status in ('pending', 'approved') returning id`,
    [agentId],
  )
  await writeLog(q, {
    ownerId,
    agentId,
    eventType: 'revoke',
    decision: 'BLOCKED',
    reason: `${reason}: "${name}"; ${cancelled.rows.length} open approval(s) cancelled`,
    actorType: 'owner',
    actorId: ownerId,
  })
}

/** Kill switch: revoke every active agent the owner has. */
export async function revokeAllAgents(db: Db, ownerId: string) {
  return db.tx(ownerId, async q => {
    const { rows } = await q.query<{ id: string; name: string }>(
      "select id, name from aegis.agents where owner_id = $1 and status = 'active' order by id",
      [ownerId],
    )
    for (const a of rows) {
      await lockAgent(q, a.id)
      await revokeLocked(q, ownerId, a.id, a.name, 'Kill switch: all agents revoked by owner')
    }
    return { revoked: rows.map(r => r.id) }
  })
}

// ------------------------------------------------------------------ policies

export async function setPolicy(db: Db, ownerId: string, agentId: unknown, policyInput: unknown) {
  if (typeof agentId !== 'string') throw new ValidationError('agentId is required')
  assertUuid(agentId, 'agentId')
  const policy = parsePolicy(policyInput)
  return db.tx(ownerId, async q => {
    const agent = await q.query<{ id: string }>('select id from aegis.agents where id = $1 and owner_id = $2', [agentId, ownerId])
    if (!agent.rows[0]) throw new HttpError(404, 'not_found', 'Agent not found for this owner')
    await lockAgent(q, agentId)
    const { rows } = await q.query<PolicyRow>(
      `insert into aegis.policies (agent_id, owner_id, per_action_cap_cents, window_cap_cents, window_seconds,
                                   approval_threshold_cents, always_require_approval, allowed_scopes, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (agent_id) do update set
         per_action_cap_cents = excluded.per_action_cap_cents, window_cap_cents = excluded.window_cap_cents,
         window_seconds = excluded.window_seconds, approval_threshold_cents = excluded.approval_threshold_cents,
         always_require_approval = excluded.always_require_approval, allowed_scopes = excluded.allowed_scopes, updated_at = now()
       returning ${POLICY_COLUMNS}`,
      [
        agentId,
        ownerId,
        policy.perActionCapCents,
        policy.windowCapCents,
        policy.windowSeconds,
        policy.approvalThresholdCents,
        policy.alwaysRequireApproval,
        policy.allowedScopes,
      ],
    )
    const view = toPolicyView(rows[0])
    await writeLog(q, {
      ownerId,
      agentId,
      eventType: 'policy_set',
      reason: `Policy set: per-action ${fmt(policy.perActionCapCents)}, ${fmt(policy.windowCapCents)} per ${policy.windowSeconds}s, approval ${
        policy.alwaysRequireApproval ? 'always' : policy.approvalThresholdCents === null ? 'never' : 'over ' + fmt(policy.approvalThresholdCents)
      }, scopes [${policy.allowedScopes.join(', ')}]`,
      actorType: 'owner',
      actorId: ownerId,
    })
    return { agentId, policy: view }
  })
}

export async function getPolicy(db: Db, ownerId: string, agentId: string) {
  assertUuid(agentId, 'agentId')
  return db.tx(ownerId, async q => {
    const { rows } = await q.query<PolicyRow>(`select ${POLICY_COLUMNS} from aegis.policies where agent_id = $1 and owner_id = $2`, [agentId, ownerId])
    if (!rows[0]) throw new HttpError(404, 'not_found', 'Policy not found')
    return { agentId, policy: toPolicyView(rows[0]) }
  })
}

// ------------------------------------------------------------------ enforce

export interface EnforceBody {
  allowed: boolean
  reason: string
  requiresApproval?: boolean
  pendingActionId?: string
  expiresAt?: string
  released?: boolean
  logId: string
  decision: { timestamp: string; agentId: string; action: string; decision: Decision }
}

export async function enforce(db: Db, auth: AgentAuth, body: Record<string, unknown>): Promise<{ status: number; body: EnforceBody }> {
  const req = parseActionRequest(body)
  const hash = payloadHash({ agentId: auth.agentId, ...req })
  const approvalToken = body.approvalToken

  return db.tx(auth.ownerId, async q => {
    await lockAgent(q, auth.agentId)

    const finish = async (
      decision: Decision,
      reason: string,
      extra: { eventType?: 'enforce' | 'release'; pendingActionId?: string; expiresAt?: string; counts?: boolean } = {},
    ) => {
      const log = await writeLog(q, {
        ownerId: auth.ownerId,
        agentId: auth.agentId,
        pendingActionId: extra.pendingActionId ?? null,
        eventType: extra.eventType ?? 'enforce',
        decision,
        reason,
        actorType: 'agent',
        actorId: auth.agentId,
        action: req.action,
        amountCents: req.amountCents,
        payloadHash: hash,
        countsTowardSpend: extra.counts ?? false,
      })
      const out: EnforceBody = {
        allowed: decision === 'ALLOWED',
        reason,
        logId: log.id,
        decision: { timestamp: log.createdAt, agentId: auth.agentId, action: req.action, decision },
      }
      if (decision === 'REQUIRES_APPROVAL') {
        out.requiresApproval = true
        out.pendingActionId = extra.pendingActionId
        out.expiresAt = extra.expiresAt
      }
      if (extra.eventType === 'release' && decision === 'ALLOWED') {
        out.released = true
        out.pendingActionId = extra.pendingActionId
      }
      return { status: decision === 'ALLOWED' ? 200 : decision === 'REQUIRES_APPROVAL' ? 202 : 403, body: out }
    }

    // Fresh read under the agent lock: a revoke that committed a moment ago is visible here.
    const agent = await q.query<{ status: string }>('select status from aegis.agents where id = $1', [auth.agentId])
    if (agent.rows[0]?.status !== 'active') return finish('BLOCKED', 'Agent access revoked by owner')

    const policyRes = await q.query<PolicyRow>(`select ${POLICY_COLUMNS} from aegis.policies where agent_id = $1`, [auth.agentId])
    const policyRow = policyRes.rows[0]

    // ---- release of a previously approved action
    if (approvalToken !== undefined && approvalToken !== null) {
      if (typeof approvalToken !== 'string' || secretKind(approvalToken) !== 'approval') {
        return finish('BLOCKED', 'Invalid approval token', { eventType: 'release' })
      }
      const pending = await q.query<{
        id: string
        status: string
        payload_hash: string
        release_expired: boolean
      }>(
        `select id, status, payload_hash, (release_expires_at is null or release_expires_at < now()) as release_expired
           from aegis.pending_actions where token_hash = $1 and agent_id = $2 for update`,
        [sha256Hex(approvalToken), auth.agentId],
      )
      const p = pending.rows[0]
      if (!p) return finish('BLOCKED', 'Invalid approval token', { eventType: 'release' })
      if (p.status === 'consumed') return finish('BLOCKED', 'Approval token already used (replay rejected)', { eventType: 'release', pendingActionId: p.id })
      if (p.status !== 'approved') return finish('BLOCKED', `Pending action is ${p.status}; nothing to release`, { eventType: 'release', pendingActionId: p.id })
      if (p.release_expired) {
        await q.query("update aegis.pending_actions set status = 'expired' where id = $1", [p.id])
        return finish('BLOCKED', 'Approval expired before the action was released', { eventType: 'release', pendingActionId: p.id })
      }
      if (p.payload_hash !== hash) {
        return finish('BLOCKED', 'Request does not match the approved action (payload hash mismatch); token not consumed', {
          eventType: 'release',
          pendingActionId: p.id,
        })
      }
      if (!policyRow) return finish('BLOCKED', 'No policy set for this agent (fail closed)', { eventType: 'release', pendingActionId: p.id })
      const policy = toPolicyRecord(policyRow)
      const ev = evaluate(policy, req, await windowSpent(q, auth.agentId, policy.windowSeconds), true)
      if (ev.decision !== 'ALLOWED') return finish('BLOCKED', ev.reason, { eventType: 'release', pendingActionId: p.id })
      const consumed = await q.query(
        "update aegis.pending_actions set status = 'consumed', consumed_at = now() where id = $1 and status = 'approved' returning id",
        [p.id],
      )
      if (!consumed.rows[0]) return finish('BLOCKED', 'Approval token already used (replay rejected)', { eventType: 'release', pendingActionId: p.id })
      return finish('ALLOWED', 'Released: approved by owner, single-use token consumed, hard limits re-checked', {
        eventType: 'release',
        pendingActionId: p.id,
        counts: true,
      })
    }

    // ---- normal decision
    if (!policyRow) return finish('BLOCKED', 'No policy set for this agent (fail closed)')
    const policy = toPolicyRecord(policyRow)
    const ev = evaluate(policy, req, await windowSpent(q, auth.agentId, policy.windowSeconds))

    if (ev.decision === 'REQUIRES_APPROVAL') {
      const created = await q.query<{ id: string; expires_at: Date }>(
        `insert into aegis.pending_actions (owner_id, agent_id, action, request, payload_hash, amount_cents, scopes, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))
         returning id, expires_at`,
        [auth.ownerId, auth.agentId, req.action, JSON.stringify(req), hash, req.amountCents, req.scopes, pendingTtlSeconds()],
      )
      return finish('REQUIRES_APPROVAL', ev.reason, { pendingActionId: created.rows[0].id, expiresAt: iso(created.rows[0].expires_at) })
    }
    return finish(ev.decision, ev.reason, { counts: ev.decision === 'ALLOWED' })
  })
}

async function windowSpent(q: Queryable, agentId: string, windowSeconds: number): Promise<number> {
  const { rows } = await q.query<{ spent: number | string }>(
    `select coalesce(sum(amount_cents), 0)::float8 as spent from aegis.decision_log
      where agent_id = $1 and counts_toward_spend and created_at > now() - make_interval(secs => $2)`,
    [agentId, windowSeconds],
  )
  return Number(rows[0].spent)
}

// ------------------------------------------------------------------ approvals

export interface PendingView {
  id: string
  agentId: string
  agentName?: string
  action: string
  amount: number
  scopes: string[]
  params: Record<string, unknown> | null
  status: string
  reason: string | null
  createdAt: string
  expiresAt: string
  decidedAt: string | null
  releaseExpiresAt: string | null
}

type PendingRow = {
  id: string
  agent_id: string
  agent_name?: string
  action: string
  request: { params?: Record<string, unknown> | null } | string
  amount_cents: number
  scopes: string[]
  status: string
  reason: string | null
  created_at: Date
  expires_at: Date
  decided_at: Date | null
  release_expires_at: Date | null
  token_hash?: string | null
}

const PENDING_COLUMNS = `p.id, p.agent_id, p.action, p.request, p.amount_cents::float8 as amount_cents, p.scopes, p.status, p.reason,
  p.created_at, p.expires_at, p.decided_at, p.release_expires_at, p.token_hash`

function toPendingView(r: PendingRow): PendingView {
  const request = typeof r.request === 'string' ? JSON.parse(r.request) : r.request
  return {
    id: r.id,
    agentId: r.agent_id,
    agentName: r.agent_name,
    action: r.action,
    amount: Number(r.amount_cents) / 100,
    scopes: r.scopes ?? [],
    params: request?.params ?? null,
    status: r.status,
    reason: r.reason,
    createdAt: iso(r.created_at),
    expiresAt: iso(r.expires_at),
    decidedAt: r.decided_at ? iso(r.decided_at) : null,
    releaseExpiresAt: r.release_expires_at ? iso(r.release_expires_at) : null,
  }
}

async function expireStale(q: Queryable, ownerId: string, actionId?: string) {
  const { rows } = await q.query<{ id: string; agent_id: string; action: string; amount_cents: number }>(
    `update aegis.pending_actions set status = 'expired', reason = 'Not decided before expiry'
      where owner_id = $1 and status = 'pending' and expires_at < now() and ($2::uuid is null or id = $2::uuid)
      returning id, agent_id, action, amount_cents::float8 as amount_cents`,
    [ownerId, actionId ?? null],
  )
  for (const r of rows) {
    await writeLog(q, {
      ownerId,
      agentId: r.agent_id,
      pendingActionId: r.id,
      eventType: 'expire',
      reason: 'Approval request expired without a decision',
      actorType: 'system',
      actorId: 'aegis',
      action: r.action,
      amountCents: Number(r.amount_cents),
    })
  }
}

export async function listApprovals(db: Db, ownerId: string, status: string = 'pending') {
  const allowed = ['pending', 'approved', 'denied', 'expired', 'consumed', 'cancelled', 'all']
  if (!allowed.includes(status)) throw new ValidationError(`status must be one of ${allowed.join(', ')}`)
  return db.tx(ownerId, async q => {
    await expireStale(q, ownerId)
    const { rows } = await q.query<PendingRow>(
      `select ${PENDING_COLUMNS}, a.name as agent_name
         from aegis.pending_actions p join aegis.agents a on a.id = p.agent_id
        where p.owner_id = $1 and ($2 = 'all' or p.status = $2)
        order by p.created_at desc limit 100`,
      [ownerId, status],
    )
    return rows.map(toPendingView)
  })
}

export async function decideApproval(db: Db, ownerId: string, actionId: unknown, approve: unknown) {
  if (typeof actionId !== 'string') throw new ValidationError('actionId is required')
  assertUuid(actionId, 'actionId')
  if (typeof approve !== 'boolean') throw new ValidationError('approve must be true or false')
  return db.tx(ownerId, async q => {
    await expireStale(q, ownerId, actionId)
    const { rows } = await q.query<PendingRow & { agent_status: string }>(
      `select ${PENDING_COLUMNS}, a.status as agent_status
         from aegis.pending_actions p join aegis.agents a on a.id = p.agent_id
        where p.id = $1 and p.owner_id = $2 for update of p`,
      [actionId, ownerId],
    )
    const row = rows[0]
    if (!row) throw new HttpError(404, 'not_found', 'Pending action not found')
    if (row.status !== 'pending') throw new HttpError(409, 'not_pending', `Action is already ${row.status}`)
    if (approve && row.agent_status !== 'active') throw new HttpError(409, 'agent_revoked', 'Agent has been revoked; approval refused')
    const updated = await q.query<PendingRow>(
      `update aegis.pending_actions p
          set status = $2, decided_at = now(), decided_by = $3,
              release_expires_at = case when $2 = 'approved' then now() + make_interval(secs => $4) else null end
        where p.id = $1
        returning ${PENDING_COLUMNS}`,
      [actionId, approve ? 'approved' : 'denied', 'owner:' + ownerId, releaseTtlSeconds()],
    )
    await writeLog(q, {
      ownerId,
      agentId: row.agent_id,
      pendingActionId: actionId,
      eventType: approve ? 'approve' : 'deny',
      decision: approve ? null : 'BLOCKED',
      reason: approve
        ? `Owner approved "${row.action}" (${fmt(Number(row.amount_cents))}); agent may release it once with a single-use token`
        : `Owner denied "${row.action}" (${fmt(Number(row.amount_cents))})`,
      actorType: 'owner',
      actorId: ownerId,
      action: row.action,
      amountCents: Number(row.amount_cents),
    })
    return toPendingView(updated.rows[0])
  })
}

/**
 * Agent-side poll. When the owner has approved, the first poll mints the
 * single-use release token (only its hash is stored) and returns it once.
 */
export async function getActionForAgent(db: Db, auth: AgentAuth, actionId: string) {
  assertUuid(actionId, 'actionId')
  return db.tx(auth.ownerId, async q => {
    const agent = await q.query<{ status: string }>('select status from aegis.agents where id = $1', [auth.agentId])
    if (agent.rows[0]?.status !== 'active') throw new HttpError(403, 'agent_revoked', 'Agent access revoked by owner')
    await expireStale(q, auth.ownerId, actionId)
    const { rows } = await q.query<PendingRow & { release_expired: boolean }>(
      `select ${PENDING_COLUMNS}, (p.release_expires_at is not null and p.release_expires_at < now()) as release_expired
         from aegis.pending_actions p where p.id = $1 and p.agent_id = $2 for update`,
      [actionId, auth.agentId],
    )
    const row = rows[0]
    if (!row) throw new HttpError(404, 'not_found', 'Pending action not found for this agent')
    const view = toPendingView(row)
    if (row.status === 'approved' && row.release_expired) {
      await q.query("update aegis.pending_actions set status = 'expired', reason = 'Approved but not released in time' where id = $1", [row.id])
      return { ...view, status: 'expired' }
    }
    if (row.status === 'approved' && !row.token_hash) {
      const token = generateSecret('approval')
      await q.query('update aegis.pending_actions set token_hash = $2, token_issued_at = now() where id = $1', [row.id, token.hash])
      return { ...view, approvalToken: token.secret, tokenIssued: true }
    }
    return { ...view, tokenIssued: Boolean(row.token_hash) }
  })
}

// ------------------------------------------------------------------ decision log

export async function listDecisions(db: Db, ownerId: string, opts: { limit?: number; agentId?: string | null } = {}) {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 200)
  if (opts.agentId) assertUuid(opts.agentId, 'agentId')
  return db.tx(ownerId, async q => {
    const { rows } = await q.query<{
      id: string
      agent_id: string | null
      agent_name: string | null
      pending_action_id: string | null
      event_type: string
      decision: Decision | null
      reason: string
      actor_type: string
      actor_id: string
      action: string | null
      amount_cents: number | null
      payload_hash: string | null
      created_at: Date
    }>(
      `select d.id::text as id, d.agent_id, a.name as agent_name, d.pending_action_id, d.event_type, d.decision, d.reason,
              d.actor_type, d.actor_id, d.action, d.amount_cents::float8 as amount_cents, d.payload_hash, d.created_at
         from aegis.decision_log d left join aegis.agents a on a.id = d.agent_id
        where d.owner_id = $1 and ($2::uuid is null or d.agent_id = $2::uuid)
        order by d.id desc limit $3`,
      [ownerId, opts.agentId ?? null, limit],
    )
    return rows.map(r => ({
      id: r.id,
      agentId: r.agent_id,
      agentName: r.agent_name,
      pendingActionId: r.pending_action_id,
      eventType: r.event_type,
      decision: r.decision,
      reason: r.reason,
      actorType: r.actor_type,
      actorId: r.actor_id,
      action: r.action,
      amount: r.amount_cents === null ? null : Number(r.amount_cents) / 100,
      payloadHash: r.payload_hash,
      createdAt: iso(r.created_at),
    }))
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function assertUuid(value: string, field: string) {
  if (!UUID_RE.test(value)) throw new ValidationError(`${field} must be a UUID`)
}
