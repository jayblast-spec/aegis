import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { comparisons, getComparison } from '@/lib/compare'
import { SITE_URL } from '@/lib/site'

export function generateStaticParams() {
  return comparisons.map(c => ({ slug: c.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const c = getComparison(params.slug)
  if (!c) return {}
  const title = `Aegis vs. ${c.name}: Honest Comparison (2026)`
  const description = `How Aegis, a prototype delegation card for personal AI agents, compares to ${c.name} on use case, features, pricing, and ease of use. Adjacent alternatives, not direct substitutes.`
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/compare/${c.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/compare/${c.slug}`, type: 'article' },
    twitter: { card: 'summary', title, description },
  }
}

export default function ComparisonPage({ params }: { params: { slug: string } }) {
  const c = getComparison(params.slug)
  if (!c) return notFound()
  const related = comparisons.filter(x => x.slug !== c.slug).slice(0, 3)

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Aegis',
    description: 'A prototype sovereign trust and delegation layer for AI agents. Local demo only.',
    brand: { '@type': 'Brand', name: 'Aegis' },
  }
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: c.faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Compare', item: `${SITE_URL}/compare` },
      { '@type': 'ListItem', position: 3, name: `Aegis vs. ${c.name}`, item: `${SITE_URL}/compare/${c.slug}` },
    ],
  }

  return (
    <main className="shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <header className="nav">
        <a className="wordmark" href="/"><span className="mark"><ShieldCheck size={18} /></span> aegis</a>
        <div className="nav-center">
          <Link href="/#authority">Authority</Link>
          <Link href="/#ledger">Action ledger</Link>
          <Link href="/compare">Compare</Link>
        </div>
      </header>
      <div className="compare-shell">
        <p className="compare-crumb">
          <Link href="/">Home</Link> / <Link href="/compare">Compare</Link> / Aegis vs. {c.name}
        </p>
        <div className="compare-hero">
          <p className="kicker small"><span /> {c.category.toUpperCase()}</p>
          <h1>Aegis vs. {c.name}</h1>
          <p>{c.oneLiner}</p>
          <div className="compare-note">
            {c.name} is an adjacent alternative, not necessarily a direct substitute for Aegis. Aegis is an unreleased
            prototype with no cryptographic signing, encryption, or immutable logging implemented.
          </div>
        </div>

        <div className="compare-section">
          <h2>Core use case</h2>
          <div className="compare-columns">
            <div className="compare-panel"><h3>Aegis</h3><p style={{ color: 'var(--soft)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{c.useCaseAegis}</p></div>
            <div className="compare-panel"><h3>{c.name}</h3><p style={{ color: 'var(--soft)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{c.useCaseOther}</p></div>
          </div>
        </div>

        <div className="compare-section">
          <h2>Side-by-side</h2>
          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr><th>Dimension</th><th>Aegis</th><th>{c.name}</th></tr>
              </thead>
              <tbody>
                {c.rows.map(r => (
                  <tr key={r.label}>
                    <td className="metric">{r.label}</td>
                    <td className="aegis-col">{r.aegis}</td>
                    <td>{r.other}</td>
                  </tr>
                ))}
                <tr><td className="metric">Pricing approach</td><td className="aegis-col">{c.pricingAegis}</td><td>{c.pricingOther}</td></tr>
                <tr><td className="metric">Free option</td><td className="aegis-col">{c.freeAegis}</td><td>{c.freeOther}</td></tr>
                <tr><td className="metric">Speed to first value</td><td className="aegis-col">{c.speedAegis}</td><td>{c.speedOther}</td></tr>
                <tr><td className="metric">Accuracy / precision</td><td className="aegis-col">{c.accuracyAegis}</td><td>{c.accuracyOther}</td></tr>
                <tr><td className="metric">Ease of use</td><td className="aegis-col">{c.easeAegis}</td><td>{c.easeOther}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="compare-section">
          <h2>Pros &amp; cons</h2>
          <div className="compare-columns">
            <div className="compare-panel pro"><h3>Aegis — strengths</h3><ul>{c.prosAegis.map(p => <li key={p}>{p}</li>)}</ul></div>
            <div className="compare-panel con"><h3>Aegis — limits</h3><ul>{c.consAegis.map(p => <li key={p}>{p}</li>)}</ul></div>
          </div>
          <div className="compare-columns" style={{ marginTop: 14 }}>
            <div className="compare-panel pro"><h3>{c.name} — strengths</h3><ul>{c.prosOther.map(p => <li key={p}>{p}</li>)}</ul></div>
            <div className="compare-panel con"><h3>{c.name} — limits</h3><ul>{c.consOther.map(p => <li key={p}>{p}</li>)}</ul></div>
          </div>
        </div>

        <div className="compare-section">
          <h2>Verdict</h2>
          <div className="verdict-card">{c.verdict}</div>
        </div>

        <div className="compare-section">
          <h2>FAQ</h2>
          {c.faqs.map(f => (
            <div className="faq-item" key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>

        <div className="compare-section">
          <h2>Other comparisons</h2>
          <div className="compare-related">
            {related.map(r => (
              <Link key={r.slug} href={`/compare/${r.slug}`}>Aegis vs. {r.name} <ArrowRight size={13} /></Link>
            ))}
            <Link href="/compare">All comparisons <ArrowRight size={13} /></Link>
          </div>
        </div>

        <p style={{ marginTop: 40, color: '#7f8a84', fontSize: 11 }}>
          Sourced from {c.name}&rsquo;s official site (<a href={c.officialUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#7f8a84' }}>{c.officialUrl}</a>) as of{' '}
          research time. Verify current features and pricing directly with {c.name} before making a decision.
        </p>
      </div>
      <footer className="site-footer">
        <span className="wordmark"><span className="mark"><ShieldCheck size={15} /></span> aegis</span>
        <p>Your rules travel with you. No model owns your life.</p>
        <span>Prototype · Local demo only</span>
      </footer>
    </main>
  )
}
