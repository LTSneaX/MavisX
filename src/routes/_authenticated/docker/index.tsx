import { createFileRoute } from '@tanstack/react-router'
import { Container } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/docker/')({
  component: DockerPage,
})

function DockerPage() {
  return (
    <div className='flex h-full flex-col'>
      <div className='border-b px-6 py-4'>
        <h1 className='text-xl font-semibold'>Docker</h1>
        <p className='text-sm text-muted-foreground'>Container management — local socket or remote TCP+TLS</p>
      </div>
      <div className='flex flex-1 flex-col items-center justify-center gap-3 text-center'>
        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-muted'>
          <Container className='h-6 w-6 text-muted-foreground' />
        </div>
        <p className='text-sm font-medium'>Docker Manager</p>
        <p className='text-xs text-muted-foreground max-w-xs'>
          Manage containers, images, volumes, and networks. Start, stop, restart, tail logs. Local socket or remote TCP+TLS.
        </p>
        <span className='rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground'>Coming in Phase 4</span>
      </div>
    </div>
  )
}
