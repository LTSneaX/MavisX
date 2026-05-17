import { useQuery } from '@tanstack/react-query'
import { Activity, Server, Plug, Users, CheckCircle, XCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props { workspaceId: string }

export function OverviewTab({ workspaceId }: Props) {
  const { data: monitors = [] } = useQuery({
    queryKey: ['ws-monitors', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_monitors')
        .select('*')
        .eq('workspace_id', workspaceId)
      return data ?? []
    },
  })

  const { data: connections = [] } = useQuery({
    queryKey: ['ws-connections', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_connections')
        .select('*')
        .eq('workspace_id', workspaceId)
      return data ?? []
    },
  })

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
      return data ?? []
    },
  })

  const up = monitors.filter((m: { status: string }) => m.status === 'up').length
  const down = monitors.filter((m: { status: string }) => m.status === 'down').length
  const pending = monitors.filter((m: { status: string }) => !m.status || m.status === 'pending').length

  const stats = [
    { label: 'Monitors', value: monitors.length, icon: Activity, sub: `${up} up · ${down} down` },
    { label: 'Connections', value: connections.length, icon: Plug, sub: 'saved endpoints' },
    { label: 'Members', value: members.length, icon: Users, sub: 'active seats' },
  ]

  return (
    <div className='flex flex-col gap-6 p-6'>
      <div className='grid grid-cols-3 gap-4'>
        {stats.map((s) => (
          <div key={s.label} className='rounded-lg border border-border/50 bg-card p-4 flex flex-col gap-2'>
            <div className='flex items-center justify-between'>
              <span className='text-xs text-muted-foreground font-medium uppercase tracking-wider'>{s.label}</span>
              <s.icon className='h-4 w-4 text-muted-foreground/50' />
            </div>
            <span className='text-3xl font-bold tabular-nums'>{s.value}</span>
            <span className='text-xs text-muted-foreground'>{s.sub}</span>
          </div>
        ))}
      </div>

      {monitors.length > 0 && (
        <div className='rounded-lg border border-border/50 bg-card'>
          <div className='px-4 py-3 border-b border-border/50'>
            <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Monitor Status</p>
          </div>
          <div className='divide-y divide-border/30'>
            {monitors.map((m: { id: string; name: string; type: string; target: string; status: string; response_ms: number }) => (
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
  if (status === 'up') return <CheckCircle className='h-4 w-4 text-emerald-500 shrink-0' />
  if (status === 'down') return <XCircle className='h-4 w-4 text-red-500 shrink-0' />
  return <Clock className='h-4 w-4 text-muted-foreground/50 shrink-0' />
}
