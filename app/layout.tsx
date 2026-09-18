import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Aegis — Your digital embassy',
  description: 'Portable authority for the agentic world.',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0e12' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html> }
