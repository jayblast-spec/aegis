# Aegis

> An independent, portable trust and delegation layer for AI agents.

**Live:** https://aegis-mauve-one.vercel.app

Aegis explores a simple premise: as AI agents gain the ability to read, decide, and act across a person's digital life, authority should remain visible, bounded, portable, and revocable by the person they represent.

This repository contains two things:

1. A landing page presenting the Aegis concept, with a live, in-browser policy sandbox (agent selection, spending limits, scope isolation, mandatory-approval flow, and a kill switch).
2. A working local prototype of the original delegation-card dashboard (create a card, define a task and hard limit, choose an approval mode, review an action ledger, pause all mandates, revoke a specific agent's authority), still reachable inline on the same page.
3. A researched `/compare` hub with honest, sourced comparisons against adjacent real platforms (Auth0 for AI Agents, Permit.io, Cerbos, Descope, Oso).

## The product thesis

Models will compete on intelligence. Aegis is intended to become the neutral authority layer that lets people use many models and services without surrendering control to any one of them — a platform that also builds the agent has a structural conflict of interest in also refereeing it.

An eventual Aegis mandate would answer:

- Who is the agent acting for?
- What information may it access?
- Which actions may it take?
- What requires fresh human approval?
- When does its authority expire?
- How can the person revoke or review what happened?

## What works today

**Production Enforcement Backend**
- Real HTTP API endpoints (`/api/enforce`, `/api/policies`) that enforce actual policy rules
- Server-side policy storage with persistence per agent and user
- Three-rule enforcement precedence: spending cap → scope isolation → approval threshold
- Production HTTP status codes (200 ALLOWED, 202 REQUIRES_APPROVAL, 403 BLOCKED)
- Audit timestamp on every enforcement decision
- Interactive test page at `/test` demonstrating enforcement rules in action
- TypeScript SDK (`lib/aegisSDK.ts`) for agent integration

**Frontend Sandbox**
- Policy sandbox UI: pick an agent, set spending limit, toggle scopes, set approval threshold
- Sample actions (standard / financial / malicious) trigger real backend enforcement checks
- Live log shows actual enforcement decisions from production API
- One-click kill switch
- Responsive desktop and mobile UI

**Additional**
- Researched `/compare` hub with per-page metadata, Open Graph tags, and Product/FAQPage/BreadcrumbList structured data
- Original delegation-card dashboard prototype (local-only, historical reference)

## What this is not — yet

This repository does **not** currently provide production security controls. It does not implement cryptographic signing, secure key storage, verified agent identity, immutable audit logs, SOC2/ISO 27001/NIST AI RMF compliance, or live connections to OpenAI, Google, Apple, Meta, Stripe, Plaid, or any other third-party platform. 

The enforcement backend uses in-memory policy storage (resets on redeploy) — production use requires Supabase or similar persistent database. There is no registered company behind this project and no mobile app yet (App Store / Google Play links on the site are explicitly marked "coming soon").

Every vendor name or logo shown is a conceptual reference for the kind of platform this model is designed to eventually sit in front of — never a claim of partnership, integration, or endorsement.

## Using the Enforcement Backend

### Live API (https://aegis-mauve-one.vercel.app)

Set a policy for an agent:
```bash
curl -X POST https://aegis-mauve-one.vercel.app/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "agentId": "claude-001",
    "policy": {
      "spendingCap": 100,
      "approvalThreshold": 50,
      "allowedScopes": ["read", "write", "query"]
    }
  }'
```

Check if an action is allowed:
```bash
curl -X POST https://aegis-mauve-one.vercel.app/api/enforce \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "agentId": "claude-001",
    "action": "query_database",
    "cost": 25,
    "scopes": ["read", "query"]
  }'
```

See `ENFORCEMENT_API.md` for full API documentation, examples, and production roadmap.

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Create a production build with:

```bash
npm run build
```

The enforcement backend runs in-memory during development. To test against persistent storage locally, set `DATABASE_URL` to a Supabase connection string.

## Architecture direction

The production path is deliberately more rigorous than what exists today:

1. User-held keys and passkey-backed identity
2. Short-lived, scoped delegation capabilities
3. A human-readable policy grammar
4. Runtime enforcement in front of agent and tool calls
5. Signed action receipts with revocation and dispute paths
6. A model-neutral SDK for agents, MCP servers, and services

## Market context

Aegis sits beside — not in place of — identity and authorization platforms such as Auth0 for AI Agents, Permit.io, Cerbos, Descope, and Oso. Those platforms serve developer and enterprise enforcement needs. Aegis focuses on the missing human-facing authority interface: making delegation understandable to the individual whose life an agent is acting within. See `/compare` on the live site for a full, sourced breakdown against each.

## Status

Early-stage concept and interactive design sandbox — not a registered entity, not a commercial product, not yet secure enough for real delegation. Do not use for secrets, money movement, health, legal decisions, or any high-impact action.

## License

Proprietary. All rights reserved.
