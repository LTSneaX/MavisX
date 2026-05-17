import { redirect } from '@tanstack/react-router'
import { isPlanPro } from '@/stores/plan-store'

export function requirePro() {
  if (!isPlanPro()) {
    throw redirect({ to: '/upgrade', replace: true })
  }
}
