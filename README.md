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

- A fully interactive policy sandbox: pick an agent, set a daily spending limit, toggle scope isolation, set a mandatory-approval threshold, then run sample actions (standard / financial / malicious) and watch them get allowed, suspended for approval, or blocked live — all client-side, nothing simulated ahead of time
- A visible, timestamped action log and a one-click kill switch that locks the sandbox down
- The original delegation-card dashboard: create and persist local cards, set approval modes and hard limits, approve/block sample actions, pause all agents, revoke a single mandate
- A researched `/compare` hub with per-page metadata, Open Graph tags, and Product/FAQPage/BreadcrumbList structured data
- Responsive desktop and mobile UI throughout

## What this is not — yet

This repository does **not** currently provide production security controls. It does not implement cryptographic signing, secure key storage, verified agent identity, backend persistence, runtime enforcement, immutable audit logs, SOC2/ISO 27001/NIST AI RMF compliance, or live connections to OpenAI, Google, Apple, Meta, Stripe, Plaid, or any other third-party platform. There is no registered company behind this project and no mobile app yet (App Store / Google Play links on the site are explicitly marked "coming soon").

Every vendor name or logo shown is a conceptual reference for the kind of platform this model is designed to eventually sit in front of — never a claim of partnership, integration, or endorsement.

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
