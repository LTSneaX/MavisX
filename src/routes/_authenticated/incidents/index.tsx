import { createFileRoute } from '@tanstack/react-router'
import { Incidents } from '@/features/incidents'

export const Route = createFileRoute('/_authenticated/incidents/')({
  component: Incidents,
})
