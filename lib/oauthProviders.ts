// Generic real-OAuth connector registry. Aegis's kill switch is only as
// credible as the number of real providers it can actually revoke against.
// Adding a new one is: register an OAuth app with that provider, add a
// {clientId, clientSecretEnvVar} entry here, done - no new routes, no new
// pages, no schema changes. The exchange/revoke API routes and the OAuth
// callback page are all written generically against this registry.

export type OAuthProvider = {
  id: string
  label: string
  icon: string
  clientId: string
  clientSecretEnvVar: string
  authUrl: string
  tokenUrl: string
  revokeUrl: (token: string) => string
  userinfoUrl: string | null
  scope: string
  extraAuthParams?: Record<string, string>
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: {
    id: 'google',
    label: 'Google (Gmail, read-only)',
    icon: 'mail-check',
    clientId: '573684736419-0qipj1c0kilbvc86sm5p1e8d48ktsgnv.apps.googleusercontent.com',
    clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: token => `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    userinfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  // Next real connector goes here, e.g.:
  // microsoft: { id: 'microsoft', label: 'Microsoft (Outlook, read-only)', ... }
}

export function oauthRedirectUri(origin: string) {
  return `${origin}/oauth/callback`
}

export function buildOAuthAuthUrl(providerId: string, origin: string) {
  const provider = OAUTH_PROVIDERS[providerId]
  if (!provider) throw new Error(`Unknown OAuth provider: ${providerId}`)
  const state = btoa(JSON.stringify({ provider: providerId }))
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: oauthRedirectUri(origin),
    response_type: 'code',
    scope: provider.scope,
    state,
    ...(provider.extraAuthParams ?? {}),
  })
  return `${provider.authUrl}?${params.toString()}`
}
