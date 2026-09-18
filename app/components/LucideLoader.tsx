'use client'

import Script from 'next/script'

export default function LucideLoader() {
  return (
    <Script
      src="https://unpkg.com/lucide@latest"
      strategy="afterInteractive"
      onLoad={() => { (window as any).lucide?.createIcons?.() }}
    />
  )
}
