import Link from 'next/link'

export function SiteHeader({ active }: { active?: 'platform' | 'sandbox' | 'receipt' | 'neutral-advantage' | 'compare' }) {
  const link = (key: string, cls = '') => `hover:text-emerald-400 transition-colors ${active === key ? 'text-emerald-400' : ''} ${cls}`
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-800/80 bg-[#07090E]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 p-[1px] shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-all">
              <div className="w-full h-full bg-[#07090E] rounded-[11px] flex items-center justify-center">
                <i data-lucide="shield-check" className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xl tracking-tight text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>AEGIS</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">Protocol</span>
              </div>
              <span className="text-[11px] text-gray-400 hidden sm:block" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Independent Trust &amp; Delegation</span>
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900/80 border border-gray-800 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-gray-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>SANDBOX: <span className="text-emerald-400 font-semibold">LIVE</span></span>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
          <Link href="/#platform" className={link('platform')}>Platform</Link>
          <Link href="/#sandbox" className={link('sandbox')}>Sandbox</Link>
          <Link href="/#receipt" className={link('receipt')}>Action Ledger</Link>
          <Link href="/#neutral-advantage" className={link('neutral-advantage')}>Neutrality</Link>
          <Link href="/compare" className={link('compare')}>Compare</Link>
        </nav>
        <Link href="/#sandbox" className="relative group overflow-hidden rounded-xl p-[1px] font-semibold text-xs sm:text-sm">
          <span className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 opacity-80 group-hover:opacity-100 transition-all" />
          <span className="relative px-4 py-2.5 rounded-[11px] bg-[#07090E] flex items-center gap-2 group-hover:bg-transparent text-white">Try the Sandbox</span>
        </Link>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-800/80 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-10 pb-10 border-b border-gray-800/80">
          <div className="space-y-4 md:col-span-2 pr-8">
            <span className="flex items-center gap-2 text-white font-bold text-lg" style={{ fontFamily: "'JetBrains Mono', monospace" }}><i data-lucide="shield-check" className="w-5 h-5 text-emerald-400" />AEGIS</span>
            <p className="text-sm text-gray-400 max-w-sm">The neutral, portable trust and delegation layer enforcing spending caps, scope isolation, and universal kill switches for AI agents.</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {[
                { label: 'App Store', slug: 'apple', color: 'ffffff' },
                { label: 'Google Play', slug: 'googleplay', color: null },
              ].map(v => (
                <span key={v.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/80 border border-gray-800 text-gray-500 cursor-not-allowed">
                  <img src={`https://cdn.simpleicons.org/${v.slug}${v.color ? '/' + v.color : ''}`} alt="" className="w-4 h-4" />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[9px] uppercase tracking-wider text-gray-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Coming soon</span>
                    <span className="text-xs font-semibold text-gray-400">{v.label}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Platform</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/#platform" className="hover:text-emerald-400">Access Governance</Link></li>
              <li><Link href="/#sandbox" className="hover:text-emerald-400">Policy Simulator</Link></li>
              <li><Link href="/#receipt" className="hover:text-emerald-400">Universal Receipt</Link></li>
              <li><Link href="/#neutral-advantage" className="hover:text-emerald-400">Rival Neutrality</Link></li>
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Governance</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/compare" className="hover:text-emerald-400">Compare to Real Platforms</Link></li>
              <li><a href="https://github.com/jayblast-spec/aegis" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400">Source Code</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <span>© 2026 Aegis. All rights reserved.</span>
          <span className="text-center">Aegis is an independent, conceptual trust layer. All AI and platform trademarks belong to their respective owners.</span>
          <span className="uppercase tracking-wider">Early-stage protocol design</span>
        </div>
      </div>
    </footer>
  )
}
