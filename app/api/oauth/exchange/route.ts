import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { OAUTH_PROVIDERS, oauthRedirectUri } from '@/lib/oauthProviders'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing session' }, { status: 401 })
  }
  const accessToken = auth.slice('Bearer '.length)

  const { code, origin, provider: providerId } = await req.json()
  if (!code || !origin || !providerId) {
    return NextResponse.json({ error: 'Missing code, origin, or provider' }, { status: 400 })
  }
  const provider = OAUTH_PROVIDERS[providerId]
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 })
  }
  const clientSecret = process.env[provider.clientSecretEnvVar]
  if (!clientSecret) {
    return NextResponse.json({ error: `Server missing ${provider.clientSecretEnvVar}` }, { status: 500 })
  }

  // A per-request client scoped to the caller's own session via RLS -
  // no service-role key involved. Every write below happens as this user.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  const userId = userData.user.id

  const tokenRes = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: oauthRedirectUri(origin),
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok) {
    return NextResponse.json({ error: `${provider.label} token exchange failed`, detail: tokenJson }, { status: 400 })
  }

  const { access_token, refresh_token, scope, expires_in } = tokenJson

  let accountEmail: string | null = null
  if (provider.userinfoUrl) {
    const userinfoRes = await fetch(provider.userinfoUrl, { headers: { Authorization: `Bearer ${access_token}` } })
    if (userinfoRes.ok) {
      const userinfo = await userinfoRes.json()
      accountEmail = userinfo.email ?? null
    }
  }

  const { data: delegation, error: delegationError } = await supabase
    .from('delegations')
    .insert({
      user_id: userId,
      agent_name: `${provider.label} (real connection)`,
      scope_email: true,
      scope_bank: false,
      scope_pii: false,
      spending_cap_cents: 0,
      approval_trigger_cents: null,
    })
    .select()
    .single()
  if (delegationError) {
    return NextResponse.json({ error: 'Failed to record delegation', detail: delegationError.message }, { status: 500 })
  }

  const { data: connection, error: connectionError } = await supabase
    .from('oauth_connections')
    .insert({
      user_id: userId,
      delegation_id: delegation.id,
      provider: providerId,
      account_email: accountEmail,
      access_token,
      refresh_token: refresh_token ?? null,
      scope: scope ?? provider.scope,
      token_expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
    })
    .select()
    .single()
  if (connectionError) {
    return NextResponse.json({ error: 'Failed to store connection', detail: connectionError.message }, { status: 500 })
  }

  return NextResponse.json({ connection, delegation })
}
