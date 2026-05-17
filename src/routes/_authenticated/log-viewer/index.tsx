import { createFileRoute } from '@tanstack/react-router'
import { LogViewer } from '@/features/log-viewer'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/log-viewer/')({
  beforeLoad: () => requirePro(),
  component: LogViewer,
})
