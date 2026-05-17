import { createFileRoute } from '@tanstack/react-router'
import { DockerManager } from '@/features/docker'

export const Route = createFileRoute('/_authenticated/docker/')({
  component: DockerManager,
})
