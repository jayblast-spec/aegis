import { createClient } from '@supabase/supabase-js'

// Used only by the legacy Google OAuth connector. The build must not depend on
// these variables, so a placeholder client is created when they are absent.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'not-configured', {
  auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
})

export type DelegationRow = {
  id: string
  user_id: string
  agent_name: string
  scope_email: boolean
  scope_bank: boolean
  scope_pii: boolean
  spending_cap_cents: number
  approval_trigger_cents: number | null
  status: 'active' | 'revoked'
  created_at: string
  revoked_at: string | null
}
