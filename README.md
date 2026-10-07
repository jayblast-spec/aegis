<div align="center">

# Aegis

### A Portable Trust and Delegation Layer for AI Agents

*Part of ArkNet: continuity infrastructure for institutions, communities, and critical systems — governed digital intelligence, protected knowledge, modular infrastructure, resilient operations, and long-horizon Earth → Maritime → Orbital systems. Proactive survival before catastrophe.*

Aegis explores one premise: as AI agents gain the ability to read, decide, and act across a person's digital life, their authority should stay visible, bounded, portable, and revocable by the person they represent. Today it is a working prototype — a policy-check API, a signed-in delegation dashboard, and one real OAuth connector whose revoke button invalidates the token at the provider.

<p>
  <a href="https://aegis-mauve-one.vercel.app"><img alt="Live Demo" src="https://img.shields.io/badge/Live-Demo-1D4ED8?style=for-the-badge&logo=vercel&logoColor=white"></a>
  <a href="https://github.com/jayblast-spec/aegis"><img alt="GitHub Repo" src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white"></a>
</p>

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js%2015-App%20Router-000000?style=flat-square&logo=next.js&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React%2018-149ECA?style=flat-square&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS-3ECF8E?style=flat-square&logo=supabase&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white">
  <img alt="Framer Motion" src="https://img.shields.io/badge/Framer%20Motion-1D4ED8?style=flat-square&logo=framer&logoColor=white">
</p>

<p>
  <img alt="Animated Aegis headline" src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=18&duration=2600&pause=650&color=1D4ED8&center=true&vCenter=true&width=760&lines=Delegate+%E2%86%92+Bound+%E2%86%92+Review+%E2%86%92+Revoke;Spending+cap%2C+scope+isolation%2C+approval+threshold;Real+OAuth+revoke+against+the+provider;Working+prototype%2C+not+yet+a+security+control">
</p>

</div>

## What It Does

Aegis gives a person one place to define what an AI agent may do on their behalf and to take that authority back. The repository contains:

1. **A policy-check API** (`/api/policies`, `/api/enforce`) that answers "may this agent take this action?" using three rules in order: spending cap → scope isolation → approval threshold. It returns `200 ALLOWED`, `202 REQUIRES_APPROVAL`, or `403 BLOCKED`, each with a reason and timestamp. A TypeScript client lives in `lib/aegisSDK.ts`.
2. **A policy sandbox** on the landing page: pick an agent, set a spending limit, toggle scopes, set an approval threshold, then fire standard / financial / malicious sample actions through the API and watch the decisions in a live log.
3. **Signed-in delegations** (Supabase magic-link auth): save a delegation to your account, revoke it, and keep a revocation event history. Rows are protected by row-level security.
4. **A real Google connector** (Gmail, read-only scope): connect through Google's own OAuth flow; the revoke button calls Google's revoke endpoint so the token is invalidated at the source, not just flagged in a database.
5. **A `/compare` hub** with sourced comparisons against adjacent platforms (Auth0 for AI Agents, Permit.io, Cerbos, Descope, Oso).

**Stage:** working prototype. The policy-check API keeps policies in server memory (reset on redeploy, not shared across serverless instances), and its "audit trail" is server console output only. Not secure enough for real delegation of money, secrets, health, or legal decisions.

## Autonomy and Human Control

Aegis does not run agents; it is the checkpoint an agent is supposed to call before acting. What that checkpoint enforces today, honestly:

- **Works:** spending caps and scope isolation are enforced by the API — over-limit or out-of-scope requests are blocked. Actions above the approval threshold are returned as `REQUIRES_APPROVAL` rather than allowed.
- **Works:** revoking a signed-in delegation persists to your account, and revoking the Google connection invalidates the token with Google.
- **Not yet enforced:** an approval decision is recorded (`/api/approvals`) but does not resume, execute, or unblock the held action, and the enforcement API never reads it. The person approves in the UI; nothing downstream consumes that approval yet.
- **Not yet enforced:** the policy API is unauthenticated — any caller can set or read the policy for any `userId`. It also does not check the signed-in delegation status, so revoking a delegation in the dashboard does not change what `/api/enforce` returns.
- **Not yet enforced:** for signed-out visitors, the sandbox kill switch only disables the demo buttons in that browser tab.
- **Compliance with Aegis is voluntary:** an agent that never calls `/api/enforce` is not stopped. Runtime interception in front of tool calls is on the roadmap, not built.

## How It Works

- `app/api/policies/route.ts` and `lib/policyStore.ts` — store and read per-user, per-agent policies (in memory).
- `app/api/enforce/route.ts` — the three-rule decision function and HTTP status mapping.
- `app/api/approvals/route.ts` — records approve/deny decisions (in memory).
- `app/api/oauth/exchange` and `app/api/oauth/revoke` — exchange the Google auth code, record the delegation and connection under the caller's own Supabase session (no service-role key), and revoke via Google's endpoint. Adding a provider is one entry in `lib/oauthProviders.ts`.
- `app/page.tsx` — landing page, policy sandbox, signed-in delegation dashboard, and connector panel.
- `app/test/page.tsx` — interactive page for exercising the enforcement rules.
- `app/compare` and `lib/compare.ts` — the comparison hub with per-page metadata and structured data.
- See `ENFORCEMENT_API.md` for request/response details.

## Engineering Notes

**The real problem:** a "kill switch" that only flips a flag in the delegating app is theater — the agent still holds a working credential.

**The approach:** for the Google connector, revoke calls the provider's own OAuth revoke endpoint with the stored refresh (or access) token, and the database update records whether the provider confirmed it, so a failed upstream revoke is visible instead of silently reported as success.

**One real number:** enforcement short-circuits in a fixed order — spending cap, then scope, then approval threshold — so under a $100 cap a $450 out-of-scope transfer is reported as a cap violation (`403`), never as "needs approval."

**Not handled yet:** authenticated policy API, persistent policy and decision storage, approvals that actually release held actions, linking dashboard revocation to enforcement, encrypting stored OAuth tokens at the application layer (today they sit in RLS-protected columns), signed action receipts, and verified agent identity.

## Using the API

Set a policy for an agent:

```bash
curl -X POST https://aegis-mauve-one.vercel.app/api/policies \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-123","agentId":"agent-001","policy":{"spendingCap":100,"approvalThreshold":50,"allowedScopes":["read","write","query"]}}'
```

Check an action:

```bash
curl -X POST https://aegis-mauve-one.vercel.app/api/enforce \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-123","agentId":"agent-001","action":"query_database","cost":25,"scopes":["read","query"]}'
```

Because policies live in memory, a policy set on one serverless instance may not be visible to the next request; use local development for repeatable testing.

## Local Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

Signed-in features need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the Google connector also needs `GOOGLE_CLIENT_SECRET`.

## Architecture Direction

1. User-held keys and passkey-backed identity
2. Short-lived, scoped delegation capabilities
3. A human-readable policy grammar
4. Runtime enforcement in front of agent and tool calls
5. Signed action receipts with revocation and dispute paths
6. A model-neutral SDK for agents, MCP servers, and services

Aegis sits beside — not in place of — developer-facing authorization platforms. Its focus is the human-facing authority interface: making delegation understandable to the person whose life an agent acts within. Vendor names on the site are conceptual references, never claims of partnership or integration. App Store / Google Play links are marked "coming soon."

## Live

[aegis-mauve-one.vercel.app](https://aegis-mauve-one.vercel.app)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 18, TypeScript, Tailwind CSS 3 |
| Motion | Framer Motion |
| Auth & data | Supabase (magic-link auth, Postgres with RLS) |
| Policy API store | In-memory (prototype) |
| Connectors | Google OAuth 2.0 (Gmail read-only) |
| Deployment | Vercel |

## License

Proprietary. All rights reserved.

<p align="center">
  <img alt="ArkNet Digital footer" src="https://capsule-render.vercel.app/api?type=waving&height=120&color=0:1D4ED8,55:0B1E3D,100:020617&section=footer&text=ArkNet%20Digital&fontColor=FFFFFF&fontSize=24&fontAlign=50&fontAlignY=65&desc=michael@arknet.digital&descAlign=50&descAlignY=85">
</p>
