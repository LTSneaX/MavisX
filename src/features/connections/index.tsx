import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Container, FolderOpen, Globe, Monitor, Plus,
  Server, Terminal, Wifi,
  MoreHorizontal, Pencil, Trash2, Loader2,
} from 'lucide-react'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { portScan } from '@/lib/network'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { db, type Connection, type ConnectionType } from '@/lib/db'
import { ConnectionsProvider, useConnections } from './components/connections-provider'
import { ConnectionMutateDrawer } from './components/connection-mutate-drawer'
import { ConnectionDeleteDialog } from './components/connection-delete-dialog'

const TYPE_META: Record<ConnectionType, { label: string; icon: React.ElementType; color: string; available: boolean }> = {
  ssh:    { label: 'SSH',    icon: Terminal,   color: 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10', available: true },
  sftp:   { label: 'SFTP',  icon: FolderOpen, color: 'text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10',         available: true },
  ftp:    { label: 'FTP',   icon: FolderOpen, color: 'text-blue-400 border-blue-500/30 hover:bg-blue-500/10',         available: true },
  rdp:    { label: 'RDP',   icon: Monitor,    color: 'text-violet-400 border-violet-500/30 hover:bg-violet-500/10',   available: true },
  vnc:    { label: 'VNC',   icon: Monitor,    color: 'text-purple-400 border-purple-500/30 hover:bg-purple-500/10',   available: true },
  telnet: { label: 'Telnet',icon: Terminal,   color: 'text-amber-400 border-amber-500/30 hover:bg-amber-500/10',     available: true },
  docker: { label: 'Docker',icon: Container,  color: 'text-sky-400 border-sky-500/30 hover:bg-sky-500/10',           available: true },
  web:    { label: 'Web',   icon: Globe,      color: 'text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10',   available: true },
}

type TestStatus = 'idle' | 'testing' | 'open' | 'closed'

// Group connections by host — same host = one card, multiple protocol buttons
type HostGroup = {
  host: string
  displayName: string
  group_name: string | null
  connections: Connection[]
}

function groupByHost(connections: Connection[]): HostGroup[] {
  const map = new Map<string, HostGroup>()
  for (const c of connections) {
    const key = c.host ?? c.id
    if (!map.has(key)) {
      map.set(key, {
        host: key,
        displayName: c.name,
        group_name: c.group_name,
        connections: [],
      })
    }
    map.get(key)!.connections.push(c)
  }
  return [...map.values()]
}

function ProtocolButton({ conn }: { conn: Connection }) {
  const meta = TYPE_META[conn.type]
  const Icon = meta.icon
  const navigate = useNavigate()

  async function handleConnect() {
    if (!conn.host) return

    if (conn.type === 'ssh') {
      navigate({ to: '/ssh', search: { host: conn.host, port: conn.port ?? 22, username: conn.username ?? '', ws_workspace_id: undefined, ws_vault_item_id: undefined } })
      return
    }
    if (conn.type === 'sftp') {
      navigate({ to: '/files', search: { host: conn.host, port: String(conn.port ?? 22), username: conn.username ?? '' } as never })
      return
    }
    if (conn.type === 'ftp') {
      navigate({ to: '/files', search: { host: conn.host, port: String(conn.port ?? 21), username: conn.username ?? '' } as never })
      return
    }
    if (conn.type === 'web') {
      const url = conn.host.startsWith('http') ? conn.host : `https://${conn.host}`
      navigate({ to: '/web-viewer', search: { url, name: conn.name } as never })
      return
    }
    if (conn.type === 'docker') {
      navigate({ to: '/docker' })
      return
    }
    if (conn.type === 'rdp') {
      await shellOpen(`rdp:full%20address=s:${conn.host}:${conn.port ?? 3389}`)
      return
    }
    if (conn.type === 'vnc') {
      await shellOpen(`vnc://${conn.host}:${conn.port ?? 5900}`)
      return
    }
    if (conn.type === 'telnet') {
      await shellOpen(`telnet://${conn.host}:${conn.port ?? 23}`)
      return
    }
  }

  return (
    <Button
      variant='outline'
      size='sm'
      className={`h-7 gap-1.5 border px-2.5 text-xs font-medium transition-colors ${meta.color}`}
      onClick={handleConnect}
      title={`Connect via ${meta.label}`}
    >
      <Icon className='h-3 w-3' />
      {meta.label}
    </Button>
  )
}

function HostCard({ group }: { group: HostGroup }) {
  const { setOpen, setCurrentRow } = useConnections()
  const firstConn = group.connections[0]
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')

  const accentMap: Record<ConnectionType, string> = {
    ssh: 'bg-emerald-500', sftp: 'bg-cyan-500', ftp: 'bg-blue-500',
    rdp: 'bg-violet-500', vnc: 'bg-purple-500', telnet: 'bg-amber-500',
    docker: 'bg-sky-500', web: 'bg-indigo-500',
  }
  const accent = accentMap[firstConn.type]

  const handleTest = useCallback(async () => {
    if (!firstConn.host || testStatus === 'testing') return
    const port = firstConn.port ?? 22
    setTestStatus('testing')
    try {
      const results = await portScan(firstConn.host, [port], 3000)
      setTestStatus(results[0]?.open ? 'open' : 'closed')
    } catch {
      setTestStatus('closed')
    }
  }, [firstConn.host, firstConn.port, testStatus])

  return (
    <div className='group/card relative flex items-center gap-4 rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:border-border'>
      <div className={`absolute left-0 top-0 h-full w-[3px] rounded-l-lg ${accent}`} />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium'>{group.displayName}</span>
          <HealthDot status={testStatus} />
        </div>
        {firstConn.username
          ? <p className='font-mono text-xs text-muted-foreground'>{firstConn.username}@{firstConn.host}{firstConn.port ? `:${firstConn.port}` : ''}</p>
          : group.host !== group.displayName && <p className='font-mono text-xs text-muted-foreground'>{group.host}</p>
        }
      </div>
      <div className='flex flex-wrap items-center gap-1.5'>
        {group.connections.map(c => <ProtocolButton key={c.id} conn={c} />)}
        <button
          onClick={handleTest}
          disabled={testStatus === 'testing'}
          title='Test TCP reachability'
          className='flex h-7 items-center gap-1 rounded border border-border/50 px-2 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50'
        >
          {testStatus === 'testing'
            ? <Loader2 className='h-3 w-3 animate-spin' />
            : <Wifi className='h-3 w-3' />}
          Test
        </button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-100 data-[state=open]:opacity-100'
          >
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {group.connections.map((c, i) => (
            <div key={c.id}>
              {group.connections.length > 1 && i === 0 && (
                <div className='px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                  {group.displayName}
                </div>
              )}
              <DropdownMenuItem onClick={() => { setCurrentRow(c); setOpen('update') }}>
                <Pencil className='mr-2 h-3.5 w-3.5' />
                Edit {c.type.toUpperCase()}
              </DropdownMenuItem>
              <DropdownMenuItem
                className='text-destructive focus:text-destructive'
                onClick={() => { setCurrentRow(c); setOpen('delete') }}
              >
                <Trash2 className='mr-2 h-3.5 w-3.5' />
                Delete {c.type.toUpperCase()}
              </DropdownMenuItem>
              {i < group.connections.length - 1 && <DropdownMenuSeparator />}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function HealthDot({ status }: { status: TestStatus }) {
  if (status === 'idle') return null
  if (status === 'testing') return <span className='h-2 w-2 animate-pulse rounded-full bg-amber-400' />
  if (status === 'open')    return <span className='h-2 w-2 rounded-full bg-emerald-400' title='Port reachable' />
  return <span className='h-2 w-2 rounded-full bg-red-500' title='Port unreachable' />
}

function GroupSection({ group, hosts }: { group: string | null; hosts: HostGroup[] }) {
  return (
    <div>
      {group && (
        <div className='mb-2 flex items-center gap-2'>
          <Server className='h-3 w-3 text-muted-foreground' />
          <span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>{group}</span>
          <span className='text-xs text-muted-foreground'>({hosts.length})</span>
        </div>
      )}
      <div className='flex flex-col gap-2'>
        {hosts.map(h => <HostCard key={h.host} group={h} />)}
      </div>
    </div>
  )
}

function ConnectionsContent() {
  const { open, setOpen, currentRow, setCurrentRow } = useConnections()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => db.listConnections(),
  })

  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof db.saveConnection>[0]) => db.saveConnection(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => db.deleteConnection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  const filtered = connections.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.host?.toLowerCase().includes(search.toLowerCase()) ||
    c.type.includes(search.toLowerCase())
  )

  // Group by host first, then by group_name
  const hostGroups = groupByHost(filtered)
  const byGroupName = new Map<string | null, HostGroup[]>()
  for (const h of hostGroups) {
    const key = h.group_name ?? null
    if (!byGroupName.has(key)) byGroupName.set(key, [])
    byGroupName.get(key)!.push(h)
  }
  const namedGroups = [...byGroupName.entries()].filter(([k]) => k !== null).sort(([a], [b]) => (a! > b! ? 1 : -1))
  const ungrouped = byGroupName.get(null) ?? []

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <Wifi className='h-4 w-4 text-muted-foreground' />
          <span className='font-semibold'>Connections</span>
          <Badge variant='outline' className='tabular-nums text-xs'>{connections.length}</Badge>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-3'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold tracking-tight'>Connections</h2>
            <p className='text-xs text-muted-foreground'>SSH, SFTP, FTP, RDP, VNC, Telnet, Docker, Web</p>
          </div>
          <Button size='sm' onClick={() => { setCurrentRow(null); setOpen('create') }}>
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            Add connection
          </Button>
        </div>

        {connections.length > 0 && (
          <Input
            placeholder='Search connections...'
            value={search}
            onChange={e => setSearch(e.target.value)}
            className='h-8 max-w-xs text-sm'
          />
        )}

        {isLoading ? (
          <p className='text-xs text-muted-foreground'>Loading...</p>
        ) : connections.length === 0 ? (
          <div className='flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border'>
            <Wifi className='h-8 w-8 text-muted-foreground/40' />
            <div className='text-center'>
              <p className='text-sm font-medium'>No connections yet</p>
              <p className='text-xs text-muted-foreground'>Add your first SSH, FTP, RDP or Docker connection.</p>
            </div>
            <Button size='sm' onClick={() => { setCurrentRow(null); setOpen('create') }}>
              <Plus className='mr-1.5 h-3.5 w-3.5' />Add connection
            </Button>
          </div>
        ) : (
          <div className='flex flex-col gap-5'>
            {namedGroups.map(([group, hosts]) => (
              <GroupSection key={group} group={group} hosts={hosts} />
            ))}
            {ungrouped.length > 0 && (
              <GroupSection
                group={namedGroups.length > 0 ? 'Ungrouped' : null}
                hosts={ungrouped}
              />
            )}
          </div>
        )}
      </Main>

      <ConnectionMutateDrawer
        open={open === 'create' || open === 'update'}
        onOpenChange={v => !v && setOpen(null)}
        currentRow={open === 'update' ? currentRow : null}
        onSubmit={inputs => Promise.all(inputs.map(i => saveMutation.mutateAsync(i))).then(() => {})}
      />
      <ConnectionDeleteDialog
        open={open === 'delete'}
        onOpenChange={v => !v && setOpen(null)}
        currentRow={currentRow}
        onDelete={id => deleteMutation.mutateAsync(id)}
      />
    </>
  )
}

export function Connections() {
  return (
    <ConnectionsProvider>
      <ConnectionsContent />
    </ConnectionsProvider>
  )
}
