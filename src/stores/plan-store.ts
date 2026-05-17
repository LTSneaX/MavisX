import { create } from 'zustand'
import { supabase, parsePlanFromToken } from '@/lib/supabase'

export type Plan = 'free' | 'pro' | 'enterprise'

interface PlanState {
  plan: Plan
  loaded: boolean
  setPlan: (plan: Plan) => void
}

export const usePlanStore = create<PlanState>()((set) => ({
  plan: 'free',
  loaded: false,
  setPlan: (plan) => set({ plan, loaded: true }),
}))

export function isPlanPro(): boolean {
  const { plan } = usePlanStore.getState()
  return plan === 'pro' || plan === 'enterprise'
}

export async function resolvePlan(userId: string, accessToken: string): Promise<Plan> {
  // Try JWT first
  const jwtPlan = parsePlanFromToken(accessToken)
  console.log('[plan] JWT plan:', jwtPlan)
  if (jwtPlan !== 'free') return jwtPlan

  // Fall back to DB (when JWT hook isn't enabled)
  const { data, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single()

  console.log('[plan] DB plan:', data?.plan, 'error:', error?.message)
  const dbPlan = data?.plan
  if (dbPlan === 'pro' || dbPlan === 'enterprise') return dbPlan
  return 'free'
}
