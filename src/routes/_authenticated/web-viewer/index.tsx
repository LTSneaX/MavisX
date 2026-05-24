import { createFileRoute } from '@tanstack/react-router'
import { WebViewer } from '@/features/web-viewer'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/web-viewer/')({
  beforeLoad: () => requirePro(),
  validateSearch: (search: Record<string, unknown>) => ({
    url: typeof search.url === 'string' ? search.url : undefined,
    name: typeof search.name === 'string' ? search.name : undefined,
  }),
  component: WebViewer,
})
