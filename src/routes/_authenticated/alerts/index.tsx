import { createFileRoute } from '@tanstack/react-router'
import { AlertsPage } from '@/features/alerts'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/alerts/')({
  beforeLoad: () => requirePro(),
  component: AlertsPage,
})
