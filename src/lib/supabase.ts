import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://jrcbnybnbsbwffxfflvi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyY2JueWJuYnNid2ZmeGZmbHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMzQzNzQsImV4cCI6MjA5NDYxMDM3NH0.3LcRWfqpIKVtH6-M2-_9vpyM2RUernKpmsr83K493XY',
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
