import { createFileRoute } from '@tanstack/react-router'
import { SshTerminalPage } from '@/features/ssh'
import { requirePro } from '@/lib/plan'

export const Route = createFileRoute('/_authenticated/ssh/')({
  beforeLoad: () => requirePro(),
  validateSearch: (search: Record<string, unknown>) => ({
    host: typeof search.host === 'string' ? search.host : undefined,
    port: typeof search.port === 'string' ? Number(search.port) : undefined,
    username: typeof search.username === 'string' ? search.username : undefined,
    ws_workspace_id: typeof search.ws_workspace_id === 'string' ? search.ws_workspace_id : undefined,
    ws_vault_item_id: typeof search.ws_vault_item_id === 'string' ? search.ws_vault_item_id : undefined,
  }),
  component: SshTerminalPage,
})
