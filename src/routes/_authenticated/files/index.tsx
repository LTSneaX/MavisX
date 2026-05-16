import { createFileRoute } from '@tanstack/react-router'
import { FolderOpen } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/files/')({
  component: FilesPage,
})

function FilesPage() {
  return (
    <div className='flex h-full flex-col'>
      <div className='border-b px-6 py-4'>
        <h1 className='text-xl font-semibold'>File Manager</h1>
        <p className='text-sm text-muted-foreground'>Dual-pane SFTP/FTP file browser — drag & drop, transfer queue</p>
      </div>
      <div className='flex flex-1 flex-col items-center justify-center gap-3 text-center'>
        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-muted'>
          <FolderOpen className='h-6 w-6 text-muted-foreground' />
        </div>
        <p className='text-sm font-medium'>SFTP / FTP File Manager</p>
        <p className='text-xs text-muted-foreground max-w-xs'>
          Dual-pane local ↔ remote file browser. Drag & drop, transfer queue, bookmarks.
        </p>
        <span className='rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground'>Coming in Phase 1</span>
      </div>
    </div>
  )
}
