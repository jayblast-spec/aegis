export type CompareRow = { label: string; aegis: string; other: string }
export type Faq = { q: string; a: string }

export type Comparison = {
  slug: string
  name: string
  officialUrl: string
  category: string
  oneLiner: string
  useCaseAegis: string
  useCaseOther: string
  rows: CompareRow[]
  pricingAegis: string
  pricingOther: string
  freeAegis: string
  freeOther: string
  speedAegis: string
  speedOther: string
  accuracyAegis: string
  accuracyOther: string
  easeAegis: string
  easeOther: string
  prosAegis: string[]
  consAegis: string[]
  prosOther: string[]
  consOther: string[]
  verdict: string
  faqs: Faq[]
}

export const comparisons: Comparison[] = [
  {
    slug: 'aegis-vs-auth0-for-ai-agents',
    name: 'Auth0 for AI Agents',
    officialUrl: 'https://auth0.com/ai',
    category: 'Enterprise agent identity & access infrastructure',
    oneLiner:
      'Auth0 for AI Agents gives engineering teams identity, token and MCP-access infrastructure to ship AI agents into production. Aegis gives an individual a visible, revocable card for what one agent may do.',
    useCaseAegis:
      'A person wants to see, in plain language, exactly what an AI agent is allowed to do on their behalf, approve or block specific actions, and revoke authority instantly — without writing any code.',
    useCaseOther:
      'A company shipping an AI agent or MCP server needs to give that agent a verifiable identity anchored to a user account, scope its tokens, and keep an audit trail as it calls APIs and moves data in production.',
    rows: [
      { label: 'Who configures it', aegis: 'The end user, directly, in a browser', other: 'Developers, via SDKs and the Auth0 dashboard' },
      { label: 'Unit of control', aegis: 'A delegation card: task, data, actions, mode, hard limit, expiry', other: 'Agent identity, scoped token, short-lived credential' },
      { label: 'Enforcement point', aegis: 'Concept UI — approve/block is a local demo, not a runtime gate on a real agent', other: 'Runtime, at the API/MCP layer, backed by Auth0’s identity platform' },
      { label: 'Audit trail', aegis: 'An in-browser action ledger stored in localStorage', other: 'Production audit logs anchored to verified user identity' },
      { label: 'Deployment', aegis: 'Single-page local demo', other: 'Integrated into a live product via Auth0 SDKs' },
    ],
    pricingAegis: 'Not a commercial product — this is an early-stage concept, currently free to try with no account required.',
    pricingOther: 'Freemium: free to start building, then usage-based pricing as active agent identities scale (per Auth0’s own site).',
    freeAegis: 'Entirely free; runs locally in your browser.',
    freeOther: 'Yes — Auth0 advertises a free tier to start building before paying for active agent identities.',
    speedAegis: 'Instant — create a card in under a minute, no integration required, because nothing is wired to a real agent yet.',
    speedOther: 'Slower to first value — requires SDK integration, identity configuration, and token/scope design before an agent can call anything.',
    accuracyAegis: 'Human-readable boundaries (task, data, action, limit) reviewed by the person — precise in intent, not yet enforced in code.',
    accuracyOther: 'Fine-grained, enforced scopes and short-lived tokens designed to hold up under real production traffic.',
    easeAegis: 'No-code, visual, built for a non-technical individual.',
    easeOther: 'Developer-oriented; requires engineering time to integrate correctly.',
    prosAegis: [
      'Plain-language authority cards anyone can read and edit',
      'Zero setup — open the page and create a boundary',
      'Revoke and pause are one click, always visible',
    ],
    consAegis: [
      'Concept only: no real agent is actually gated by these cards yet',
      'No cryptographic signing, encryption, or immutable logging — despite some UI copy, none of that is implemented',
      'Data lives in browser localStorage, not a durable backend',
    ],
    prosOther: [
      'Production-grade identity and token infrastructure',
      'Built for MCP servers and agent-to-API access at scale',
      'Backed by Auth0’s existing enterprise compliance and support',
    ],
    consOther: [
      'Requires developer integration — not something an individual end user configures directly',
      'Roadmap items like Agent-as-Principal and Agent Gateway are still emerging',
      'Overhead is hard to justify for a single personal agent or a small project',
    ],
    verdict:
      'These solve different problems. If you are a person who wants a visible, editable boundary on one or two personal agents today, Aegis’s card model is the more direct interface — with the honest caveat that it is a local concept build, not a security control. If you are a company shipping an AI agent or MCP server into production and need real identity, tokens, and audit trails, Auth0 for AI Agents is built for that job and Aegis is not a substitute for it.',
    faqs: [
      { q: 'Is Aegis a replacement for Auth0 for AI Agents?', a: 'No. Aegis is a consumer-facing concept for individuals to define and revoke boundaries on personal agents. Auth0 for AI Agents is production identity infrastructure for companies building agents and MCP servers. They serve different users and different stages of maturity.' },
      { q: 'Does Aegis implement real cryptographic identity like Auth0?', a: 'No. Aegis does not implement cryptographic signing, token issuance, or encryption. It is a local, browser-based demo of what a human-controlled authority interface could look like.' },
      { q: 'Could a product use both?', a: 'Conceptually yes: Auth0 for AI Agents could secure the machine-to-machine identity and tokens, while a consumer-facing layer like Aegis’s card model could give the end user visibility and control over what that identity is allowed to do.' },
    ],
  },
  {
    slug: 'aegis-vs-permit-io',
    name: 'Permit.io',
    officialUrl: 'https://www.permit.io',
    category: 'Runtime authorization platform for apps, APIs, and agents',
    oneLiner:
      'Permit.io is a policy-as-code authorization engine that governs humans, services, and AI agents through a Policy Decision Point and MCP Gateway. Aegis is a human-facing card for one person’s agents.',
    useCaseAegis:
      'An individual wants to write, in their own words, what an agent may do, then approve, block, pause, or revoke that authority without touching a policy language.',
    useCaseOther:
      'A platform team wants to replace scattered permission checks with a centralized policy engine (RBAC/ABAC/ReBAC) that agents, services, and users all evaluate against — including per-tool-call checks on MCP traffic.',
    rows: [
      { label: 'Policy model', aegis: 'Free-text task + fixed fields (data, actions, mode, limit)', other: 'Formal policy as code (RBAC, ABAC, ReBAC), with a no-code editor option' },
      { label: 'Subjects governed', aegis: 'One person’s individual agents', other: 'Humans, services, and agents under one unified model' },
      { label: 'Decision point', aegis: 'None — approvals are simulated in the browser', other: 'A real Policy Decision Point (PDP), deployable in the customer’s own network' },
      { label: 'MCP support', aegis: 'Not applicable — no live agent connection', other: 'Dedicated MCP Gateway enforcing policy on every tool call' },
      { label: 'Audit', aegis: 'Local action ledger, browser-only', other: 'Comprehensive audit logging with decision traces' },
    ],
    pricingAegis: 'Free concept; no plans, seats, or billing.',
    pricingOther: 'Pricing is disclosed on request via Permit.io’s site; no public flat rate is listed there.',
    freeAegis: 'Fully free, local demo.',
    freeOther: 'Permit.io’s site does not clearly state a self-serve free tier — check their current pricing page before assuming one.',
    speedAegis: 'Minutes — describe a task, pick a mode, done.',
    speedOther: 'Longer runway — requires modeling a policy schema and integrating the PDP or gateway into your stack.',
    accuracyAegis: 'Boundaries are as precise as the sentence you write; there is no policy engine validating edge cases.',
    accuracyOther: 'Formal policy evaluation (RBAC/ABAC/ReBAC) built to hold up against adversarial or ambiguous access requests, including prompt-injection-aware checks on agent tool calls.',
    easeAegis: 'No-code, designed for one person, not a team.',
    easeOther: 'Built for platform and security engineers; more powerful, more setup.',
    prosAegis: [
      'Immediate, human-readable authority definition',
      'No policy language to learn',
      'Pause-all and revoke are always one click away',
    ],
    consAegis: [
      'No actual policy engine — nothing is programmatically enforced',
      'Not built for multi-agent or multi-tenant environments',
      'No integration path into a real product today',
    ],
    prosOther: [
      'Unified authorization model across humans, services, and agents',
      'Purpose-built MCP Gateway for agent tool-call governance',
      'Enterprise customers already running it at scale (per Permit.io’s site)',
    ],
    consOther: [
      'Requires engineering investment to model policies correctly',
      'Not something a non-technical individual would set up alone',
      'Public pricing detail is limited on the marketing site',
    ],
    verdict:
      'Permit.io is infrastructure for teams that need enforceable, centralized policy across humans, services, and agents — including live MCP tool-call governance. Aegis is a much simpler, human-facing sketch of what visible consent for one person’s agent could feel like. Treat them as adjacent, not competing: a team could plausibly use Permit.io underneath and something like Aegis’s card UI in front of it.',
    faqs: [
      { q: 'Does Aegis use a policy engine like Permit.io’s PDP?', a: 'No. Aegis has no Policy Decision Point. Approvals and blocks in the current build are simulated in the browser for demonstration.' },
      { q: 'Is Permit.io meant for individual consumers?', a: 'No — it’s built for engineering and platform teams securing applications, APIs, and agents at the infrastructure level, not for an individual configuring their own personal agent.' },
      { q: 'Which one enforces MCP tool-call restrictions today?', a: 'Permit.io, via its MCP Gateway. Aegis does not connect to a live MCP server or agent in its current build.' },
    ],
  },
  {
    slug: 'aegis-vs-cerbos',
    name: 'Cerbos',
    officialUrl: 'https://www.cerbos.dev',
    category: 'Centralized authorization / policy decision engine',
    oneLiner:
      'Cerbos externalizes authorization logic into a fast, auditable decision service for apps, workloads, and agents. Aegis is a visual, human-readable authority card with no decision engine behind it.',
    useCaseAegis:
      'A person wants a plain-language, editable statement of what an agent may do, plus a one-click way to revoke it — with no engineering involved.',
    useCaseOther:
      'A development team wants to move permission logic out of application code and into a single, testable policy service that any system — including AI workloads — calls for an allow/deny decision.',
    rows: [
      { label: 'Policy language', aegis: 'Plain sentences typed by the user', other: 'Human-readable YAML supporting RBAC, ABAC, ReBAC, and PBAC' },
      { label: 'Decision latency', aegis: 'Not applicable — no real-time decisions are made', other: 'Sub-millisecond decisions from a locally deployed Policy Decision Point' },
      { label: 'Open source option', aegis: 'This build itself is not published as open source', other: 'The Cerbos PDP is open-source; Cerbos Hub adds a free management tier' },
      { label: 'Compliance posture', aegis: 'None claimed — explicitly a concept build', other: 'Audit trails positioned for ISO 27001, SOC 2, and HIPAA contexts (per Cerbos’s site)' },
      { label: 'Deployment options', aegis: 'Single browser tab', other: 'Self-hosted, serverless, sidecar, or air-gapped' },
    ],
    pricingAegis: 'Free, with no tiers — it’s a demo, not a product.',
    pricingOther: 'Free and paid tiers exist; Cerbos’s site does not publish exact figures.',
    freeAegis: 'Yes, entirely free.',
    freeOther: 'Yes — the Cerbos PDP is open-source, and Cerbos Hub offers a free tier for policy management.',
    speedAegis: 'Instant to create a card; there is nothing to deploy.',
    speedOther: 'Fast per-decision (sub-millisecond) once deployed, but initial setup requires writing and testing policies.',
    accuracyAegis: 'As accurate as the plain-language description a person writes; not machine-verified.',
    accuracyOther: 'Formal policy evaluation designed for consistent, testable allow/deny outcomes across RBAC, ABAC, ReBAC, and PBAC.',
    easeAegis: 'Easiest possible entry point: no policy syntax at all.',
    easeOther: 'Requires learning Cerbos’s policy YAML and integrating a PDP into your architecture.',
    prosAegis: [
      'No YAML, no schema — just describe the task',
      'Visual, always-visible authority state',
      'Nothing to self-host or operate',
    ],
    consAegis: [
      'No real policy decision point — decisions are not actually computed',
      'Cannot express relationship-based or attribute-based rules',
      'Not suitable for anything beyond a personal, single-user demo',
    ],
    prosOther: [
      'Open-source core with a free management tier',
      'Sub-millisecond, testable authorization decisions',
      'Compliance-oriented audit trails and flexible deployment models',
    ],
    consOther: [
      'Requires engineering effort to author and maintain policies',
      'Not designed for a non-technical person to configure directly',
      'Value shows up at the system level, not for a single personal agent',
    ],
    verdict:
      'Cerbos is a serious, open-source-backed authorization engine for teams that need fast, testable, centralized decisions — including for AI workloads. Aegis does not compete with that; it is a concept exploring what a human, not a developer, would want to see and control about their own agent. If you need real enforcement today, Cerbos is the applicable tool.',
    faqs: [
      { q: 'Can Aegis replace a Cerbos PDP?', a: 'No. Aegis makes no real-time authorization decisions. Cerbos’s PDP evaluates real requests in production; Aegis simulates approve/block in a local browser demo.' },
      { q: 'Is Cerbos free to use?', a: 'The Cerbos Policy Decision Point is open-source, and Cerbos Hub offers a free tier for policy management, per Cerbos’s own site.' },
      { q: 'Who is Aegis actually for, then?', a: 'An individual who wants to see and control what a personal AI agent is allowed to do, expressed in plain language rather than policy code.' },
    ],
  },
  {
    slug: 'aegis-vs-descope',
    name: 'Descope',
    officialUrl: 'https://www.descope.com',
    category: 'Customer and agentic identity (CIAM) platform',
    oneLiner:
      'Descope is a no-code identity platform covering B2C, B2B, and AI-agent/MCP authentication and authorization. Aegis is a single-purpose card for defining and revoking one agent’s boundaries.',
    useCaseAegis:
      'A person wants a simple, visible way to say what an agent may do, approve specific actions, and revoke authority — with no login flows or identity infrastructure involved.',
    useCaseOther:
      'A company needs to build authentication and identity journeys — including passkeys, SSO, MFA, and now AI agent and MCP server identity — without building that infrastructure from scratch.',
    rows: [
      { label: 'Core domain', aegis: 'Authority boundaries for one agent', other: 'Full identity and access management (auth, consent, credentials, MFA)' },
      { label: 'Builder', aegis: 'A fixed card form (agent, task, mode, limit)', other: 'A no-code, drag-and-drop workflow builder for identity journeys' },
      { label: 'Agent/MCP support', aegis: 'Conceptual only — no live agent is connected', other: 'Explicit standards-based identity infrastructure for AI agents and MCP servers' },
      { label: 'Auth methods', aegis: 'None — there is no login system', other: 'Passkeys, magic links, OTP, biometrics, social login, SAML/OIDC SSO' },
      { label: 'Scope', aegis: 'Single individual, single browser', other: 'Enterprise and mid-market, B2C to B2B, multi-tenant' },
    ],
    pricingAegis: 'Free concept, no pricing tiers.',
    pricingOther: 'Not published on the marketing page; Descope’s site does not state specific tier pricing.',
    freeAegis: 'Free to use as a local demo.',
    freeOther: 'Not clearly stated on Descope’s site — verify current tiers on their pricing page before assuming a free plan.',
    speedAegis: 'Immediate — no identity flows to configure.',
    speedOther: 'Fast for standard flows via no-code builder, but agent/MCP identity setup still requires integration work.',
    accuracyAegis: 'Limited to whatever boundary the user manually describes; no verification layer.',
    accuracyOther: 'Fine-grained access control (RBAC, ReBAC, ABAC) plus adaptive MFA and account-takeover prevention.',
    easeAegis: 'Extremely simple, but narrow — it only does one thing.',
    easeOther: 'No-code builder lowers the bar for identity engineering, but the surface area is much larger.',
    prosAegis: [
      'Zero identity complexity — nothing to configure',
      'Human-readable, editable authority in seconds',
      'Clear pause/revoke controls always visible',
    ],
    consAegis: [
      'Has no authentication, consent, or credential system at all',
      'Cannot federate identity across multiple apps or tenants',
      'Not connected to any real MCP server or agent',
    ],
    prosOther: [
      'Covers the full identity lifecycle, including AI agents and MCP servers',
      'No-code workflow builder speeds up standard identity journeys',
      'Broad method support: passkeys, SSO, adaptive MFA',
    ],
    consOther: [
      'Much larger surface area than a single individual typically needs',
      'Pricing is not transparent on the public site',
      'Still requires integration work for agent/MCP-specific identity',
    ],
    verdict:
      'Descope is identity infrastructure for companies — it authenticates users, agents, and MCP servers at scale. Aegis does not authenticate anything; it visualizes and lets a person edit what one agent is permitted to do. They address adjacent but distinct problems: identity (who is this agent, proven how) versus authority (what may this specific agent do, as decided by a human).',
    faqs: [
      { q: 'Does Aegis authenticate agents like Descope does?', a: 'No. Aegis has no authentication layer. It assumes an agent already exists and focuses purely on defining and revoking what that agent may do.' },
      { q: 'Could Descope and Aegis work together conceptually?', a: 'Yes, conceptually: Descope could prove which agent is acting and issue its credentials, while a human-facing layer like Aegis’s card model could let the person decide and see what that agent is authorized to do.' },
      { q: 'Is Descope free?', a: 'Descope’s public site does not clearly state free-tier pricing; check their current pricing page directly before relying on this.' },
    ],
  },
  {
    slug: 'aegis-vs-oso',
    name: 'Oso',
    officialUrl: 'https://www.osohq.com',
    category: 'Enterprise AI agent monitoring and governance',
    oneLiner:
      'Oso discovers, monitors, and governs AI agents already running across an organization’s laptops, browsers, and terminals. Aegis is a single person’s card for one agent’s bounded authority.',
    useCaseAegis:
      'A person wants to define, see, and revoke a specific boundary for one agent they personally use — before any action happens.',
    useCaseOther:
      'A security or platform team needs to discover every agent already running across the company (including unauthorized ones), monitor every prompt and tool call, and flag or block risky behavior after agents are already in use.',
    rows: [
      { label: 'Vantage point', aegis: 'One individual, one agent, defined up front', other: 'Organization-wide, across many agents and employees, often discovered after the fact' },
      { label: 'Core motion', aegis: 'Author a boundary before the agent acts', other: 'Discover, monitor, detect, and control agents already operating' },
      { label: 'Detection', aegis: 'None — nothing is monitored in real time', other: 'Flags rule violations, high-velocity behavior, PII leakage, and exposed API keys' },
      { label: 'Reporting', aegis: 'A local, browser-only action list', other: 'Compliance logs and audit trails built for incident investigation' },
      { label: 'Integration', aegis: 'None', other: 'Integrates with Claude, ChatGPT, and other LLM providers (per Oso’s site)' },
    ],
    pricingAegis: 'Free concept; nothing to buy.',
    pricingOther: 'Not itemized on the public site; Oso offers a free trial and an option to consult with their engineering team.',
    freeAegis: 'Yes, fully free.',
    freeOther: 'A free trial is offered, per Oso’s site; ongoing pricing is not publicly itemized.',
    speedAegis: 'Immediate setup, because there is nothing to discover — the user defines the boundary directly.',
    speedOther: 'Value depends on rollout across the org; discovery and monitoring take time to reach full coverage.',
    accuracyAegis: 'Precise only for the single boundary a person explicitly writes down.',
    accuracyOther: 'Built to catch real behavioral risk (velocity spikes, PII leakage, key exposure) across many agents, which a static card model cannot see.',
    easeAegis: 'Trivial for one person, one agent.',
    easeOther: 'Built for security teams managing agent sprawl across an entire company.',
    prosAegis: [
      'Boundary is set before the agent ever acts, not discovered afterward',
      'No monitoring infrastructure required',
      'Instant, visible pause and revoke',
    ],
    consAegis: [
      'Cannot discover agents it doesn’t already know about',
      'No behavioral monitoring or anomaly detection at all',
      'Scales to one person, not an organization',
    ],
    prosOther: [
      'Finds unauthorized or shadow agents already running',
      'Real-time behavioral detection (PII leakage, key exposure, velocity)',
      'Generates compliance-ready audit logs for incident response',
    ],
    consOther: [
      'Primarily reactive — much of its value is discovering agents after they’re already active',
      'Built for organizations, not an individual’s personal agent',
      'Public pricing is not itemized',
    ],
    verdict:
      'Oso solves a governance problem Aegis doesn’t attempt: finding and watching agents that are already running across an organization, often without IT’s knowledge. Aegis solves a narrower, upfront problem: letting one person define a visible boundary before an agent acts. A mature security stack plausibly needs Oso’s discovery and monitoring regardless of whether an individual is also using something like Aegis for their own personal agents.',
    faqs: [
      { q: 'Does Aegis detect agents I didn’t know were running, like Oso does?', a: 'No. Aegis has no discovery or monitoring capability. It only manages a boundary for an agent the user explicitly adds themselves.' },
      { q: 'Is Oso meant for individual consumers?', a: 'No — Oso is built for enterprise security and platform teams governing agent use across an organization, not for a single person’s personal agent.' },
      { q: 'Which one would catch a misbehaving agent already in production?', a: 'Oso, via its monitoring and detection features. Aegis has no runtime enforcement or monitoring in its current build.' },
    ],
  },
]

export function getComparison(slug: string) {
  return comparisons.find(c => c.slug === slug)
}
