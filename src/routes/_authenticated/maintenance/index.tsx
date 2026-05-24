import { createFileRoute } from '@tanstack/react-router'
import { MaintenanceWindows } from '@/features/maintenance'

export const Route = createFileRoute('/_authenticated/maintenance/')({
  component: MaintenanceWindows,
})
