import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { OAUTH_PROVIDERS } from '@/lib/oauthProviders'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing session' }, { status: 401 })
  }
  const accessToken = auth.slice('Bearer '.length)

  const { connectionId } = await req.json()
  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  // RLS scopes this to rows owned by the caller - no cross-user access possible.
  const { data: connection, error: fetchError } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('id', connectionId)
    .single()
  if (fetchError || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }
  if (connection.status === 'revoked') {
    return NextResponse.json({ alreadyRevoked: true })
  }

  const provider = OAUTH_PROVIDERS[connection.provider]
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider: ${connection.provider}` }, { status: 500 })
  }

  // The real revoke: tells the provider's own OAuth server to invalidate
  // this token. Verifiable independently, not just a database flag.
  const tokenToRevoke = connection.refresh_token || connection.access_token
  const revokeRes = await fetch(provider.revokeUrl(tokenToRevoke), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const providerRevokeOk = revokeRes.ok

  const nowIso = new Date().toISOString()
  await supabase
    .from('oauth_connections')
    .update({ status: 'revoked', revoked_at: nowIso })
    .eq('id', connectionId)

  if (connection.delegation_id) {
    await supabase
      .from('delegations')
      .update({ status: 'revoked', revoked_at: nowIso })
      .eq('id', connection.delegation_id)
    await supabase.from('delegation_events').insert({
      delegation_id: connection.delegation_id,
      user_id: userData.user.id,
      event_type: 'revoked',
      detail: providerRevokeOk
        ? `Revoked via ${provider.label} OAuth revoke endpoint`
        : `Marked revoked locally; ${provider.label} revoke call did not return OK`,
    })
  }

  return NextResponse.json({ revoked: true, providerRevokeOk })
}
