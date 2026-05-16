import { createFileRoute } from '@tanstack/react-router'
import { Monitors } from '@/features/monitors'

export const Route = createFileRoute('/_authenticated/monitors/')({
  component: Monitors,
})
