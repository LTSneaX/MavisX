import { createFileRoute } from '@tanstack/react-router'
import { Connections } from '@/features/connections'

export const Route = createFileRoute('/_authenticated/connections/')({
  component: Connections,
})
