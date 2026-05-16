import { createFileRoute } from '@tanstack/react-router'
import { MonitorDetail } from '@/features/monitors/detail'

export const Route = createFileRoute('/_authenticated/monitors/$monitorId')({
  component: function MonitorDetailRoute() {
    const { monitorId } = Route.useParams()
    return <MonitorDetail monitorId={monitorId} />
  },
})
