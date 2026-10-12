# Aegis Enforcement API

## Overview

An owner sets limits for each agent once. Each agent authenticates with its own API key and calls `POST /api/enforce` before acting; the answer is `ALLOWED`, `REQUIRES_APPROVAL` (held for the owner) or `BLOCKED`. Approvals release exactly one matching action, revoke takes effect on the next call, and every decision lands in an append-only log.

**Stage:** early build. Not externally audited. Aegis is a checkpoint, not an interceptor: an agent that never calls it, or ignores a `403`, is not stopped.

Base URL: `https://aegistrust.digital`. All bodies are JSON (max 16 KB). All responses carry `Cache-Control: no-store`. Errors are `{ "error": string, "code": string }`.

## Authentication

| Key | Prefix | Used for | Storage |
|---|---|---|---|
| Owner key | `aeg_own_` | policies, agents, approvals, revoke, decision log | SHA-256 hash only |
| Agent key | `aeg_agt_` | `/api/enforce`, `/api/actions/:id` | SHA-256 hash only |
| Approval token | `aeg_apv_` | releasing one approved action, once | SHA-256 hash only |

Send keys as `Authorization: Bearer <key>`. Keys are 256-bit random values and are shown exactly once. A wrong, unknown or wrong-type key returns `401`.

## Endpoints

### `POST /api/owners` (no auth)

Creates an owner account. Rate-limited per network (10 per hour by default).

```json
{ "label": "me" }
```
`201 { "ownerId": "uuid", "ownerKey": "aeg_own_…", "label": "me" }` · `429 rate_limited`

### `POST /api/agents` (owner) · `GET /api/agents` (owner)

`POST { "name": "billing-agent" }` → `201 { "agent": {…}, "agentKey": "aeg_agt_…" }`. `GET` lists the owner's agents with status and policy.

### `PUT /api/policies` (owner; `POST` is an alias)

```json
{
  "agentId": "uuid",
  "policy": {
    "perActionCap": 500,
    "windowCap": 600,
    "windowSeconds": 86400,
    "approvalThreshold": 100,
    "alwaysRequireApproval": false,
    "allowedScopes": ["payments", "read"]
  }
}
```

| Field | Meaning | Default |
|---|---|---|
| `perActionCap` | Max cost of one action, in dollars (`spendingCap` accepted as an alias) | required |
| `windowCap` | Max total allowed + released spend within the rolling window | `perActionCap` |
| `windowSeconds` | Rolling window length, 60 to 2,592,000 | `86400` |
| `approvalThreshold` | Actions costing more than this are held; `null` = never | `null` |
| `alwaysRequireApproval` | Hold every action | `false` |
| `allowedScopes` | Allow-list; any other requested scope is blocked | `[]` |

`200 { "agentId", "policy" }`. `404` if the agent does not belong to the caller. `GET /api/policies?agentId=…` reads one; without `agentId` it lists all of the owner's.

### `POST /api/enforce` (agent)

```json
{ "action": "pay_invoice", "cost": 450, "scopes": ["payments"], "params": { "invoice": "INV-1" } }
```

`params` is optional free-form JSON (max 8 KB) describing the exact action; it is part of the payload hash.

Decision order: agent revoked → no policy (fail closed) → per-action cap → scopes → rolling window → approval rule.

| Status | Decision | Body extras |
|---|---|---|
| `200` | `ALLOWED` | `released: true` when an approval token was consumed |
| `202` | `REQUIRES_APPROVAL` | `pendingActionId`, `expiresAt` |
| `403` | `BLOCKED` | `reason` explains which rule |

```json
{
  "allowed": false,
  "requiresApproval": true,
  "reason": "Cost $450.00 exceeds approval threshold $100.00. Human approval required.",
  "pendingActionId": "uuid",
  "expiresAt": "2026-10-07T19:15:00.000Z",
  "logId": "42",
  "decision": { "timestamp": "…", "agentId": "uuid", "action": "pay_invoice", "decision": "REQUIRES_APPROVAL" }
}
```

To release an approved action, send the **identical** request plus `"approvalToken": "aeg_apv_…"`. The server checks the token belongs to this agent, the action is approved and not expired, the request hash matches, and the hard limits (caps, scopes, window) still hold; then it atomically marks the action consumed. A mismatched payload is refused without consuming the token; a second use is refused as a replay.

### `GET /api/actions/:id` (agent)

Poll a held action. Status is one of `pending`, `approved`, `denied`, `expired`, `consumed`, `cancelled`. The first poll after approval returns `approvalToken` once; later polls return `tokenIssued: true` without it. Revoked agents get `403`.

### `GET /api/approvals?status=pending` (owner) · `POST /api/approvals` (owner)

`GET` lists held actions (`status` can be any state or `all`). `POST { "actionId": "uuid", "approve": true | false }` decides one. `409` if it is no longer pending, has expired, or the agent was revoked. Held actions expire after 15 minutes; approvals must be released within 10 minutes.

### `POST /api/agents/:id/revoke` (owner) · `POST /api/agents/revoke-all` (owner)

Revokes one agent, or every active agent of the owner (kill switch). The agent's open approvals are cancelled and its next `/api/enforce` call returns `403 BLOCKED`. Revoked keys cannot be reactivated; register a new agent instead.

### `GET /api/decisions?limit=50&agentId=…` (owner)

Newest-first decision log: `eventType` (`enforce`, `release`, `approve`, `deny`, `expire`, `revoke`, `policy_set`, `agent_created`), `decision`, `reason`, `actorType` (`owner`, `agent`, `system`), `actorId`, `action`, `amount`, `payloadHash`, `createdAt`.

## End-to-end with curl

```bash
BASE=https://aegistrust.digital
OWNER_KEY=$(curl -s -X POST $BASE/api/owners -H 'Content-Type: application/json' -d '{}' | jq -r .ownerKey)
AGENT=$(curl -s -X POST $BASE/api/agents -H "Authorization: Bearer $OWNER_KEY" -H 'Content-Type: application/json' -d '{"name":"demo"}')
AGENT_ID=$(echo $AGENT | jq -r .agent.id); AGENT_KEY=$(echo $AGENT | jq -r .agentKey)
curl -s -X PUT $BASE/api/policies -H "Authorization: Bearer $OWNER_KEY" -H 'Content-Type: application/json' \
  -d "{\"agentId\":\"$AGENT_ID\",\"policy\":{\"perActionCap\":500,\"windowCap\":600,\"approvalThreshold\":100,\"allowedScopes\":[\"payments\"]}}"
REQ='{"action":"pay_invoice","cost":450,"scopes":["payments"],"params":{"invoice":"INV-1"}}'
PID=$(curl -s -X POST $BASE/api/enforce -H "Authorization: Bearer $AGENT_KEY" -H 'Content-Type: application/json' -d "$REQ" | jq -r .pendingActionId)
curl -s -X POST $BASE/api/approvals -H "Authorization: Bearer $OWNER_KEY" -H 'Content-Type: application/json' -d "{\"actionId\":\"$PID\",\"approve\":true}"
TOKEN=$(curl -s $BASE/api/actions/$PID -H "Authorization: Bearer $AGENT_KEY" | jq -r .approvalToken)
curl -s -X POST $BASE/api/enforce -H "Authorization: Bearer $AGENT_KEY" -H 'Content-Type: application/json' \
  -d "$(echo $REQ | jq --arg t $TOKEN '. + {approvalToken: $t}')"   # 200 released; repeat → 403 replay
```

## TypeScript SDK

```ts
import { AegisOwner, AegisAgent } from '@/lib/aegisSDK'

const { owner } = await AegisOwner.create('me', 'https://aegistrust.digital')
const { agent, agentKey } = await owner.createAgent('billing-agent')
await owner.setPolicy(agent.id, { perActionCap: 500, windowCap: 600, approvalThreshold: 100, allowedScopes: ['payments'] })

const bot = new AegisAgent(agentKey, 'https://aegistrust.digital')
const req = { action: 'pay_invoice', cost: 450, scopes: ['payments'], params: { invoice: 'INV-1' } }
const res = await bot.enforce(req)
if (res.requiresApproval) await bot.waitAndRelease(req, res.pendingActionId!) // after the owner approves
```

## Data and security model

- Postgres schema `aegis`; the app connects as `aegis_app`, which can reach only that schema, cannot bypass row-level security, and has no `UPDATE`/`DELETE` on the decision log. A trigger rejects updates, deletes and truncates on the log for every role.
- Each request runs in one transaction with `aegis.owner_id` set; RLS policies expose only that owner's rows. Key lookups before an owner is known go through two narrow `SECURITY DEFINER` functions that return ids only.
- Per-agent advisory locks serialise enforce, release and revoke, so concurrent calls cannot overspend the window or release twice.
- The Supabase API roles (`anon`, `authenticated`, `service_role`) have no privileges on the schema, and it is not exposed through PostgREST.

## Not yet

External security audit or penetration test; signed receipts and external anchoring of the log; per-key rate limiting on `/api/enforce`; passkey/email login for owners; key rotation; runtime interception for agents that do not call Aegis.
