import { redirect } from '@tanstack/react-router'
import { isPlanPro, usePlanStore } from '@/stores/plan-store'

export function requirePro() {
  if (!isPlanPro()) {
    throw redirect({ to: '/upgrade', replace: true })
  }
}

export function requireEnterprise() {
  const { plan } = usePlanStore.getState()
  if (plan !== 'enterprise') {
    throw redirect({ to: '/upgrade', replace: true })
  }
}

export const FREE_MONITOR_LIMIT = 5
