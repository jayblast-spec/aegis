// Aegis enforcement red-team harness.
// Fires a battery of bypass patterns at /api/enforce and checks the decision.
// Usage: BASE=http://localhost:3000 node scripts/redteam-enforce.mjs
// Honest by design: a FAIL means Aegis let something through it should not have (or blocked
// something clean). Controls that should pass are included so a green run means real coverage.
const BASE = process.env.BASE || "http://localhost:3000";
const USER = `redteam-${Date.now()}`;
const AGENT = "agent-x";
const CAP = 100, THRESHOLD = 50, SCOPES = ["read", "write", "query"];

async function post(path, body) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, decision: j?.decision?.decision, allowed: j?.allowed, reason: j?.reason || j?.error };
}
const enforce = (extra) => post("/api/enforce", { userId: USER, agentId: AGENT, action: "act", ...extra });

const results = [];
function check(name, severity, pass, detail) { results.push({ name, severity, pass, detail }); }

await post("/api/policies", { userId: USER, agentId: AGENT, policy: { spendingCap: CAP, approvalThreshold: THRESHOLD, allowedScopes: SCOPES } });

// ---- Controls: these must behave correctly or the engine is broken ----
let r = await enforce({ cost: 25, scopes: ["read", "query"] });
check("control: legit action under cap+threshold is ALLOWED", "control", r.decision === "ALLOWED", `got ${r.decision}`);
r = await enforce({ cost: 150, scopes: ["read"] });
check("control: cost over cap is BLOCKED", "control", r.decision === "BLOCKED", `got ${r.decision}`);
r = await enforce({ cost: 75, scopes: ["read"] });
check("control: cost over threshold REQUIRES_APPROVAL", "control", r.decision === "REQUIRES_APPROVAL", `got ${r.decision}`);
r = await enforce({ cost: 10, scopes: ["admin"] });
check("control: unauthorized scope is BLOCKED", "control", r.decision === "BLOCKED", `got ${r.decision}`);
r = await post("/api/enforce", { userId: USER, agentId: "no-such-agent", action: "act", cost: 10 });
check("control: unknown agent fails closed (403)", "control", r.status === 403, `got ${r.status}`);

// ---- Attacks: a FAIL here is a real bypass ----

// 1. Negative cost — slips under every `>` check.
r = await enforce({ cost: -500, scopes: ["read"] });
check("attack: negative cost rejected (not ALLOWED)", "critical", r.decision !== "ALLOWED", `got ${r.decision} on cost -500`);

// 2. Non-numeric cost — string that isn't a clean number skips the cap comparison.
r = await enforce({ cost: "lots", scopes: ["read"] });
check("attack: non-numeric cost rejected (not ALLOWED)", "high", r.decision !== "ALLOWED", `got ${r.decision} on cost "lots"`);

// 3. Split-action / salami: fire many sub-cap actions; cumulative must not exceed the daily cap.
const SPLIT_USER = `${USER}-split`;
await post("/api/policies", { userId: SPLIT_USER, agentId: AGENT, policy: { spendingCap: CAP, approvalThreshold: 1000, allowedScopes: SCOPES } });
let allowedSpend = 0, calls = 0;
for (let i = 0; i < 8; i++) {
  const rr = await post("/api/enforce", { userId: SPLIT_USER, agentId: AGENT, action: "charge", cost: 90, scopes: ["write"] });
  calls++;
  if (rr.decision === "ALLOWED") allowedSpend += 90; else break;
}
check("attack: split actions cannot exceed daily cap", "critical", allowedSpend <= CAP, `allowed $${allowedSpend} total across ${calls} calls under a $${CAP} cap`);

// ---- Round 2: approval binding, altered-params, replay ----
// Generous cap so these turn on the approval path, not the cap.
const AP_USER = `${USER}-appr`;
await post("/api/policies", { userId: AP_USER, agentId: AGENT, policy: { spendingCap: 10000, approvalThreshold: 50, allowedScopes: SCOPES } });
const enforceAp = (extra) => post("/api/enforce", { userId: AP_USER, agentId: AGENT, action: "wire_funds", cost: 60, scopes: ["write"], ...extra });
const approveAp = (extra) => post("/api/approvals", { userId: AP_USER, agentId: AGENT, action: "wire_funds", cost: 60, scopes: ["write"], approved: true, ...extra });

// Baseline: an over-threshold action needs approval.
r = await enforceAp();
check("control: over-threshold action REQUIRES_APPROVAL before any approval", "control", r.decision === "REQUIRES_APPROVAL", `got ${r.decision}`);

// Happy path: human approves the exact request, agent retries -> ALLOWED.
await approveAp();
r = await enforceAp();
check("control: approved exact request is ALLOWED", "control", r.decision === "ALLOWED", `got ${r.decision}`);

// 4. Replay: the just-consumed approval must not work a second time.
r = await enforceAp();
check("attack: approval cannot be replayed (single-use)", "critical", r.decision !== "ALLOWED", `2nd use got ${r.decision}`);

// 5. Altered parameters: approve cost 60, then present cost 90 -> must NOT ride the approval.
await approveAp();
r = await enforceAp({ cost: 90 });
check("attack: altered cost cannot reuse an approval", "critical", r.decision !== "ALLOWED", `cost 60 approved, cost 90 got ${r.decision}`);

// 6. Altered action name: approve wire_funds, present drain_funds at same cost -> not allowed.
await approveAp();
r = await enforceAp({ action: "drain_funds" });
check("attack: altered action cannot reuse an approval", "critical", r.decision !== "ALLOWED", `approved wire_funds, drain_funds got ${r.decision}`);

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({ base: BASE, total: results.length, passed, failed: failed.length, results }, null, 1));
process.exit(0);
