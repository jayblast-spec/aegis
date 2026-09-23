# Aegis Enforcement Backend API

## Overview

Aegis provides a production-grade enforcement backend for AI agent governance. Unlike sandbox demos, this is **real policy enforcement** that agents use to verify compliance before taking actions.

Live at: `https://aegis-mauve-one.vercel.app`

## Quick Start

### 1. Set a Policy

Configure spending caps, approval thresholds, and scope permissions for an agent:

```bash
curl -X POST https://aegis-mauve-one.vercel.app/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "agentId": "your-agent-id",
    "policy": {
      "spendingCap": 100,
      "approvalThreshold": 50,
      "allowedScopes": ["read", "write", "query"]
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Policy stored for agent your-agent-id",
  "policy": {
    "spendingCap": 100,
    "approvalThreshold": 50,
    "allowedScopes": ["read", "write", "query"],
    "updatedAt": "2026-09-23T00:02:13.426Z"
  }
}
```

### 2. Enforce an Action

Before performing any action, an agent checks if it's permitted:

```bash
curl -X POST https://aegis-mauve-one.vercel.app/api/enforce \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "agentId": "your-agent-id",
    "action": "run_query",
    "cost": 25,
    "scopes": ["read", "query"]
  }'
```

**Possible Responses:**

#### ✅ Action Allowed (200)
```json
{
  "allowed": true,
  "reason": "Within policy limits",
  "decision": {
    "timestamp": "2026-09-23T00:02:13.705Z",
    "agentId": "your-agent-id",
    "action": "run_query",
    "decision": "ALLOWED"
  }
}
```

#### ⚠️ Requires Approval (202)
```json
{
  "allowed": false,
  "requiresApproval": true,
  "reason": "Cost $75 exceeds approval threshold $50. Human approval required.",
  "decision": {
    "timestamp": "2026-09-23T00:02:13.924Z",
    "agentId": "your-agent-id",
    "action": "write_data",
    "decision": "REQUIRES_APPROVAL"
  }
}
```

#### ❌ Action Blocked (403)
```json
{
  "allowed": false,
  "reason": "Cost $150 exceeds spending cap $100",
  "decision": {
    "timestamp": "2026-09-23T00:02:13.924Z",
    "agentId": "your-agent-id",
    "action": "expensive_operation",
    "decision": "BLOCKED"
  }
}
```

### 3. Retrieve Existing Policies

```bash
# Get all policies for a user
curl "https://aegis-mauve-one.vercel.app/api/policies?userId=your-user-id"

# Get specific agent policy
curl "https://aegis-mauve-one.vercel.app/api/policies?userId=your-user-id&agentId=your-agent-id"
```

## Policy Configuration

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `spendingCap` | number | Maximum total cost per day (blocks actions exceeding this) |
| `approvalThreshold` | number | Cost requiring human approval (blocks pending approval) |
| `allowedScopes` | string[] | List of permitted scopes (blocks unlisted scopes) |

### Example Presets

#### Read-Only Agent
```json
{
  "spendingCap": 0,
  "approvalThreshold": 0,
  "allowedScopes": ["read"]
}
```

#### Productivity Agent
```json
{
  "spendingCap": 100,
  "approvalThreshold": 50,
  "allowedScopes": ["read", "write", "query"]
}
```

#### Financial Operations Agent
```json
{
  "spendingCap": 500,
  "approvalThreshold": 250,
  "allowedScopes": ["read", "write", "query", "transfer", "payment"]
}
```

#### Unrestricted Agent
```json
{
  "spendingCap": 10000,
  "approvalThreshold": 5000,
  "allowedScopes": ["read", "write", "query", "transfer", "payment", "admin"]
}
```

## Enforcement Rules

The enforcement engine checks in this order:

1. **Spending Cap** — if `cost > spendingCap`, returns `BLOCKED` with 403
2. **Scope Isolation** — if requested scopes not in `allowedScopes`, returns `BLOCKED` with 403
3. **Approval Threshold** — if `cost > approvalThreshold`, returns `REQUIRES_APPROVAL` with 202
4. **Otherwise** — returns `ALLOWED` with 200

## JavaScript SDK

Use the included SDK to integrate enforcement into your agents:

```typescript
import { createAegisAgent } from '@/lib/aegisSDK'

// Create an agent with governance
const agent = createAegisAgent('user-id', 'agent-id')

// Set policy once
await agent.setPolicy({
  spendingCap: 100,
  approvalThreshold: 50,
  allowedScopes: ['read', 'write', 'query'],
})

// Check every action before executing
const check = await agent.enforce({
  action: 'expensive_operation',
  cost: 75,
  scopes: ['write'],
})

if (check.allowed) {
  // Perform the action
} else if (check.requiresApproval) {
  // Queue for human approval
} else {
  // Reject action, return error to user
  throw new Error(`Action blocked: ${check.reason}`)
}
```

## Testing

Visit the interactive test suite: https://aegis-mauve-one.vercel.app/test

The test page demonstrates:
- Setting policies
- Enforcing allowed actions
- Enforcing actions requiring approval
- Enforcing blocked actions
- Checking scope isolation

## Production Deployment

To connect to a real database (Supabase, PostgreSQL, etc.):

1. Replace the in-memory store in `lib/policyStore.ts` with your database
2. Update `app/api/policies/route.ts` to use your database queries
3. Update `app/api/enforce/route.ts` to fetch policies from your database
4. Deploy with your database credentials in environment variables

## Kill Switch

To immediately revoke an agent's access:

1. Delete the agent's policy via `DELETE /api/policies`
2. Or set `spendingCap: 0` and `allowedScopes: []` on the policy

## Compliance & Audit

Every enforcement decision is logged with:
- Timestamp (ISO 8601)
- User ID and Agent ID
- Action requested
- Decision (ALLOWED / BLOCKED / REQUIRES_APPROVAL)
- Reason
- Policy that applied

Use these logs for compliance reporting, incident investigation, and agent behavior analysis.

## Next Steps

### Immediate Production Roadmap

1. **Database Persistence** — Replace in-memory store with Supabase for multi-server deployment
2. **Auth0 Token Vault Integration** — Secure token storage and rotation
3. **Approval Workflows** — Human-in-the-loop for threshold-triggered actions
4. **Audit Dashboard** — Real-time compliance monitoring
5. **SDK Packages** — NPM, PyPI, Go packages for agent frameworks
6. **Cost Tracking** — Actual spending against policies, not just limits

### Framework Integrations

- **LangChain** — Built-in policy enforcement for chains
- **AutoGen** — Agent group governance
- **OpenAI Functions** — Function call validation
- **Anthropic Batch API** — Cost forecasting and approval

### Marketplace

- Pre-built policies for common frameworks
- Audit trail analytics
- Cost forecasting models
- Cross-agent resource allocation
