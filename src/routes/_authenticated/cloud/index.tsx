import { createFileRoute } from '@tanstack/react-router'
import { WorkspacePage } from '@/features/workspace'
import { requireEnterprise } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/cloud/')({
  beforeLoad: () => requireEnterprise(),
  component: WorkspacePage,
})
