import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, RefreshCw, Globe, TrendingUp, Clock, Zap } from 'lucide-react'
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { db, type CheckResult } from '@/lib/db'

const STATUS_COLORS: Record<string, string> = {
  up: '#22c55e',
  down: '#ef4444',
  degraded: '#eab308',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'up')
    return <Badge className='border-0 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold tracking-wide text-emerald-400'>UP</Badge>
  if (status === 'down')
    return <Badge className='border-0 bg-red-500/15 px-2 py-0.5 text-xs font-semibold tracking-wide text-red-400'>DOWN</Badge>
  if (status === 'degraded')
    return <Badge className='border-0 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold tracking-wide text-amber-400'>DEGRADED</Badge>
  return <Badge variant='outline'>{status}</Badge>
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

type CustomDotProps = { cx?: number; cy?: number; payload?: CheckResult }

function CustomDot({ cx, cy, payload }: CustomDotProps) {
  if (cx == null || cy == null || !payload) return null
  const color = STATUS_COLORS[payload.status] ?? '#6b7280'
  return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke='rgba(0,0,0,0.3)' strokeWidth={1} />
}

type KpiCardProps = {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  sub?: string
  accent: string
  iconColor: string
}

function KpiCard({ label, value, icon, sub, accent, iconColor }: KpiCardProps) {
  return (
    <Card className='relative overflow-hidden border border-border/50 bg-card pl-0'>
      <div className={`absolute left-0 top-0 h-full w-[3px] ${accent}`} />
      <CardContent className='px-4 pt-4 pb-3'>
        <div className='mb-2 flex items-center justify-between'>
          <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>{label}</span>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className='text-xl font-bold tabular-nums leading-none'>{value}</div>
        {sub && <div className='mt-1 text-xs text-muted-foreground'>{sub}</div>}
      </CardContent>
    </Card>
  )
}

type CustomTooltipProps = {
  active?: boolean
  payload?: { value: number; payload: CheckResult }[]
  label?: string
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const status = item?.payload?.status
  const color = status ? STATUS_COLORS[status] : '#6b7280'
  return (
    <div className='bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 shadow-xl'>
      <p className='text-white/40 mb-1 text-xs'>{label}</p>
      <div className='flex items-center gap-2'>
        <div className='h-2 w-2 rounded-full' style={{ background: color }} />
        <p className='text-white text-sm font-semibold tabular-nums'>
          {item.value != null ? `${item.value}ms` : '—'}
        </p>
      </div>
    </div>
  )
}

type Props = { monitorId: string }

export function MonitorDetail({ monitorId }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: monitors = [] } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => db.listMonitorsWithStatus(),
  })
  const monitor = monitors.find((m) => m.id === monitorId)

  const { data: checks = [], isLoading: checksLoading } = useQuery({
    queryKey: ['check-results', monitorId],
    queryFn: () => db.listCheckResults(monitorId, 200),
    refetchInterval: 15_000,
  })

  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents-for-monitor', monitorId],
    queryFn: async () => {
      const all = await db.listIncidentsWithMonitor()
      return all.filter((i) => i.monitor_id === monitorId)
    },
    refetchInterval: 15_000,
  })

  const chartData = useMemo(() => {
    return [...checks].reverse().slice(-100).map((c) => ({
      ...c,
      time: formatTime(c.checked_at),
      response_ms: c.response_ms ?? null,
    }))
  }, [checks])

  const avgMs = useMemo(() => {
    const up = checks.filter((c) => c.response_ms != null && c.status === 'up')
    if (!up.length) return null
    return Math.round(up.reduce((s, c) => s + (c.response_ms ?? 0), 0) / up.length)
  }, [checks])

  const uptimePct = useMemo(() => {
    if (!checks.length) return null
    const up = checks.filter((c) => c.status === 'up').length
    return Math.round((up / checks.length) * 1000) / 10
  }, [checks])

  async function checkNow() {
    await db.checkMonitorNow(monitorId)
    qc.invalidateQueries({ queryKey: ['monitors'] })
    qc.invalidateQueries({ queryKey: ['check-results', monitorId] })
  }

  if (!monitor) {
    return (
      <Main>
        <div className='text-muted-foreground flex h-48 items-center justify-center text-sm'>
          Monitor not found.
        </div>
      </Main>
    )
  }

  const uptimeAccent =
    uptimePct == null ? 'bg-zinc-600'
    : uptimePct >= 99 ? 'bg-emerald-500'
    : uptimePct >= 95 ? 'bg-amber-500'
    : 'bg-red-500'

  const uptimeIconColor =
    uptimePct == null ? 'text-zinc-400'
    : uptimePct >= 99 ? 'text-emerald-400'
    : uptimePct >= 95 ? 'text-amber-400'
    : 'text-red-400'

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-3 me-auto'>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={() => navigate({ to: '/monitors' })}
            aria-label='Back to monitors'
          >
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <Separator orientation='vertical' className='h-5' />
          <span className='font-semibold tracking-tight'>{monitor.name}</span>
          <Badge variant='outline' className='font-mono text-[10px] tracking-widest'>
            {monitor.type.toUpperCase()}
          </Badge>
          {monitor.last_status && <StatusBadge status={monitor.last_status} />}
        </div>
        <Button size='sm' variant='outline' onClick={checkNow} className='gap-2'>
          <RefreshCw className='h-3.5 w-3.5' />
          Check now
        </Button>
      </Header>

      <Main className='flex flex-1 flex-col gap-3'>
        {/* KPI row */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <KpiCard
            label='Target'
            value={<span className='truncate font-mono text-sm font-medium text-muted-foreground'>{monitor.target}</span>}
            icon={<Globe className='h-3.5 w-3.5' />}
            accent='bg-slate-500'
            iconColor='text-slate-400'
          />
          <KpiCard
            label='Uptime'
            value={uptimePct != null ? `${uptimePct}%` : '—'}
            icon={<TrendingUp className='h-3.5 w-3.5' />}
            sub='Last 200 checks'
            accent={uptimeAccent}
            iconColor={uptimeIconColor}
          />
          <KpiCard
            label='Avg Response'
            value={avgMs != null ? `${avgMs}ms` : '—'}
            icon={<Zap className='h-3.5 w-3.5' />}
            sub='Up checks only'
            accent='bg-cyan-500'
            iconColor='text-cyan-400'
          />
          <KpiCard
            label='Interval'
            value={`${monitor.interval_seconds}s`}
            icon={<Clock className='h-3.5 w-3.5' />}
            sub='Check frequency'
            accent='bg-violet-500'
            iconColor='text-violet-400'
          />
        </div>

        {/* Response time chart */}
        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-sm font-semibold tracking-tight'>Response Time</CardTitle>
              <span className='text-muted-foreground text-xs'>Last 100 checks</span>
            </div>
          </CardHeader>
          <CardContent className='pt-0'>
            {chartData.length === 0 ? (
              <div className='text-muted-foreground flex h-48 items-center justify-center text-sm'>
                No check data yet.
              </div>
            ) : (
              <ResponsiveContainer width='100%' height={200}>
                <AreaChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id='responseGradient' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='0%' stopColor='#22c55e' stopOpacity={0.3} />
                      <stop offset='100%' stopColor='#22c55e' stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.06)' vertical={false} />
                  <XAxis
                    dataKey='time'
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                    interval='preserveStartEnd'
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                    tickLine={false}
                    axisLine={false}
                    unit='ms'
                    width={52}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {avgMs != null && (
                    <ReferenceLine
                      y={avgMs}
                      stroke='rgba(255,255,255,0.15)'
                      strokeDasharray='4 4'
                      label={{ value: `avg ${avgMs}ms`, position: 'insideTopRight', fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                    />
                  )}
                  <Area
                    type='monotone'
                    dataKey='response_ms'
                    stroke='#22c55e'
                    strokeWidth={2}
                    fill='url(#responseGradient)'
                    dot={(props) => <CustomDot key={props.index} {...props} />}
                    connectNulls={false}
                    activeDot={{ r: 5, strokeWidth: 0, fill: '#22c55e' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent incidents */}
        {incidents.length > 0 && (
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-semibold tracking-tight'>Incidents</CardTitle>
            </CardHeader>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow className='hover:bg-transparent border-border/50'>
                    <TableHead className='pl-4 text-xs w-4' />
                    <TableHead className='text-xs'>Started</TableHead>
                    <TableHead className='text-xs'>Resolved</TableHead>
                    <TableHead className='text-xs'>Duration</TableHead>
                    <TableHead className='text-xs'>Cause</TableHead>
                    <TableHead className='text-xs'>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.slice(0, 10).map((inc) => {
                    const start = new Date(inc.started_at)
                    const end = inc.resolved_at ? new Date(inc.resolved_at) : new Date()
                    const mins = Math.round((end.getTime() - start.getTime()) / 60000)
                    const duration = mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h ${mins % 60}m`
                    const isOpen = inc.status === 'open'
                    return (
                      <TableRow key={inc.id} className='border-border/40 group'>
                        <TableCell className='py-3 pl-0 pr-0 w-1'>
                          <div className={`w-1 h-8 rounded-full mx-1 ${isOpen ? 'bg-red-500' : 'bg-emerald-500'}`} />
                        </TableCell>
                        <TableCell className='py-3 text-xs tabular-nums'>{formatDateTime(inc.started_at)}</TableCell>
                        <TableCell className='py-3 text-xs tabular-nums'>
                          {inc.resolved_at ? formatDateTime(inc.resolved_at) : <span className='text-red-400'>Ongoing</span>}
                        </TableCell>
                        <TableCell className='py-3 text-xs tabular-nums'>{duration}</TableCell>
                        <TableCell className='text-muted-foreground max-w-xs truncate py-3 text-xs'>{inc.cause ?? '—'}</TableCell>
                        <TableCell className='py-3'>
                          {isOpen ? (
                            <Badge className='border-0 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400'>Open</Badge>
                          ) : (
                            <Badge className='border-0 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400'>Resolved</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Check history */}
        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-sm font-semibold tracking-tight'>Check History</CardTitle>
              <span className='text-muted-foreground text-xs'>Last 100</span>
            </div>
          </CardHeader>
          <CardContent className='p-0'>
            {checksLoading ? (
              <div className='text-muted-foreground flex h-24 items-center justify-center text-sm'>Loading…</div>
            ) : checks.length === 0 ? (
              <div className='text-muted-foreground flex h-24 items-center justify-center text-sm'>No checks yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className='hover:bg-transparent border-border/50'>
                    <TableHead className='pl-4 w-4' />
                    <TableHead className='text-xs'>Time</TableHead>
                    <TableHead className='w-28 text-xs'>Status</TableHead>
                    <TableHead className='w-28 text-xs'>Response</TableHead>
                    <TableHead className='text-xs'>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.slice(0, 100).map((c) => (
                    <TableRow key={c.id} className='border-border/40'>
                      <TableCell className='py-2 pl-0 pr-0 w-1'>
                        <div
                          className='w-1 h-6 rounded-full mx-1'
                          style={{ background: STATUS_COLORS[c.status] ?? '#6b7280', opacity: 0.8 }}
                        />
                      </TableCell>
                      <TableCell className='text-muted-foreground py-2 text-xs tabular-nums'>{formatDateTime(c.checked_at)}</TableCell>
                      <TableCell className='py-2'><StatusBadge status={c.status} /></TableCell>
                      <TableCell className='py-2 font-mono text-xs tabular-nums'>
                        {c.response_ms != null ? `${c.response_ms}ms` : <span className='text-muted-foreground'>—</span>}
                      </TableCell>
                      <TableCell className='text-muted-foreground max-w-xs truncate py-2 text-xs'>{c.detail ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
