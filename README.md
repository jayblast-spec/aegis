# Aegis

> The personal authority layer for AI agents.

Aegis explores a simple premise: as AI agents gain the ability to read, decide, and act across a person’s digital life, authority should remain visible, bounded, portable, and revocable by the person they represent.

The current application is a polished local prototype of that experience. It lets a user create a delegation card, define a task and hard limit, choose an approval mode, review an action ledger, pause all mandates, and revoke a specific agent’s authority.

## The product thesis

Models will compete on intelligence. Aegis is intended to become the neutral authority layer that lets people use many models and services without surrendering control to any one of them.

An eventual Aegis mandate would answer:

- Who is the agent acting for?
- What information may it access?
- Which actions may it take?
- What requires fresh human approval?
- When does its authority expire?
- How can the person revoke or review what happened?

## What works today

- Create and persist local delegation cards
- Set approval modes and hard limits
- Review, approve, or block sample actions
- Pause all agents or revoke a single mandate
- Browse a researched comparison hub for adjacent authorization platforms
- Responsive desktop and mobile UI

## What this is not—yet

This repository does **not** currently provide production security controls. It does not implement cryptographic signing, secure key storage, verified agent identity, backend persistence, runtime enforcement, immutable audit logs, or live connections to OpenAI, Anthropic, Google, Meta, or third-party apps.

The model ecosystem diagram is a product-architecture vision, not a claim of endorsement, partnership, or current integration.

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

## Architecture direction

The production path is deliberately more rigorous than the prototype:

1. User-held keys and passkey-backed identity
2. Short-lived, scoped delegation capabilities
3. A human-readable policy grammar
4. Runtime enforcement in front of agent and tool calls
5. Signed action receipts with revocation and dispute paths
6. A model-neutral SDK for agents, MCP servers, and services

## Market context

Aegis sits beside—not in place of—identity and authorization platforms such as Auth0 for AI Agents, Permit.io, Cerbos, Descope, and Oso. Those platforms serve developer and enterprise enforcement needs. Aegis focuses on the missing human-facing authority interface: making delegation understandable to the individual whose life an agent is acting within.

## Status

Early product prototype. Do not use for secrets, money movement, health, legal decisions, or any high-impact action.

## License

Proprietary. All rights reserved.
