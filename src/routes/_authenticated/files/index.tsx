import { createFileRoute } from '@tanstack/react-router'
import { FileManager } from '@/features/file-manager'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/files/')({
  beforeLoad: () => requirePro(),
  component: FileManager,
})
