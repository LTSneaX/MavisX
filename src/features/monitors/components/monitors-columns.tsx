import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type MonitorWithStatus } from '@/lib/db'
import { MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/db'
import { useMonitors } from './monitors-provider'

const MONITOR_TYPE_LABELS: Record<string, string> = {
  http: 'HTTP',
  port: 'Port',
  ping: 'Ping',
  dns: 'DNS',
  ssl: 'SSL',
  cron: 'Cron',
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

function StatusBadge({ row }: { row: MonitorWithStatus }) {
  if (!row.enabled) {
    return (
      <Badge variant='secondary' className='text-xs font-medium'>
        Paused
      </Badge>
    )
  }
  switch (row.last_status) {
    case 'up':
      return (
        <Badge className='border-0 bg-green-500/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-green-500 hover:bg-green-500/15'>
          UP
        </Badge>
      )
    case 'down':
      return (
        <Badge className='border-0 bg-red-500/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-red-500 hover:bg-red-500/15'>
          DOWN
        </Badge>
      )
    case 'degraded':
      return (
        <Badge className='border-0 bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-yellow-500 hover:bg-yellow-500/15'>
          DEGRADED
        </Badge>
      )
    default:
      return (
        <Badge variant='outline' className='text-muted-foreground text-xs'>
          Pending
        </Badge>
      )
  }
}

function RowActions({ row }: { row: MonitorWithStatus }) {
  const { setOpen, setCurrentRow } = useMonitors()
  const queryClient = useQueryClient()

  async function handleCheckNow() {
    await db.checkMonitorNow(row.id)
    queryClient.invalidateQueries({ queryKey: ['monitors'] })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='h-8 w-8 opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100'
          aria-label={`Actions for ${row.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={handleCheckNow}>
          <RefreshCw className='mr-2 h-4 w-4' />
          Check now
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(row)
            setOpen('update')
          }}
        >
          <Pencil className='mr-2 h-4 w-4' />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='text-destructive focus:text-destructive'
          onClick={() => {
            setCurrentRow(row)
            setOpen('delete')
          }}
        >
          <Trash2 className='mr-2 h-4 w-4' />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NameCell({ row }: { row: MonitorWithStatus }) {
  return (
    <span className='font-medium'>{row.name}</span>
  )
}

export const monitorsColumns: ColumnDef<MonitorWithStatus>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <NameCell row={row.original} />,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant='outline' className='font-mono text-[11px] tracking-widest'>
        {MONITOR_TYPE_LABELS[row.getValue('type')] ?? row.getValue('type')}
      </Badge>
    ),
  },
  {
    accessorKey: 'target',
    header: 'Target',
    cell: ({ row }) => (
      <span className='text-muted-foreground font-mono text-xs'>
        {row.getValue('target')}
      </span>
    ),
  },
  {
    accessorKey: 'interval_seconds',
    header: 'Interval',
    cell: ({ row }) => (
      <span className='text-muted-foreground tabular-nums text-sm'>
        {formatInterval(row.getValue('interval_seconds'))}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge row={row.original} />,
  },
  {
    id: 'actions',
    cell: ({ row }) => <RowActions row={row.original} />,
  },
]
