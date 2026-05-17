import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Activity, AlertTriangle, CheckCircle2, Circle, Clock, Plus,
  XCircle, TrendingUp, Wifi, WifiOff,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { db } from '@/lib/db'
import { UptimeBars } from './components/uptime-bars'

function fmt(ms: number | null): string {
  if (ms === null) return '—'
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

type KpiCardProps = {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  icon: React.ReactNode
  accent: string
  iconColor: string
}

function KpiCard({ label, value, sub, icon, accent, iconColor }: KpiCardProps) {
  return (
    <Card className={`relative overflow-hidden border border-border/50 bg-card pl-0`}>
      <div className={`absolute left-0 top-0 h-full w-[3px] ${accent}`} />
      <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-1.5 pt-4 px-4'>
        <CardTitle className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>{label}</CardTitle>
        <span className={iconColor}>{icon}</span>
      </CardHeader>
      <CardContent className='px-4 pb-4'>
        <div className='text-2xl font-bold tabular-nums leading-none'>{value}</div>
        <p className='mt-1 text-xs text-muted-foreground'>{sub}</p>
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const navigate = useNavigate()

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => db.getDashboardStats(),
    refetchInterval: 30_000,
  })

  const { data: uptimeRows = [] } = useQuery({
    queryKey: ['uptime-history'],
    queryFn: () => db.getUptimeHistory(45),
    refetchInterval: 60_000,
  })

  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => db.listIncidents(),
    refetchInterval: 30_000,
  })

  const { data: monitors = [] } = useQuery({
    queryKey: ['monitors-with-status'],
    queryFn: () => db.listMonitorsWithStatus(),
    refetchInterval: 30_000,
  })

  const recentIncidents = incidents.slice(0, 5)

  const uptimePct =
    stats && stats.total > 0
      ? Math.round((stats.up / stats.total) * 1000) / 10
      : null

  const hasActiveIncidents = (stats?.activeIncidents ?? 0) > 0
  const allClear = (stats?.total ?? 0) > 0 && (stats?.down ?? 0) === 0 && !hasActiveIncidents

  const monitorsDown = monitors.filter(m => m.last_status === 'down')
  const monitorsUp = monitors.filter(m => m.last_status === 'up')
  const monitorsUnknown = monitors.filter(m => !m.last_status)

  return (
    <>
      <Header>
        <div className='ml-auto flex items-center gap-2'>
          <Button size='sm' variant='outline' onClick={() => navigate({ to: '/monitors' })}>
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            Add monitor
          </Button>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-4'>
          <h1 className='text-lg font-semibold tracking-tight'>Overview</h1>
          <p className='text-muted-foreground text-xs'>Workspace command center.</p>
        </div>

        {/* Global status banner */}
        {(stats?.total ?? 0) > 0 && (
          <div className={`mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 ${
            allClear
              ? 'border-emerald-500/20 bg-emerald-500/5'
              : 'border-red-500/20 bg-red-500/5'
          }`}>
            <Circle className={`h-2.5 w-2.5 fill-current ${allClear ? 'text-emerald-500' : 'text-red-500'}`} />
            <span className={`text-sm font-semibold tracking-wide ${allClear ? 'text-emerald-400' : 'text-red-400'}`}>
              {allClear
                ? 'ALL SYSTEMS OPERATIONAL'
                : `${stats?.down ?? 0} MONITOR${(stats?.down ?? 0) !== 1 ? 'S' : ''} DOWN${hasActiveIncidents ? ` · ${stats?.activeIncidents} ACTIVE INCIDENT${(stats?.activeIncidents ?? 0) !== 1 ? 'S' : ''}` : ''}`
              }
            </span>
            <span className='ml-auto text-xs text-muted-foreground tabular-nums'>
              {stats?.up ?? 0} / {stats?.total ?? 0} up
            </span>
          </div>
        )}

        {/* KPI row */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <KpiCard
            label='Total Monitors'
            value={stats?.total ?? 0}
            sub={stats?.total === 0 ? 'No monitors configured' : `${stats?.down ?? 0} currently down`}
            icon={<Activity className='h-4 w-4' />}
            accent='bg-indigo-500'
            iconColor='text-indigo-400'
          />
          <KpiCard
            label='Uptime'
            value={uptimePct !== null ? `${uptimePct}%` : '—'}
            sub={`${stats?.up ?? 0} monitors up right now`}
            icon={<TrendingUp className='h-4 w-4' />}
            accent='bg-emerald-500'
            iconColor='text-emerald-400'
          />
          <KpiCard
            label='Active Incidents'
            value={stats?.activeIncidents ?? 0}
            sub={hasActiveIncidents ? 'Ongoing outages' : 'All clear'}
            icon={<AlertTriangle className='h-4 w-4' />}
            accent={hasActiveIncidents ? 'bg-red-500' : 'bg-zinc-600'}
            iconColor={hasActiveIncidents ? 'text-red-400' : 'text-zinc-400'}
          />
          <KpiCard
            label='Avg Response'
            value={fmt(stats?.avgResponseMs ?? null)}
            sub='Last hour, up checks only'
            icon={<Clock className='h-4 w-4' />}
            accent='bg-violet-500'
            iconColor='text-violet-400'
          />
        </div>

        <div className='mt-4 grid grid-cols-1 gap-4 lg:grid-cols-7'>
          {/* Uptime bars */}
          <Card className='col-span-1 lg:col-span-4'>
            <CardHeader>
              <CardTitle>Monitor Status</CardTitle>
              <CardDescription>Uptime over the last 45 days</CardDescription>
            </CardHeader>
            <CardContent>
              <UptimeBars rows={uptimeRows} days={45} />
            </CardContent>
          </Card>

          {/* Recent incidents */}
          <Card className='col-span-1 lg:col-span-3'>
            <CardHeader>
              <CardTitle>Recent Incidents</CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </CardHeader>
            <CardContent className='px-6'>
              {recentIncidents.length === 0 ? (
                <div className='text-muted-foreground flex h-48 items-center justify-center text-sm'>
                  No incidents recorded.
                </div>
              ) : (
                <div className='flex flex-col'>
                  {recentIncidents.map((inc, idx) => (
                    <div
                      key={inc.id}
                      className={`flex items-start justify-between py-3 text-sm ${
                        idx < recentIncidents.length - 1 ? 'border-b border-border/50' : ''
                      }`}
                    >
                      <div className='flex min-w-0 flex-col gap-0.5 pr-3'>
                        <span className='truncate font-medium leading-snug'>
                          {inc.cause ?? 'Outage detected'}
                        </span>
                        <span className='text-muted-foreground text-xs tabular-nums'>
                          {new Date(inc.started_at).toLocaleString()}
                        </span>
                      </div>
                      {inc.status === 'open' ? (
                        <Badge className='shrink-0 border-0 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400'>
                          Ongoing
                        </Badge>
                      ) : (
                        <Badge className='shrink-0 border-0 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400'>
                          Resolved
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monitor list */}
        {monitors.length > 0 && (
          <Card className='mt-4'>
            <CardHeader className='flex flex-row items-center justify-between pb-3'>
              <div>
                <CardTitle>All Monitors</CardTitle>
                <CardDescription>Current status of every monitored endpoint</CardDescription>
              </div>
              <Button size='sm' variant='outline' onClick={() => navigate({ to: '/monitors' })}>
                Manage
              </Button>
            </CardHeader>
            <CardContent className='p-0'>
              {/* Summary chips */}
              {(monitorsDown.length > 0 || monitorsUnknown.length > 0) && (
                <div className='flex items-center gap-2 px-4 py-2 border-b border-border/30'>
                  {monitorsDown.length > 0 && (
                    <Badge className='border-0 bg-red-500/15 text-red-400 text-[10px]'>
                      <XCircle className='mr-1 h-3 w-3' />{monitorsDown.length} down
                    </Badge>
                  )}
                  {monitorsUp.length > 0 && (
                    <Badge className='border-0 bg-emerald-500/15 text-emerald-400 text-[10px]'>
                      <CheckCircle2 className='mr-1 h-3 w-3' />{monitorsUp.length} up
                    </Badge>
                  )}
                  {monitorsUnknown.length > 0 && (
                    <Badge className='border-0 bg-zinc-500/15 text-zinc-400 text-[10px]'>
                      <Wifi className='mr-1 h-3 w-3' />{monitorsUnknown.length} pending
                    </Badge>
                  )}
                </div>
              )}

              {/* Column header */}
              <div className='grid grid-cols-[1fr_100px_120px_80px] gap-0 px-4 py-1.5 border-b border-border/20 bg-muted/20'>
                <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>Monitor</span>
                <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center'>Status</span>
                <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-right'>Response</span>
                <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-right'>Last check</span>
              </div>

              {/* Rows — down first */}
              <div className='divide-y divide-border/30'>
                {[...monitorsDown, ...monitorsUp, ...monitorsUnknown].map((m) => {
                  const isDown = m.last_status === 'down'
                  const isUp = m.last_status === 'up'
                  return (
                    <div
                      key={m.id}
                      className='grid grid-cols-[1fr_100px_120px_80px] items-center gap-0 px-4 py-2.5 hover:bg-accent/30 cursor-pointer transition-colors'
                      onClick={() => navigate({ to: '/monitors' })}
                    >
                      <div className='flex items-center gap-2 min-w-0'>
                        {isDown
                          ? <WifiOff className='h-3.5 w-3.5 shrink-0 text-red-400' />
                          : isUp
                          ? <Wifi className='h-3.5 w-3.5 shrink-0 text-emerald-400' />
                          : <Activity className='h-3.5 w-3.5 shrink-0 text-zinc-400' />
                        }
                        <div className='min-w-0'>
                          <p className='text-xs font-medium truncate'>{m.name}</p>
                          <p className='text-[10px] text-muted-foreground font-mono truncate'>{m.target}</p>
                        </div>
                      </div>
                      <div className='flex justify-center'>
                        {m.last_status ? (
                          <Badge className={`border-0 text-[10px] px-2 py-0.5 font-semibold ${
                            isDown ? 'bg-red-500/15 text-red-400'
                            : isUp ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-amber-500/15 text-amber-400'
                          }`}>
                            {m.last_status.toUpperCase()}
                          </Badge>
                        ) : (
                          <Badge className='border-0 text-[10px] px-2 py-0.5 bg-zinc-500/15 text-zinc-400'>
                            PENDING
                          </Badge>
                        )}
                      </div>
                      <p className='text-xs tabular-nums text-right text-muted-foreground'>
                        {fmt(m.last_response_ms)}
                      </p>
                      <p className='text-[10px] tabular-nums text-right text-muted-foreground'>
                        {relativeTime(m.last_checked_at)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state — no monitors yet */}
        {monitors.length === 0 && (stats?.total ?? 0) === 0 && (
          <Card className='mt-4 border-dashed'>
            <CardContent className='flex flex-col items-center gap-3 py-12 text-center'>
              <Activity className='h-8 w-8 text-muted-foreground/40' />
              <div>
                <p className='text-sm font-medium'>No monitors yet</p>
                <p className='text-xs text-muted-foreground'>Add your first monitor to start tracking uptime.</p>
              </div>
              <Button size='sm' onClick={() => navigate({ to: '/monitors' })}>
                <Plus className='mr-1.5 h-3.5 w-3.5' />
                Add monitor
              </Button>
            </CardContent>
          </Card>
        )}
      </Main>
    </>
  )
}
