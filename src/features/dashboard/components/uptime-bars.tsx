import { useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type RawRow = {
  id: string
  name: string
  day: string | null
  up_count: number
  down_count: number
  degraded_count: number
  check_count: number
}

type DayStatus = 'up' | 'down' | 'degraded' | 'no-data'

type MonitorBar = {
  id: string
  name: string
  days: { date: string; status: DayStatus; uptimePct: number }[]
  uptimePct: number
}

const STATUS_COLOR: Record<DayStatus, string> = {
  up: 'bg-green-500',
  down: 'bg-red-500',
  degraded: 'bg-yellow-400',
  'no-data': 'bg-muted',
}

function dayStatus(row: RawRow): DayStatus {
  if (!row.check_count) return 'no-data'
  const pct = row.up_count / row.check_count
  if (pct >= 0.95) return 'up'
  if (pct >= 0.5) return 'degraded'
  return 'down'
}

function buildDateRange(days: number): string[] {
  const result: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    result.push(d.toISOString().slice(0, 10))
  }
  return result
}

type Props = {
  rows: RawRow[]
  days?: number
}

export function UptimeBars({ rows, days = 45 }: Props) {
  const monitors = useMemo<MonitorBar[]>(() => {
    const dateRange = buildDateRange(days)
    const byMonitor = new Map<string, {
      name: string
      byDay: Map<string, { status: DayStatus; pct: number }>
      totalUp: number
      totalChecks: number
    }>()

    for (const row of rows) {
      if (!row.day) continue
      if (!byMonitor.has(row.id)) {
        byMonitor.set(row.id, { name: row.name, byDay: new Map(), totalUp: 0, totalChecks: 0 })
      }
      const entry = byMonitor.get(row.id)!
      const pct = row.check_count > 0 ? row.up_count / row.check_count : 0
      entry.byDay.set(row.day, { status: dayStatus(row), pct })
      entry.totalUp += row.up_count
      entry.totalChecks += row.check_count
    }

    return Array.from(byMonitor.entries()).map(([id, { name, byDay, totalUp, totalChecks }]) => {
      const dayStatuses = dateRange.map((date) => {
        const d = byDay.get(date)
        return {
          date,
          status: d?.status ?? ('no-data' as DayStatus),
          uptimePct: d ? Math.round(d.pct * 1000) / 10 : 0,
        }
      })
      const uptimePct = totalChecks > 0 ? Math.round((totalUp / totalChecks) * 1000) / 10 : 100
      return { id, name, days: dayStatuses, uptimePct }
    })
  }, [rows, days])

  if (monitors.length === 0) {
    return (
      <div className='text-muted-foreground flex h-48 items-center justify-center text-sm'>
        Add monitors to see uptime history.
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className='flex flex-col gap-4'>
        {monitors.map((m) => (
          <div key={m.id}>
            <div className='mb-1 flex items-center justify-between text-sm'>
              <span className='font-medium'>{m.name}</span>
              <span className='text-muted-foreground tabular-nums'>{m.uptimePct}%</span>
            </div>
            <div className='flex gap-px'>
              {m.days.map((d) => (
                <Tooltip key={d.date}>
                  <TooltipTrigger asChild>
                    <div
                      className={`h-7 flex-1 rounded-[2px] ${STATUS_COLOR[d.status]} cursor-default transition-opacity hover:opacity-80`}
                    />
                  </TooltipTrigger>
                  <TooltipContent side='top' className='text-xs'>
                    <p className='font-medium'>{d.date}</p>
                    <p className='capitalize text-muted-foreground'>
                      {d.status === 'no-data' ? 'No data' : `${d.status} — ${d.uptimePct}% uptime`}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}
