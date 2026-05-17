import { createFileRoute } from '@tanstack/react-router'
import { AgentsPage } from '@/features/agents'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/agents/')({
  beforeLoad: () => requirePro(),
  component: AgentsPage,
})
