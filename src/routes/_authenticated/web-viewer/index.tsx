import { createFileRoute } from '@tanstack/react-router'
import { WebViewer } from '@/features/web-viewer'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/web-viewer/')({
  beforeLoad: () => requirePro(),
  component: WebViewer,
})
