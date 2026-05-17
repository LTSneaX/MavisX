import { createFileRoute } from '@tanstack/react-router'
import { DockerManager } from '@/features/docker'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/docker/')({
  beforeLoad: () => requirePro(),
  component: DockerManager,
})
