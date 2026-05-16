import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table'
import { db, type Incident } from '@/lib/db'

type IncidentRow = Incident & { monitor_name: string; monitor_type: string }

const MONITOR_TYPE_LABELS: Record<string, string> = {
  http: 'HTTP', port: 'Port', ping: 'Ping', dns: 'DNS', ssl: 'SSL', cron: 'Cron',
}

function formatDuration(startedAt: string, resolvedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now()
  const ms = end - start
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const columns: ColumnDef<IncidentRow>[] = [
  {
    id: 'indicator',
    header: '',
    cell: ({ row }) => (
      <div
        className={`w-1 h-8 rounded-full ${row.original.status === 'open' ? 'bg-red-500' : 'bg-emerald-500'}`}
      />
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) =>
      row.original.status === 'open' ? (
        <Badge className='border-0 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400'>Ongoing</Badge>
      ) : (
        <Badge className='border-0 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400'>Resolved</Badge>
      ),
  },
  {
    id: 'monitor',
    header: 'Monitor',
    cell: ({ row }) => (
      <div className='flex flex-col'>
        <span className='font-medium'>{row.original.monitor_name ?? 'Unknown'}</span>
        <span className='text-muted-foreground text-xs font-mono'>
          {MONITOR_TYPE_LABELS[row.original.monitor_type] ?? row.original.monitor_type}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'started_at',
    header: 'Started',
    cell: ({ row }) => (
      <span className='text-sm tabular-nums'>{formatDate(row.original.started_at)}</span>
    ),
  },
  {
    id: 'duration',
    header: 'Duration',
    cell: ({ row }) => (
      <span className='text-sm tabular-nums font-mono'>
        {formatDuration(row.original.started_at, row.original.resolved_at)}
      </span>
    ),
  },
  {
    accessorKey: 'cause',
    header: 'Cause',
    cell: ({ row }) => (
      <span className='text-muted-foreground max-w-xs truncate text-sm'>
        {row.original.cause ?? '—'}
      </span>
    ),
  },
]

type FilterType = 'all' | 'open' | 'resolved'

export function Incidents() {
  const [filter, setFilter] = useState<FilterType>('all')

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents-detail', filter],
    queryFn: () => db.listIncidentsWithMonitor(filter === 'all' ? undefined : filter),
    refetchInterval: 10_000,
  })

  const table = useReactTable({
    data: incidents,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const openCount = incidents.filter((i) => i.status === 'open').length

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <span className='font-semibold'>Incidents</span>
          {openCount > 0 && (
            <Badge className='border-0 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400'>
              {openCount} ongoing
            </Badge>
          )}
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h2 className='text-lg font-semibold tracking-tight'>Incidents</h2>
            <p className='text-muted-foreground text-xs'>Active and resolved outages across all monitors.</p>
          </div>
        </div>

        <div className='flex gap-2'>
          {(['all', 'open', 'resolved'] as FilterType[]).map((f) => (
            <Button
              key={f}
              size='sm'
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className='capitalize'
            >
              {f}
              {f === 'open' && openCount > 0 && (
                <span className='ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white'>
                  {openCount}
                </span>
              )}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className='text-muted-foreground text-sm'>Loading...</div>
        ) : incidents.length === 0 ? (
          <div className='border-muted flex min-h-64 items-center justify-center rounded-lg border border-dashed'>
            <p className='text-muted-foreground text-sm'>
              {filter === 'open' ? 'No active incidents. All monitors healthy.' : 'No incidents recorded.'}
            </p>
          </div>
        ) : (
          <div className='flex flex-1 flex-col gap-4'>
            <div className='overflow-hidden rounded-lg border border-border/60'>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className='bg-muted/30 hover:bg-muted/30'>
                      {hg.headers.map((h) => (
                        <TableHead key={h.id} className='text-xs font-medium tracking-wide'>
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className='border-border/40'>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={cell.column.id === 'indicator' ? 'pl-2 pr-0 py-3 w-3' : 'py-3'}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DataTablePagination table={table} className='mt-auto' />
          </div>
        )}
      </Main>
    </>
  )
}
