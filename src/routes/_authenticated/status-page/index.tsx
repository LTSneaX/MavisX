import { createFileRoute } from '@tanstack/react-router'
import { StatusPageFeature } from '@/features/status-page'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/status-page/')({
  beforeLoad: () => requirePro(),
  component: StatusPageFeature,
})
