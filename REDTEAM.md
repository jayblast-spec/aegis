# Aegis Enforcement Red-Team — Round 1

Date: 2026-11-24 · Target: `/api/enforce` (the policy enforcement core) · Method: reproducible
harness (`scripts/redteam-enforce.mjs`) run against a local production build.

This is an honest, self-run red-team of Aegis's own enforcement backend — the public evidence
the funding model is built on. It records what the gateway caught, what it missed, and the fix.

## How to reproduce

```bash
npm install && npm run build
npx next start -p 3517 &
BASE=http://localhost:3517 node scripts/redteam-enforce.mjs
```

The harness sets a policy (cap $100, approval threshold $50, scopes read/write/query), then runs
5 control cases that must behave correctly and 3 attacks. A FAIL means the gateway allowed
something it should not have.

## Findings (before)

5/8 passed. The three failures were real bypasses of the stated policy:

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| 1 | Critical | **Split-action / salami bypass.** The spending cap was checked per action, not per day, with no cumulative tracking. An agent splits one large charge into sub-cap calls and spends without limit. | `$720` allowed across 8 calls under a `$100` cap |
| 2 | Critical | **Negative-cost bypass.** `cost: -500` slips under every `cost > cap` check and is ALLOWED. | `ALLOWED on cost -500` |
| 3 | High | **Non-numeric cost bypass.** A cost that isn't a clean number (`"lots"`) makes the comparison falsy, skipping the cap. | `ALLOWED on cost "lots"` |

Two further weaknesses were found by reading the code and are tracked below rather than closed in
this round:

- **Audit log was not real.** `logDecision` only wrote to `console.log` ("would persist"). The
  "append-only decision log" guarantee did not exist. *(Fixed this round — see below.)*
- **Approvals are not bound to the enforced action.** `/api/approvals` records an approval but
  `/api/enforce` never consumes or verifies one, so the "single-use token tied to a hash of the
  exact request" guarantee (altered-params / replay protection) is **not yet implemented.**
  Specified as Round 2.

## Fixes (this round)

- **Cumulative daily spend** (`lib/policyStore.ts` → `getSpendToday`/`recordSpend`): the cap is now
  a real per-day budget; only ALLOWED actions spend, and the running total is enforced. Closes #1.
- **Strict cost validation** (`lib/enforce.ts` → `validateCost`): cost must be a finite,
  non-negative number; missing = 0; anything else fails closed. Closes #2 and #3.
- **Decision logic extracted to a pure function** (`lib/enforce.ts` → `decide`) so it is unit-testable
  and red-teamable without a server.
- **Real append-only audit log** (`lib/policyStore.ts` → `appendAudit`/`getAudit`, exposed at
  `GET /api/audit`): every decision is recorded with its reason and is retrievable. Replaces the
  console stub.

### Results (after)

```
AFTER: 8 / 8 passed, 0 failed
  PASS control: legit action ALLOWED / over-cap BLOCKED / over-threshold REQUIRES_APPROVAL
  PASS control: unauthorized scope BLOCKED / unknown agent fails closed (403)
  PASS critical: negative cost -500 -> BLOCKED
  PASS high:     non-numeric cost "lots" -> BLOCKED
  PASS critical: split actions capped -> $90 allowed under a $100 cap
```

Audit trail verified live: a legit action and a blocked negative-cost attack both appear in
`GET /api/audit` with timestamps and reasons.

## Known limitations (stated honestly)

- The spend ledger and audit log are in-process, like the policy store. For production they must be
  mirrored to a durable, shared backend (Supabase: an append-only table with no UPDATE/DELETE
  grants for the audit log) so they survive restarts and are consistent across serverless
  instances. Interfaces are in place for that wiring.
## Round 2 — approval binding (done 2026-11-24)

Closes the two weaknesses Round 1 left open. Approvals are now bound to a SHA-256 hash of the exact
request `(userId, agentId, action, validated cost, sorted scopes)` and are single-use; `/api/enforce`
consumes a matching approval when an action needs one.

- `lib/enforce.ts` → `requestHash()` — deterministic, order-independent binding.
- `lib/approvalStore.ts` → `recordApproval` / `consumeApproval` (single-use) / `peekApproval`.
- `app/api/approvals/route.ts` — a human approves one exact request; `GET ?hash=` inspects status.
- `app/api/enforce/route.ts` — on REQUIRES_APPROVAL, consumes a matching unused approval → ALLOWED;
  no match (altered params) or already used (replay) stays REQUIRES_APPROVAL.

New attacks added to the harness, all passing:

| Severity | Attack | Result |
|----------|--------|--------|
| Critical | Replay a consumed approval | 2nd use → REQUIRES_APPROVAL (not ALLOWED) |
| Critical | Approve cost $60, present $90 | REQUIRES_APPROVAL (altered cost can't ride it) |
| Critical | Approve `wire_funds`, present `drain_funds` | REQUIRES_APPROVAL (altered action can't ride it) |

**Harness: 13/13 passed** (`scripts/redteam-results.json`). tsc + build clean.

## Still open (future rounds)

- Durable, shared storage for the policy, spend ledger, approvals and audit log (Supabase; audit as
  an append-only table with no UPDATE/DELETE grants). Interfaces are in place.
- Approval expiry/TTL, and binding to a nonce so two identical legitimate requests each need their
  own approval rather than one covering both.
