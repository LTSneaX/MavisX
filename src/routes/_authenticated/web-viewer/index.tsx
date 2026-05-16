import { createFileRoute } from '@tanstack/react-router'
import { WebViewer } from '@/features/web-viewer'

export const Route = createFileRoute('/_authenticated/web-viewer/')({
  component: WebViewer,
})
