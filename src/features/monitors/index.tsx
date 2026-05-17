import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/db'
import { Plus } from 'lucide-react'
import { MonitorDeleteDialog } from './components/monitor-delete-dialog'
import { MonitorMutateDrawer } from './components/monitor-mutate-drawer'
import { MonitorsProvider, useMonitors } from './components/monitors-provider'
import { MonitorsTable } from './components/monitors-table'

function MonitorsContent() {
  const { open, setOpen, currentRow, setCurrentRow } = useMonitors()
  const queryClient = useQueryClient()

  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => db.listMonitorsWithStatus(),
    refetchInterval: 10_000,
  })

  const createMutation = useMutation({
    mutationFn: (values: Parameters<typeof db.createMonitor>[0]) => db.createMonitor(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitors'] }),
  })

  const updateMutation = useMutation({
    mutationFn: (values: Parameters<typeof db.updateMonitor>[0]) => db.updateMonitor(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitors'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => db.deleteMonitor(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitors'] }),
  })

  async function handleSubmit(
    values: { name: string; type: string; target: string; interval_seconds: number; timeout_seconds: number; config: string | null | undefined },
    id?: string
  ) {
    const config = values.config ?? undefined
    if (id) {
      await updateMutation.mutateAsync({ id, ...values, config })
    } else {
      await createMutation.mutateAsync({ ...values, config })
    }
  }

  const upCount = monitors.filter((m) => m.last_status === 'up' && m.enabled).length
  const downCount = monitors.filter((m) => m.last_status === 'down' && m.enabled).length

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-3 me-auto'>
          <span className='font-semibold'>Monitors</span>
          {downCount > 0 && (
            <Badge className='border-0 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400'>
              {downCount} down
            </Badge>
          )}
          {downCount === 0 && upCount > 0 && (
            <Badge className='border-0 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400'>
              All operational
            </Badge>
          )}
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h2 className='text-lg font-semibold tracking-tight'>Monitors</h2>
            <p className='text-muted-foreground text-xs'>
              HTTP, port, DNS, SSL, ping, and cron job checks.
            </p>
          </div>
          <Button size='sm' onClick={() => { setCurrentRow(null); setOpen('create') }}>
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            Add monitor
          </Button>
        </div>

        {isLoading ? (
          <div className='text-muted-foreground text-sm'>Loading...</div>
        ) : (
          <MonitorsTable data={monitors} />
        )}
      </Main>

      <MonitorMutateDrawer
        open={open === 'create' || open === 'update'}
        onOpenChange={(v) => !v && setOpen(null)}
        currentRow={open === 'update' ? currentRow : null}
        onSubmit={handleSubmit}
      />

      <MonitorDeleteDialog
        open={open === 'delete'}
        onOpenChange={(v) => !v && setOpen(null)}
        currentRow={currentRow}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
      />
    </>
  )
}

export function Monitors() {
  return (
    <MonitorsProvider>
      <MonitorsContent />
    </MonitorsProvider>
  )
}
