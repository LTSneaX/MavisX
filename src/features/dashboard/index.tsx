import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

  const recentIncidents = incidents.slice(0, 6)

  const uptimePct =
    stats && stats.total > 0
      ? Math.round((stats.up / stats.total) * 1000) / 10
      : null

  const hasActiveIncidents = (stats?.activeIncidents ?? 0) > 0

  const allClear = (stats?.total ?? 0) > 0 && (stats?.down ?? 0) === 0 && !hasActiveIncidents

  return (
    <>
      <Header>
        <div className='ml-auto flex items-center gap-2'>
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
            label='Monitors Up'
            value={stats?.up ?? 0}
            sub={uptimePct !== null ? `${uptimePct}% operational` : 'No data yet'}
            icon={<CheckCircle2 className='h-4 w-4' />}
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
          <Card className='col-span-1 lg:col-span-4'>
            <CardHeader>
              <CardTitle>Monitor Status</CardTitle>
              <CardDescription>Uptime over the last 45 days</CardDescription>
            </CardHeader>
            <CardContent>
              <UptimeBars rows={uptimeRows} days={45} />
            </CardContent>
          </Card>

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
      </Main>
    </>
  )
}
