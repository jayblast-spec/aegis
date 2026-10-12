<div align="center">

# Aegis

### A Portable Trust and Delegation Layer for AI Agents

*Part of ArkNet: continuity infrastructure for institutions, communities, and critical systems — governed digital intelligence, protected knowledge, modular infrastructure, resilient operations, and long-horizon Earth → Maritime → Orbital systems. Proactive survival before catastrophe.*

Aegis explores one premise: as AI agents gain the ability to read, decide, and act across a person's digital life, their authority should stay visible, bounded, portable, and revocable by the person they represent. Today it is an early build: a person sets limits once, and an authenticated enforcement API answers allowed, held for human approval, or blocked for every agent action, with one-click revoke and a durable decision log.

<p>
  <a href="https://aegistrust.digital"><img alt="Live Demo" src="https://img.shields.io/badge/Live-Demo-1D4ED8?style=for-the-badge&logo=vercel&logoColor=white"></a>
  <a href="https://github.com/jayblast-spec/aegis"><img alt="GitHub Repo" src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white"></a>
</p>

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js%2015-App%20Router-000000?style=flat-square&logo=next.js&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React%2018-149ECA?style=flat-square&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Postgres" src="https://img.shields.io/badge/Postgres-RLS%20%2B%20append--only%20log-3ECF8E?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white">
  <img alt="Framer Motion" src="https://img.shields.io/badge/Framer%20Motion-1D4ED8?style=flat-square&logo=framer&logoColor=white">
</p>

<p>
  <img alt="Animated Aegis headline" src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=18&duration=2600&pause=650&color=1D4ED8&center=true&vCenter=true&width=760&lines=Delegate+%E2%86%92+Bound+%E2%86%92+Approve+%E2%86%92+Revoke;Allowed+%C2%B7+Held+for+approval+%C2%B7+Blocked;Single-use+approvals%2C+append-only+decision+log;Early+build%2C+not+externally+audited">
</p>

</div>

## What It Does

A person sets limits for each AI agent once: a per-action spending cap, a rolling-window spending cap, the scopes it may use, and when an action needs their approval. Each agent gets its own API key and calls `POST /api/enforce` before acting. Aegis answers:

- `200 ALLOWED`: within every limit; the spend is recorded against the rolling window.
- `202 REQUIRES_APPROVAL`: held. A pending action is queued for the owner and expires if nobody decides.
- `403 BLOCKED`: over a cap, outside the allowed scopes, no policy set (fail closed), or the agent was revoked.

The owner approves or denies held actions in the [owner console](https://aegistrust.digital/console) or through the API. Approval does not unblock anything by itself: the agent polls the held action, receives a single-use token bound to the SHA-256 hash of that exact request, and resubmits the identical request with the token. A different amount, recipient, scope set or agent is refused, and a second use of the token is refused. One click revokes an agent's key (or all of an owner's agents) and the very next enforcement call is blocked. Every decision, approval, denial, expiry and revoke is written to an append-only decision log with the actor and a server timestamp.

The repository also contains:

1. **The landing-page sandbox**, rewired to the real API. On first use it creates a throwaway owner account for the browser and one agent key per sample agent; the kill switch revokes those keys on the server.
2. **`/console`**: owner account, agent registration (keys shown once), policy editor, approval queue, revoke and kill switch, and the decision log.
3. **`/test`**: a live self-test that walks the full lifecycle against the deployment and reports pass/fail per step.
4. **A `/compare` hub** with sourced comparisons against adjacent platforms (Auth0 for AI Agents, Permit.io, Cerbos, Descope, Oso).

**Stage:** early build. Not externally audited or penetration-tested. Do not use it to guard real money, credentials, health or legal decisions yet.

## Autonomy and Human Control

Aegis does not run agents and does not sit in their network path; it is the checkpoint an agent calls before acting. What is enforced today:

- **Enforced:** policy writes, approvals, revokes and log reads require the owner's key; an owner can only see or change their own agents (checked in the service layer and again by Postgres row-level security).
- **Enforced:** `/api/enforce` requires a per-agent key, stored only as a hash, and is scoped to the agent's owner.
- **Enforced:** per-action cap, scope allow-list and a rolling-window cap (default 24 hours) so a large action split into small ones is still stopped. Decisions for one agent are serialised with a database lock, so parallel requests cannot race past the window.
- **Enforced:** held actions expire (15 minutes by default); an approval must be released within 10 minutes and only once.
- **Enforced:** revoke cancels the agent's open approvals and blocks it immediately, including any approval token it already holds.
- **Not enforced:** an agent that never calls Aegis, or ignores a `403`, is not stopped. Aegis can only bind agents whose runtime or tool layer is wired to call it.
- **Not yet built:** signed (cryptographically verifiable) receipts, external anchoring of the log, verified agent identity beyond the API key, per-key rate limiting of `/api/enforce`, and passkey or email login for owners (owner auth is a bearer key).

## How It Works

- `lib/server/policy.ts`: input validation and the pure decision function (per-action cap → scopes → rolling window → approval).
- `lib/server/service.ts`: every operation runs in one Postgres transaction with the owner's id set for row-level security, takes a per-agent advisory lock where limits matter, and writes its decision-log row in the same transaction.
- `lib/server/crypto.ts`: 256-bit typed secrets (`aeg_own_`, `aeg_agt_`, `aeg_apv_`), SHA-256 hashing, canonical JSON and the action payload hash.
- `supabase/migrations/…_aegis_enforcement.sql`: the `aegis` schema. The app connects as a dedicated `aegis_app` role that can reach only this schema, cannot bypass RLS, and has no update or delete privilege on the decision log; a trigger also rejects updates, deletes and truncates on it for every role.
- `app/api/*`: thin route handlers (`owners`, `agents`, `agents/[id]/revoke`, `agents/revoke-all`, `policies`, `enforce`, `actions/[id]`, `approvals`, `decisions`).
- `lib/aegisSDK.ts`: typed client (`AegisOwner`, `AegisAgent`, including `waitAndRelease`).
- `app/api/oauth/*`, `app/oauth/callback`: the earlier Google (Gmail read-only) connector. It depends on the original Aegis Supabase project, which is currently paused, so it is offline and no longer linked from the landing page.

Full request and response details: [ENFORCEMENT_API.md](ENFORCEMENT_API.md).

## Engineering Notes

**The real problem:** a "kill switch" or "approval" that only changes a flag in the delegating UI is theater; the agent still holds a working credential, and an approved action can be swapped for a different one.

**The approach:** decisions are made server-side against durable state, the agent's own key is what gets revoked, and an approval is a single-use token bound to the hash of one exact request. The atomic `approved → consumed` update makes double-release impossible even under concurrent requests.

**One real number:** with a $100 approval threshold and a $200 rolling cap, three $90 transfers return `200, 200, 403`; the third is stopped by the window even though each one alone is under every per-action limit.

## Testing

```bash
npm test          # vitest: unit tests + integration tests
npm run lint
npm run typecheck
npm run build
```

Integration tests run the real route handlers against real Postgres (PGlite, in-process) with the production migration applied, as the restricted `aegis_app` role. They cover: unauthenticated, wrong-key-type and cross-owner policy writes rejected; enforce requires an agent key and fails closed without a policy; allowed / held / blocked status codes; rolling-window task-splitting; approval releases only the exact matching action; substitution and replay rejected; denied and expired actions can't be released; revoke blocks immediately and kills issued tokens; kill switch scope; decision-log completeness; the log is append-only for the app role and superusers; RLS hides other owners' rows; owner sign-up rate limit. PGlite is a single connection, so the concurrency test there is serialised; in production the per-agent advisory lock provides that guarantee.

## Using the API

```bash
BASE=https://aegistrust.digital

# 1. Owner account (the key is shown once)
curl -s -X POST $BASE/api/owners -H 'Content-Type: application/json' -d '{"label":"me"}'
# 2. Register an agent with the owner key (agent key shown once)
curl -s -X POST $BASE/api/agents -H "Authorization: Bearer $OWNER_KEY" -H 'Content-Type: application/json' -d '{"name":"billing-agent"}'
# 3. Set its limits
curl -s -X PUT $BASE/api/policies -H "Authorization: Bearer $OWNER_KEY" -H 'Content-Type: application/json' \
  -d '{"agentId":"'$AGENT_ID'","policy":{"perActionCap":500,"windowCap":600,"windowSeconds":86400,"approvalThreshold":100,"allowedScopes":["payments","read"]}}'
# 4. The agent asks before acting
curl -s -X POST $BASE/api/enforce -H "Authorization: Bearer $AGENT_KEY" -H 'Content-Type: application/json' \
  -d '{"action":"pay_invoice","cost":450,"scopes":["payments"],"params":{"invoice":"INV-1"}}'
```

## Local Development

```bash
npm install
npm run dev
```

The enforcement API needs `AEGIS_DATABASE_URL`: a Postgres connection string for the `aegis_app` role after applying the migration in `supabase/migrations/`. Optional: `AEGIS_PENDING_TTL_SECONDS` (default 900), `AEGIS_RELEASE_TTL_SECONDS` (600), `AEGIS_OWNER_SIGNUPS_PER_HOUR` (10 per network), `AEGIS_IP_SALT`, and `AEGIS_DATABASE_CA` (the PEM of your Postgres provider's root CA, needed for Supabase's pooler so TLS verification stays on). Without a database the API returns `503 not_configured`; it never falls back to in-memory state.

Set `AEGIS_IP_SALT` to a long random value in any deployment. It salts the hash stored in place of client IP addresses; without it a fixed development default is used.

## Architecture Direction

1. User-held keys and passkey-backed identity
2. Short-lived, scoped delegation capabilities
3. A human-readable policy grammar
4. Runtime enforcement in front of agent and tool calls
5. Signed action receipts with revocation and dispute paths
6. A model-neutral SDK for agents, MCP servers, and services

Aegis sits beside — not in place of — developer-facing authorization platforms. Its focus is the human-facing authority interface: making delegation understandable to the person whose life an agent acts within. Vendor names on the site are conceptual references, never claims of partnership or integration. App Store / Google Play links are marked "coming soon."

## Live

[aegistrust.digital](https://aegistrust.digital) · [owner console](https://aegistrust.digital/console) · [self-test](https://aegistrust.digital/test)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 18, TypeScript, Tailwind CSS 3 |
| Motion | Framer Motion |
| Enforcement store | Postgres (migration written for Supabase), `aegis` schema, RLS, append-only log, dedicated least-privilege role |
| Server data access | node-postgres, one transaction per request |
| Tests | Vitest + PGlite (real Postgres in-process) |
| Legacy connector | Google OAuth 2.0 (Gmail read-only), offline |
| Deployment | Vercel |

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The licence covers the code in this repository. It does not grant rights to the Aegis or ArkNet Digital names and marks.

<p align="center">
  <img alt="ArkNet Digital footer" src="https://capsule-render.vercel.app/api?type=waving&height=120&color=0:1D4ED8,55:0B1E3D,100:020617&section=footer&text=ArkNet%20Digital&fontColor=FFFFFF&fontSize=24&fontAlign=50&fontAlignY=65&desc=michael@arknet.digital&descAlign=50&descAlignY=85">
</p>
