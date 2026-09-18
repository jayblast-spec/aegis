import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SITE_URL } from '@/lib/site'
import LucideLoader from './components/LucideLoader'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Aegis — Your digital embassy',
  description: 'Portable authority for the agentic world.',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0e12' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <LucideLoader />
        <style>{`.aegis-home a { text-decoration: none; color: inherit; }`}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
