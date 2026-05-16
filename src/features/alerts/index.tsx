import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { db, type AlertRule, type Monitor } from '@/lib/db'
import { buildColumns, type AlertRuleRow } from './components/alert-rule-columns'
import { AlertRuleDialog } from './components/alert-rule-dialog'

export function AlertsPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AlertRule | null>(null)
  const [deleting, setDeleting] = useState<AlertRule | null>(null)

  const { data: rules = [] } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => db.listAlertRules(),
    refetchInterval: 15_000,
  })

  const { data: monitors = [] } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => db.listMonitors(),
  })

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: () => db.getWorkspace(),
  })
  const plan = workspace?.plan ?? 'free'

  const monitorMap = useMemo(
    () => new Map(monitors.map((m: Monitor) => [m.id, m.name])),
    [monitors]
  )

  const rows: AlertRuleRow[] = rules.map((r: AlertRule) => ({
    ...r,
    monitor_name: r.monitor_id ? (monitorMap.get(r.monitor_id) ?? r.monitor_id) : null,
  }))

  const columns = useMemo(
    () =>
      buildColumns({
        onEdit: (rule) => { setEditing(rule); setDialogOpen(true) },
        onDelete: (rule) => setDeleting(rule),
      }),
    []
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  async function confirmDelete() {
    if (!deleting) return
    await db.deleteAlertRule(deleting.id)
    await qc.invalidateQueries({ queryKey: ['alert-rules'] })
    setDeleting(null)
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <span className='font-semibold'>Alert Rules</span>
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-6'>
        <div className='flex items-start justify-between'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Alert Rules</h2>
            <p className='text-muted-foreground text-sm'>
              Get notified across 16 channels when monitors change state.
            </p>
          </div>
          <Button
            size='sm'
            onClick={() => { setEditing(null); setDialogOpen(true) }}
          >
            <Plus className='mr-2 h-4 w-4' />
            New rule
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className='border-muted flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center'>
            <p className='text-muted-foreground text-sm'>No alert rules yet.</p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => { setEditing(null); setDialogOpen(true) }}
            >
              <Plus className='mr-2 h-4 w-4' />
              Create your first rule
            </Button>
          </div>
        ) : (
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Main>

      <AlertRuleDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null) }}
        rule={editing}
        monitors={monitors}
        plan={plan}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alert rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This rule will no longer fire notifications. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
