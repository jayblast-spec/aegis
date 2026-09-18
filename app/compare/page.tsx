import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { comparisons } from '@/lib/compare'
import { SITE_URL } from '@/lib/site'
import { SiteHeader, SiteFooter } from '../components/SiteChrome'

export const metadata: Metadata = {
  title: 'Aegis vs. AI Agent Authorization Platforms — Comparisons',
  description:
    'Honest, researched comparisons between Aegis, a concept delegation card for personal AI agents, and adjacent agent identity and authorization platforms: Auth0 for AI Agents, Permit.io, Cerbos, Descope, and Oso.',
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
    <>
      <div className="aegis-home min-h-screen bg-[#07090E] text-gray-100" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="fixed inset-0 pointer-events-none opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(16,185,129,.08) 1px, transparent 1px), radial-gradient(rgba(6,182,212,.05) 1px, transparent 1px)', backgroundSize: '32px 32px', backgroundPosition: '0 0, 16px 16px' }} />
        <SiteHeader active="compare" />

        <section className="relative py-20 md:py-28 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <p className="text-xs text-gray-500 mb-6"><Link href="/" className="hover:text-emerald-400">Home</Link> / Compare</p>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs mb-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span>HONEST COMPARISONS</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight mb-6">
              How Aegis relates to agent identity &amp; authorization platforms.
            </h1>
            <p className="text-lg text-gray-300 max-w-3xl leading-relaxed">
              Aegis is a concept: a visible, revocable delegation card an individual uses to bound one AI agent&rsquo;s authority. The platforms below solve an adjacent but different problem — identity, policy, and enforcement infrastructure that engineering teams build into products. These are <strong className="text-white">adjacent alternatives, not necessarily direct substitutes</strong>, and each comparison says so explicitly.
            </p>
            <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm max-w-3xl">
              Aegis does not implement cryptographic signing, encryption, or immutable logging. Every comparison below states this plainly rather than overselling it.
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid sm:grid-cols-2 gap-5">
              {comparisons.map(c => (
                <Link
                  key={c.slug}
                  href={`/compare/${c.slug}`}
                  className="group p-6 rounded-2xl border border-gray-800 hover:border-emerald-500/40 transition-all duration-300 hover:-translate-y-1 flex flex-col gap-3"
                  style={{ background: 'rgba(13,17,23,.75)', backdropFilter: 'blur(12px)' }}
                >
                  <span className="text-[10px] uppercase tracking-wider text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Aegis vs.</span>
                  <h3 className="text-2xl font-bold text-white">{c.name}</h3>
                  <p className="text-sm text-gray-400 flex-1">{c.category}</p>
                  <span className="flex items-center gap-2 text-sm font-semibold text-emerald-400">Read comparison <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </>
  )
}
