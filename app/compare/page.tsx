import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { comparisons } from '@/lib/compare'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Aegis vs. AI Agent Authorization Platforms — Comparisons',
  description:
    'Honest, researched comparisons between Aegis, a prototype delegation card for personal AI agents, and adjacent agent identity and authorization platforms: Auth0 for AI Agents, Permit.io, Cerbos, Descope, and Oso.',
  alternates: { canonical: `${SITE_URL}/compare` },
  openGraph: {
    title: 'Aegis vs. AI Agent Authorization Platforms — Comparisons',
    description:
      'Honest comparisons between Aegis and adjacent agent identity/authorization platforms: Auth0 for AI Agents, Permit.io, Cerbos, Descope, and Oso.',
    url: `${SITE_URL}/compare`,
    type: 'website',
  },
}

export default function ComparePage() {
  return (
    <main className="shell">
      <header className="nav">
        <a className="wordmark" href="/"><span className="mark"><ShieldCheck size={18} /></span> aegis</a>
        <div className="nav-center">
          <Link href="/#authority">Authority</Link>
          <Link href="/#ledger">Action ledger</Link>
          <Link href="/compare">Compare</Link>
        </div>
      </header>
      <div className="compare-shell">
        <p className="compare-crumb"><Link href="/">Home</Link> / Compare</p>
        <div className="compare-hero">
          <p className="kicker small"><span /> HONEST COMPARISONS</p>
          <h1>How Aegis relates to agent identity &amp; authorization platforms.</h1>
          <p>
            Aegis is a prototype: a visible, revocable delegation card an individual uses to bound one AI agent&rsquo;s
            authority. The platforms below solve an adjacent but different problem &mdash; identity, policy, and
            enforcement infrastructure that engineering teams build into products. These are <strong>adjacent
            alternatives, not necessarily direct substitutes</strong>, and each comparison says so explicitly.
          </p>
          <div className="compare-note">
            Aegis does not implement cryptographic signing, encryption, or immutable logging. It is a local, browser-based
            demo. Every comparison below states this plainly rather than overselling it.
          </div>
        </div>
        <div className="compare-grid">
          {comparisons.map(c => (
            <Link key={c.slug} href={`/compare/${c.slug}`} className="compare-card">
              <span className="vs">AEGIS VS.</span>
              <h3>{c.name}</h3>
              <p>{c.category}</p>
              <span className="go">Read comparison <ArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      </div>
      <footer className="site-footer">
        <span className="wordmark"><span className="mark"><ShieldCheck size={15} /></span> aegis</span>
        <p>Your rules travel with you. No model owns your life.</p>
        <span>Prototype · Local demo only</span>
      </footer>
    </main>
  )
}
