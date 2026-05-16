import { createFileRoute } from '@tanstack/react-router'
import { ServerCog } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/agents/')({
  component: AgentsPage,
})

function AgentsPage() {
  return (
    <div className='flex h-full flex-col'>
      <div className='border-b px-6 py-4'>
        <h1 className='text-xl font-semibold'>Agents</h1>
        <p className='text-sm text-muted-foreground'>Server metrics — CPU, RAM, disk, load, Docker, systemd</p>
      </div>
      <div className='flex flex-1 flex-col items-center justify-center gap-3 text-center'>
        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-muted'>
          <ServerCog className='h-6 w-6 text-muted-foreground' />
        </div>
        <p className='text-sm font-medium'>Agent Metrics</p>
        <p className='text-xs text-muted-foreground max-w-xs'>
          Deploy the MavisX Go agent on any server. Get real-time CPU, RAM, disk, load, Docker container, and systemd service metrics.
        </p>
        <span className='rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground'>Coming in Phase 3</span>
      </div>
    </div>
  )
}
