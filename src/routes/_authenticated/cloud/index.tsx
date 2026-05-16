import { createFileRoute } from '@tanstack/react-router'
import { Cloud } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/cloud/')({
  component: CloudPage,
})

function CloudPage() {
  return (
    <div className='flex h-full flex-col'>
      <div className='border-b px-6 py-4'>
        <h1 className='text-xl font-semibold'>MavisX Cloud</h1>
        <p className='text-sm text-muted-foreground'>Team workspaces, encrypted sync, up to 50 seats</p>
      </div>
      <div className='flex flex-1 flex-col items-center justify-center gap-3 text-center'>
        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-muted'>
          <Cloud className='h-6 w-6 text-muted-foreground' />
        </div>
        <p className='text-sm font-medium'>MavisX Cloud</p>
        <p className='text-xs text-muted-foreground max-w-xs'>
          End-to-end encrypted team sync. Share monitors, connections, and alert rules across up to 50 seats. Self-hostable.
        </p>
        <span className='rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground'>Coming in Phase 9</span>
      </div>
    </div>
  )
}
