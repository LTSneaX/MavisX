import { useQuery } from '@tanstack/react-query'
import { Activity, Server, Plug, Users, CheckCircle, XCircle, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '@/lib/supabase'

interface Props { workspaceId: string }

interface WsMonitor {
  id: string; name: string; type: string; target: string
  status: string; response_ms: number | null; last_checked_at: string | null
}

export function OverviewTab({ workspaceId }: Props) {
  const { data: monitors = [] } = useQuery({
    queryKey: ['ws-monitors', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_monitors')
        .select('*')
        .eq('workspace_id', workspaceId)
      return (data ?? []) as WsMonitor[]
    },
    refetchInterval: 30_000,
  })

  const { data: connections = [] } = useQuery({
    queryKey: ['ws-connections', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_connections')
        .select('id')
        .eq('workspace_id', workspaceId)
      return data ?? []
    },
  })

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
      return data ?? []
    },
  })

  const up      = monitors.filter(m => m.status === 'up').length
  const down    = monitors.filter(m => m.status === 'down').length
  const pending = monitors.filter(m => !m.status || m.status === 'pending').length
  const total   = monitors.length
  const healthPct = total > 0 ? Math.round((up / total) * 100) : null

  const stats = [
    { label: 'Monitors',    value: total,               icon: Activity, sub: `${up} up · ${down} down · ${pending} pending` },
    { label: 'Health',      value: healthPct != null ? `${healthPct}%` : '—', icon: Activity, sub: total > 0 ? `${up} of ${total} up` : 'no monitors', accent: healthPct != null ? (healthPct === 100 ? 'text-emerald-400' : healthPct >= 50 ? 'text-amber-400' : 'text-red-400') : '' },
    { label: 'Connections', value: connections.length,  icon: Plug,     sub: 'saved endpoints' },
    { label: 'Members',     value: members.length,      icon: Users,    sub: 'active seats' },
  ]

  // Response time chart data — only monitors with response data
  const rtData = monitors
    .filter(m => m.response_ms != null)
    .map(m => ({ name: m.name.length > 14 ? m.name.slice(0, 13) + '…' : m.name, ms: m.response_ms!, status: m.status }))
    .sort((a, b) => b.ms - a.ms)

  return (
    <div className='flex flex-col gap-6 p-6'>
      {/* KPI row */}
      <div className='grid grid-cols-4 gap-4'>
        {stats.map((s) => (
          <div key={s.label} className='rounded-lg border border-border/50 bg-card px-4 pb-4 pt-3 flex flex-col gap-1'>
            <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>{s.label}</span>
            <span className={`text-2xl font-bold tabular-nums ${s.accent ?? ''}`}>{s.value}</span>
            <span className='text-xs text-muted-foreground'>{s.sub}</span>
          </div>
        ))}
      </div>

      {/* Response time chart */}
      {rtData.length > 0 && (
        <div className='rounded-lg border border-border/50 bg-card'>
          <div className='px-4 py-3 border-b border-border/50'>
            <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Response Time (ms)</p>
          </div>
          <div className='px-4 py-4'>
            <ResponsiveContainer width='100%' height={180}>
              <BarChart data={rtData} layout='vertical' margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <XAxis type='number' tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis type='category' dataKey='name' tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
                  formatter={(v) => [`${v} ms`, 'Response']}
                />
                <Bar dataKey='ms' radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {rtData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.status === 'up' ? '#10b981' : entry.status === 'down' ? '#ef4444' : '#6b7280'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Monitor status list */}
      {monitors.length > 0 && (
        <div className='rounded-lg border border-border/50 bg-card'>
          <div className='px-4 py-3 border-b border-border/50'>
            <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Monitor Status</p>
          </div>
          <div className='divide-y divide-border/30'>
            {monitors.map((m) => (
              <div key={m.id} className='flex items-center gap-3 px-4 py-3'>
                <StatusIcon status={m.status} />
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium truncate'>{m.name}</p>
                  <p className='text-xs text-muted-foreground truncate'>{m.target}</p>
                </div>
                <div className='text-right shrink-0'>
                  <p className='text-xs text-muted-foreground capitalize'>{m.type}</p>
                  {m.response_ms != null && (
                    <p className='text-xs tabular-nums text-muted-foreground'>{m.response_ms}ms</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {monitors.length === 0 && connections.length === 0 && (
        <div className='flex flex-col items-center justify-center py-20 gap-3 text-center'>
          <Server className='h-10 w-10 text-muted-foreground/30' />
          <p className='text-sm font-medium text-muted-foreground'>Workspace is empty</p>
          <p className='text-xs text-muted-foreground/60'>Add monitors and connections from the tabs above.</p>
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'up')   return <CheckCircle className='h-4 w-4 text-emerald-500 shrink-0' />
  if (status === 'down') return <XCircle     className='h-4 w-4 text-red-500 shrink-0' />
  return <Clock className='h-4 w-4 text-muted-foreground/50 shrink-0' />
}
