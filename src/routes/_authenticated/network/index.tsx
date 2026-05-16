import { createFileRoute } from '@tanstack/react-router'
import { NetworkToolkit } from '@/features/network'

export const Route = createFileRoute('/_authenticated/network/')({
  component: NetworkToolkit,
})
