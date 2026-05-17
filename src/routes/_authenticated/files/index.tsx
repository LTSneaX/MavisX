import { createFileRoute } from '@tanstack/react-router'
import { FileManager } from '@/features/file-manager'

export const Route = createFileRoute('/_authenticated/files/')({
  component: FileManager,
})
