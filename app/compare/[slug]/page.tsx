import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { comparisons, getComparison } from '@/lib/compare'
import { SITE_URL } from '@/lib/site'
import { SiteHeader, SiteFooter } from '../../components/SiteChrome'

export function generateStaticParams() {
  return comparisons.map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const c = getComparison(slug)
  if (!c) return {}
  const title = `Aegis vs. ${c.name}: Honest Comparison (2026)`
  const description = `How Aegis, a concept delegation card for personal AI agents, compares to ${c.name} on use case, features, pricing, and ease of use. Adjacent alternatives, not direct substitutes.`
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/compare/${c.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/compare/${c.slug}`, type: 'article' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function ComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const c = getComparison(slug)
  if (!c) return notFound()
  const related = comparisons.filter(x => x.slug !== c.slug).slice(0, 3)

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Aegis',
    description: 'A concept sovereign trust and delegation layer for AI agents. Interactive design sandbox only.',
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
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="aegis-home min-h-screen bg-[#07090E] text-gray-100" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="fixed inset-0 pointer-events-none opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(16,185,129,.08) 1px, transparent 1px), radial-gradient(rgba(6,182,212,.05) 1px, transparent 1px)', backgroundSize: '32px 32px', backgroundPosition: '0 0, 16px 16px' }} />
        <SiteHeader active="compare" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <p className="text-xs text-gray-500 mb-6">
            <Link href="/" className="hover:text-emerald-400">Home</Link> / <Link href="/compare" className="hover:text-emerald-400">Compare</Link> / Aegis vs. {c.name}
          </p>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs mb-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span>{c.category.toUpperCase()}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-6">Aegis vs. {c.name}</h1>
          <p className="text-lg text-gray-300 max-w-3xl leading-relaxed mb-6">{c.oneLiner}</p>
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm max-w-3xl mb-16">
            {c.name} is an adjacent alternative, not necessarily a direct substitute for Aegis. Aegis is an early-stage concept with no cryptographic signing, encryption, or immutable logging implemented.
          </div>

          <section className="mb-16">
            <h2 className="text-2xl font-bold text-white mb-6">Core use case</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="p-6 rounded-2xl border border-gray-800" style={{ background: 'rgba(13,17,23,.75)' }}>
                <h3 className="text-sm font-bold text-emerald-400 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>AEGIS</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{c.useCaseAegis}</p>
              </div>
              <div className="p-6 rounded-2xl border border-gray-800" style={{ background: 'rgba(13,17,23,.75)' }}>
                <h3 className="text-sm font-bold text-cyan-400 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{c.name.toUpperCase()}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{c.useCaseOther}</p>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-bold text-white mb-6">Side-by-side</h2>
            <div className="rounded-2xl border border-gray-800 overflow-x-auto" style={{ background: 'rgba(13,17,23,.75)' }}>
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <th className="py-4 px-5">Dimension</th>
                    <th className="py-4 px-5 text-emerald-400">Aegis</th>
                    <th className="py-4 px-5">{c.name}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 text-sm">
                  {c.rows.map(r => (
                    <tr key={r.label}>
                      <td className="py-4 px-5 font-semibold text-white whitespace-nowrap">{r.label}</td>
                      <td className="py-4 px-5 text-emerald-300">{r.aegis}</td>
                      <td className="py-4 px-5 text-gray-400">{r.other}</td>
                    </tr>
                  ))}
                  <tr><td className="py-4 px-5 font-semibold text-white whitespace-nowrap">Pricing approach</td><td className="py-4 px-5 text-emerald-300">{c.pricingAegis}</td><td className="py-4 px-5 text-gray-400">{c.pricingOther}</td></tr>
                  <tr><td className="py-4 px-5 font-semibold text-white whitespace-nowrap">Free option</td><td className="py-4 px-5 text-emerald-300">{c.freeAegis}</td><td className="py-4 px-5 text-gray-400">{c.freeOther}</td></tr>
                  <tr><td className="py-4 px-5 font-semibold text-white whitespace-nowrap">Speed to first value</td><td className="py-4 px-5 text-emerald-300">{c.speedAegis}</td><td className="py-4 px-5 text-gray-400">{c.speedOther}</td></tr>
                  <tr><td className="py-4 px-5 font-semibold text-white whitespace-nowrap">Accuracy / precision</td><td className="py-4 px-5 text-emerald-300">{c.accuracyAegis}</td><td className="py-4 px-5 text-gray-400">{c.accuracyOther}</td></tr>
                  <tr><td className="py-4 px-5 font-semibold text-white whitespace-nowrap">Ease of use</td><td className="py-4 px-5 text-emerald-300">{c.easeAegis}</td><td className="py-4 px-5 text-gray-400">{c.easeOther}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-bold text-white mb-6">Pros &amp; cons</h2>
            <div className="grid sm:grid-cols-2 gap-5 mb-5">
              <div className="p-6 rounded-2xl border border-emerald-500/20" style={{ background: 'rgba(13,17,23,.75)' }}>
                <h3 className="text-sm font-bold text-emerald-400 mb-3">Aegis — strengths</h3>
                <ul className="space-y-2 text-sm text-gray-300">{c.prosAegis.map(p => <li key={p} className="flex gap-2"><span className="text-emerald-400">+</span>{p}</li>)}</ul>
              </div>
              <div className="p-6 rounded-2xl border border-rose-500/20" style={{ background: 'rgba(13,17,23,.75)' }}>
                <h3 className="text-sm font-bold text-rose-400 mb-3">Aegis — limits</h3>
                <ul className="space-y-2 text-sm text-gray-300">{c.consAegis.map(p => <li key={p} className="flex gap-2"><span className="text-rose-400">–</span>{p}</li>)}</ul>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="p-6 rounded-2xl border border-emerald-500/20" style={{ background: 'rgba(13,17,23,.75)' }}>
                <h3 className="text-sm font-bold text-emerald-400 mb-3">{c.name} — strengths</h3>
                <ul className="space-y-2 text-sm text-gray-300">{c.prosOther.map(p => <li key={p} className="flex gap-2"><span className="text-emerald-400">+</span>{p}</li>)}</ul>
              </div>
              <div className="p-6 rounded-2xl border border-rose-500/20" style={{ background: 'rgba(13,17,23,.75)' }}>
                <h3 className="text-sm font-bold text-rose-400 mb-3">{c.name} — limits</h3>
                <ul className="space-y-2 text-sm text-gray-300">{c.consOther.map(p => <li key={p} className="flex gap-2"><span className="text-rose-400">–</span>{p}</li>)}</ul>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-bold text-white mb-6">Verdict</h2>
            <div className="p-6 rounded-2xl border border-emerald-500/30 text-gray-100 text-[15px] leading-relaxed" style={{ background: 'linear-gradient(130deg, rgba(16,185,129,.08), rgba(255,255,255,.02))' }}>{c.verdict}</div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-bold text-white mb-6">FAQ</h2>
            <div className="rounded-2xl border border-gray-800 divide-y divide-gray-800" style={{ background: 'rgba(13,17,23,.75)' }}>
              {c.faqs.map(f => (
                <div className="p-6" key={f.q}>
                  <h3 className="text-sm font-bold text-white mb-2">{f.q}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-bold text-white mb-6">Other comparisons</h2>
            <div className="flex flex-wrap gap-3">
              {related.map(r => (
                <Link key={r.slug} href={`/compare/${r.slug}`} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-800 hover:border-emerald-500/40 text-sm text-gray-300 hover:text-white transition-all" style={{ background: 'rgba(13,17,23,.75)' }}>
                  Aegis vs. {r.name} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ))}
              <Link href="/compare" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-sm font-semibold text-white transition-all">
                All comparisons <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>

          <p className="text-xs text-gray-600">
            Sourced from {c.name}&rsquo;s official site (<a href={c.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-emerald-400">{c.officialUrl}</a>) as of research time. Verify current features and pricing directly with {c.name} before making a decision.
          </p>
        </div>

        <SiteFooter />
      </div>
    </>
  )
}
