import { createFileRoute } from '@tanstack/react-router'
import { VaultPage } from '@/features/vault/page'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/vault/')({
  beforeLoad: () => requirePro(),
  component: VaultPage,
})
