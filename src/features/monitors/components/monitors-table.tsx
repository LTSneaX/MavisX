import { useState } from 'react'
import {
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useNavigate } from '@tanstack/react-router'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table'
import { Input } from '@/components/ui/input'
import { type MonitorWithStatus } from '@/lib/db'
import { monitorsColumns } from './monitors-columns'
import { Search } from 'lucide-react'

type MonitorsTableProps = {
  data: MonitorWithStatus[]
}

export function MonitorsTable({ data }: MonitorsTableProps) {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = useState('')

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: monitorsColumns,
    state: { sorting, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='relative max-w-sm'>
        <Search className='text-muted-foreground absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2' aria-hidden='true' />
        <Input
          placeholder='Search monitors...'
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className='pl-9'
          aria-label='Search monitors'
        />
      </div>
      <div className='overflow-hidden rounded-lg border border-border/60'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className='bg-muted/30 hover:bg-muted/30'>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className='text-xs font-medium tracking-wide'>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className='group/row border-border/50 transition-colors cursor-pointer'
                  onClick={() => navigate({ to: '/monitors/$monitorId', params: { monitorId: row.original.id } })}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className='py-3'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={monitorsColumns.length}
                  className='text-muted-foreground h-32 text-center text-sm'
                >
                  No monitors yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} className='mt-auto' />
    </div>
  )
}
