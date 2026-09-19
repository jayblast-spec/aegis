'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { OAUTH_PROVIDERS } from '@/lib/oauthProviders'

export default function OAuthCallbackPage() {
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working')
  const [message, setMessage] = useState('Finishing the real connection…')

  useEffect(() => {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const stateParam = url.searchParams.get('state')
    const oauthError = url.searchParams.get('error')

    if (oauthError) {
      setStatus('error')
      setMessage(`The provider returned an error: ${oauthError}`)
      return
    }
    if (!code || !stateParam) {
      setStatus('error')
      setMessage('Missing authorization code or state from the provider redirect.')
      return
    }

    let providerId: string
    try {
      providerId = JSON.parse(atob(stateParam)).provider
    } catch {
      setStatus('error')
      setMessage('Could not read which provider this connection was for.')
      return
    }
    const provider = OAUTH_PROVIDERS[providerId]

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!session) {
        setStatus('error')
        setMessage('Your Aegis session expired during the redirect. Sign in again and retry.')
        return
      }

      const res = await fetch('/api/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ code, origin: window.location.origin, provider: providerId }),
      })
      const json = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(json.error || 'Failed to complete the connection.')
        return
      }

      setStatus('ok')
      setMessage(`Your ${provider?.label ?? providerId} account is now really connected to Aegis.`)
    })()
  }, [])

  return (
    <div className="min-h-screen bg-[#07090E] text-gray-100 flex items-center justify-center px-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-md w-full rounded-2xl p-8 text-center space-y-4" style={{ background: 'rgba(13,17,23,.85)', border: '1px solid rgba(255,255,255,.08)' }}>
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${status === 'error' ? 'bg-rose-500/20' : 'bg-emerald-500/20'}`}>
          <i data-lucide={status === 'error' ? 'shield-off' : status === 'ok' ? 'shield-check' : 'loader-2'} className={`w-6 h-6 ${status === 'error' ? 'text-rose-400' : 'text-emerald-400'} ${status === 'working' ? 'animate-spin' : ''}`} />
        </div>
        <h1 className="text-lg font-bold text-white">{status === 'ok' ? 'Connected' : status === 'error' ? 'Something went wrong' : 'Connecting…'}</h1>
        <p className="text-sm text-gray-400">{message}</p>
        <Link href="/#receipt" className="inline-block mt-2 text-sm text-emerald-400 hover:underline">Back to Aegis</Link>
      </div>
    </div>
  )
}
