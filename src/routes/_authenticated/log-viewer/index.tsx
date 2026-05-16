import { createFileRoute } from '@tanstack/react-router'
import { LogViewer } from '@/features/log-viewer'

export const Route = createFileRoute('/_authenticated/log-viewer/')({
  component: LogViewer,
})
