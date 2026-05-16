import { createFileRoute } from '@tanstack/react-router'
import { StatusPageFeature } from '@/features/status-page'

export const Route = createFileRoute('/_authenticated/status-page/')({
  component: StatusPageFeature,
})
