import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://jrcbnybnbsbwffxfflvi.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyY2JueWJuYnNid2ZmeGZmbHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMzQzNzQsImV4cCI6MjA5NDYxMDM3NH0.3LcRWfqpIKVtH6-M2-_9vpyM2RUernKpmsr83K493XY'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
)

export function parsePlanFromToken(accessToken: string): 'free' | 'pro' | 'enterprise' {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    const plan = payload?.app_metadata?.plan
    if (plan === 'pro' || plan === 'enterprise') return plan
  } catch {
    // ignore malformed token
  }
  return 'free'
}
