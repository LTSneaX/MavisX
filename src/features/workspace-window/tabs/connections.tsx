import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { invoke } from '@tauri-apps/api/core'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import {
  Plus, Trash2, Terminal, Globe, Server, Pencil,
  FolderOpen, Container, Monitor, Zap, Loader2,
  CheckCircle, XCircle, Circle,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface Props { workspaceId: string; isAdmin: boolean; closeOverlay: () => void }

const CONN_TYPES = ['ssh', 'sftp', 'ftp', 'rdp', 'vnc', 'telnet', 'docker', 'web'] as const

type ConnType = typeof CONN_TYPES[number]

// FTP hidden for v0.3.0 — no real FTP backend yet (would silently connect over SFTP); re-enable when suppaftp/ftp lib is added.
// CONN_TYPES keeps 'ftp' so existing FTP connections still render/connect; only the picker below hides it.
const SELECTABLE_CONN_TYPES = CONN_TYPES.filter((t) => t !== 'ftp')

const TYPE_META: Record<ConnType, { label: string; icon: React.ElementType; color: string }> = {
  ssh:    { label: 'SSH',    icon: Terminal,   color: 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10' },
  sftp:   { label: 'SFTP',  icon: FolderOpen, color: 'text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10'         },
  ftp:    { label: 'FTP',   icon: FolderOpen, color: 'text-blue-400 border-blue-500/30 hover:bg-blue-500/10'         },
  rdp:    { label: 'RDP',   icon: Monitor,    color: 'text-violet-400 border-violet-500/30 hover:bg-violet-500/10'   },
  vnc:    { label: 'VNC',   icon: Monitor,    color: 'text-purple-400 border-purple-500/30 hover:bg-purple-500/10'   },
  telnet: { label: 'Telnet',icon: Terminal,   color: 'text-amber-400 border-amber-500/30 hover:bg-amber-500/10'     },
  docker: { label: 'Docker',icon: Container,  color: 'text-sky-400 border-sky-500/30 hover:bg-sky-500/10'           },
  web:    { label: 'Web',   icon: Globe,      color: 'text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10'   },
}

const DEFAULT_PORT: Record<string, number> = {
  ssh: 22, sftp: 22, ftp: 21, rdp: 3389, vnc: 5900, telnet: 23, docker: 2375,
}

interface WsConnection {
  id: string; name: string; type: string; host: string; port: number;
  username: string; group_name: string; vault_item_id: string | null
}

interface VaultItem { id: string; name: string; item_type: string }

type TestStatus = 'up' | 'down'
interface TestResult { status: TestStatus; response_ms: number | null }

function HealthDot({ result }: { result: TestResult | undefined }) {
  if (!result) return <Circle className='h-3 w-3 text-muted-foreground/30 shrink-0' />
  if (result.status === 'up') return <CheckCircle className='h-3.5 w-3.5 text-emerald-500 shrink-0' />
  return <XCircle className='h-3.5 w-3.5 text-red-500 shrink-0' />
}

export function ConnectionsTab({ workspaceId, isAdmin, closeOverlay }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<null | WsConnection>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  async function handleTest(c: WsConnection) {
    if (testing) return
    setTesting(c.id)
    try {
      const port = c.port ?? DEFAULT_PORT[c.type] ?? 80
      const isWeb = c.type === 'web'
      const monitorType = isWeb ? 'http' : 'tcp'
      const target = isWeb
        ? (c.host?.startsWith('http') ? c.host : `https://${c.host}`)
        : `${c.host}:${port}`

      const result = await invoke<{ status: string; response_ms: number | null; detail: string | null }>(
        'test_monitor', { monitorType, target, timeoutSeconds: 10, config: null }
      )
      const status: TestStatus = result.status === 'up' ? 'up' : 'down'
      setTestResults((prev) => ({ ...prev, [c.id]: { status, response_ms: result.response_ms } }))
      toast[status === 'up' ? 'success' : 'error'](
        `${c.name} — ${status.toUpperCase()}${result.response_ms != null ? ` (${result.response_ms}ms)` : ''}${result.detail ? ` · ${result.detail}` : ''}`
      )
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [c.id]: { status: 'down', response_ms: null } }))
      toast.error(`Test failed: ${String(err)}`)
    } finally {
      setTesting(null)
    }
  }

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['ws-connections', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_connections')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
      return (data ?? []) as WsConnection[]
    },
  })

  // Vault items for the credential picker (only loaded if vault is unlocked)
  const { data: vaultItems = [] } = useQuery<VaultItem[]>({
    queryKey: ['ws-vault-items', workspaceId],
    queryFn: () => invoke('ws_vault_list', { workspace_id: workspaceId }),
    retry: false,
  })

  const deleteConn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workspace_connections').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ws-connections', workspaceId] }),
    onError: () => toast.error('Failed to delete connection'),
  })

  function handleConnect(c: WsConnection) {
    closeOverlay()

    if (c.type === 'ssh') {
      navigate({
        to: '/ssh',
        search: {
          host: c.host,
          port: c.port ?? 22,
          username: c.username ?? '',
          ws_workspace_id: c.vault_item_id ? workspaceId : undefined,
          ws_vault_item_id: c.vault_item_id ?? undefined,
        },
      })
      return
    }

    if (c.type === 'sftp') {
      navigate({
        to: '/files',
        search: {
          host: c.host,
          port: String(c.port ?? 22),
          username: c.username ?? '',
          ws_workspace_id: c.vault_item_id ? workspaceId : undefined,
          ws_vault_item_id: c.vault_item_id ?? undefined,
        },
      })
      return
    }

    if (c.type === 'ftp') {
      navigate({
        to: '/files',
        search: {
          host: c.host,
          port: String(c.port ?? 21),
          username: c.username ?? '',
          ws_workspace_id: undefined,
          ws_vault_item_id: undefined,
        },
      })
      return
    }

    if (c.type === 'web') {
      const url = c.host?.startsWith('http') ? c.host : `https://${c.host}`
      navigate({ to: '/web-viewer', search: { url, name: c.name } })
      return
    }

    if (c.type === 'docker') {
      navigate({ to: '/docker' })
      return
    }

    if (c.type === 'rdp') {
      const host = c.host
      const port = c.port ?? 3389
      shellOpen(`rdp:full%20address=s:${host}:${port}`)
      return
    }

    if (c.type === 'vnc') {
      shellOpen(`vnc://${c.host}:${c.port ?? 5900}`)
      return
    }

    if (c.type === 'telnet') {
      shellOpen(`telnet://${c.host}:${c.port ?? 23}`)
      return
    }

    toast.info(`${TYPE_META[c.type as ConnType]?.label ?? c.type} — coming soon`)
  }

  return (
    <div className='flex flex-col gap-4 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='font-semibold'>Connections</h3>
          <p className='text-xs text-muted-foreground mt-0.5'>{connections.length} saved endpoints</p>
        </div>
        {isAdmin && (
          <Button size='sm' onClick={() => setAddOpen(true)}>
            <Plus className='h-4 w-4 mr-1' /> Add connection
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className='py-10 text-center text-sm text-muted-foreground'>Loading…</div>
      ) : connections.length === 0 ? (
        <div className='rounded-lg border border-dashed border-border/50 py-16 flex flex-col items-center gap-3 text-center'>
          <p className='text-sm text-muted-foreground'>No connections yet</p>
          {isAdmin && (
            <Button size='sm' variant='outline' onClick={() => setAddOpen(true)}>
              <Plus className='h-4 w-4 mr-1' /> Add first connection
            </Button>
          )}
        </div>
      ) : (
        <div className='rounded-lg border border-border/50 bg-card divide-y divide-border/30'>
          {connections.map((c) => {
            const meta = TYPE_META[c.type as ConnType]
            const Icon = meta?.icon ?? Server
            const result = testResults[c.id]
            return (
              <div key={c.id} className='flex items-center gap-3 px-4 py-3'>
                <HealthDot result={result} />
                <Icon className='h-4 w-4 text-muted-foreground shrink-0' />
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <p className='text-sm font-medium truncate'>{c.name}</p>
                    <Badge variant='outline' className='text-[10px] shrink-0 uppercase'>{c.type}</Badge>
                    {c.vault_item_id && (
                      <Badge variant='outline' className='text-[10px] shrink-0 text-violet-400 border-violet-500/30'>vault</Badge>
                    )}
                  </div>
                  <p className='text-xs text-muted-foreground truncate'>
                    {c.username ? `${c.username}@` : ''}{c.host}{c.port ? `:${c.port}` : ''}
                    {result?.response_ms != null && (
                      <span className='ml-2 tabular-nums text-muted-foreground/60'>{result.response_ms}ms</span>
                    )}
                  </p>
                </div>
                {c.group_name && (
                  <span className='text-xs text-muted-foreground shrink-0'>{c.group_name}</span>
                )}
                <div className='flex items-center gap-1 shrink-0'>
                  {/* Test button */}
                  <Button
                    size='sm' variant='ghost'
                    className='h-7 w-7 p-0 text-muted-foreground hover:text-amber-400'
                    disabled={testing === c.id}
                    onClick={() => handleTest(c)}
                    title='Test reachability'
                  >
                    {testing === c.id
                      ? <Loader2 className='h-3.5 w-3.5 animate-spin' />
                      : <Zap className='h-3.5 w-3.5' />}
                  </Button>
                  {/* Connect button */}
                  {meta && (
                    <Button
                      variant='outline' size='sm'
                      className={`h-7 gap-1.5 border px-2.5 text-xs font-medium transition-colors ${meta.color}`}
                      onClick={() => handleConnect(c)}
                    >
                      <meta.icon className='h-3 w-3' />
                      {meta.label}
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button
                        size='sm' variant='ghost' className='h-7 w-7 p-0 text-muted-foreground hover:text-foreground'
                        onClick={() => setEditTarget(c)}
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        size='sm' variant='ghost' className='h-7 w-7 p-0 text-muted-foreground hover:text-destructive'
                        onClick={() => deleteConn.mutate(c.id)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <AddConnectionDialog
          open={addOpen}
          workspaceId={workspaceId}
          vaultItems={vaultItems}
          onClose={() => setAddOpen(false)}
        />
      )}
      {isAdmin && editTarget && (
        <EditConnectionDialog
          conn={editTarget}
          workspaceId={workspaceId}
          vaultItems={vaultItems}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Shared vault picker ──────────────────────────────────────────────────────

function VaultPicker({
  vaultItems, value, onChange,
}: { vaultItems: VaultItem[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label>Vault credential <span className='text-muted-foreground font-normal'>(optional)</span></Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className='rounded-md border border-input bg-background px-3 py-2 text-sm'
      >
        <option value=''>— None (enter password at connect time) —</option>
        {vaultItems.map((item) => (
          <option key={item.id} value={item.id}>{item.name} ({item.item_type})</option>
        ))}
      </select>
      {vaultItems.length === 0 && (
        <p className='text-[11px] text-muted-foreground'>Unlock the Vault tab first to see available credentials.</p>
      )}
    </div>
  )
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────

function EditConnectionDialog({
  conn, workspaceId, vaultItems, onClose,
}: { conn: WsConnection; workspaceId: string; vaultItems: VaultItem[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(conn.name)
  const [type, setType] = useState(conn.type)
  const [host, setHost] = useState(conn.host ?? '')
  const [port, setPort] = useState(conn.port?.toString() ?? '')
  const [username, setUsername] = useState(conn.username ?? '')
  const [group, setGroup] = useState(conn.group_name ?? '')
  const [vaultItemId, setVaultItemId] = useState(conn.vault_item_id ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !host.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('workspace_connections').update({
        name: name.trim(), type, host: host.trim(),
        port: port ? Number(port) : null,
        username: username.trim() || null,
        group_name: group.trim() || null,
        vault_item_id: vaultItemId || null,
      }).eq('id', conn.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['ws-connections', workspaceId] })
      toast.success('Connection updated')
      onClose()
    } catch {
      toast.error('Failed to update connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader><DialogTitle>Edit connection</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className='flex flex-col gap-3'>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className='flex flex-col gap-1.5 w-28'>
              <Label>Type</Label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className='rounded-md border border-input bg-background px-3 py-2 text-sm'>
                {SELECTABLE_CONN_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Host</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className='flex flex-col gap-1.5 w-24'>
              <Label>Port</Label>
              <Input type='number' value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          </div>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Group</Label>
              <Input value={group} onChange={(e) => setGroup(e.target.value)} />
            </div>
          </div>
          <VaultPicker vaultItems={vaultItems} value={vaultItemId} onChange={setVaultItemId} />
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={saving || !name.trim() || !host.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add dialog ───────────────────────────────────────────────────────────────

function AddConnectionDialog({
  open, workspaceId, vaultItems, onClose,
}: { open: boolean; workspaceId: string; vaultItems: VaultItem[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('ssh')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [username, setUsername] = useState('')
  const [group, setGroup] = useState('')
  const [vaultItemId, setVaultItemId] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !host.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('workspace_connections').insert({
        workspace_id: workspaceId,
        name: name.trim(),
        type,
        host: host.trim(),
        port: port ? Number(port) : null,
        username: username.trim() || null,
        group_name: group.trim() || null,
        vault_item_id: vaultItemId || null,
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['ws-connections', workspaceId] })
      toast.success('Connection saved')
      setName(''); setHost(''); setPort(''); setUsername(''); setGroup(''); setType('ssh'); setVaultItemId('')
      onClose()
    } catch {
      toast.error('Failed to save connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader><DialogTitle>Add connection</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className='flex flex-col gap-3'>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Prod server' autoFocus />
            </div>
            <div className='flex flex-col gap-1.5 w-28'>
              <Label>Type</Label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className='rounded-md border border-input bg-background px-3 py-2 text-sm'>
                {SELECTABLE_CONN_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Host</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder='192.168.1.1' />
            </div>
            <div className='flex flex-col gap-1.5 w-24'>
              <Label>Port</Label>
              <Input type='number' value={port} onChange={(e) => setPort(e.target.value)} placeholder='22' />
            </div>
          </div>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder='root' />
            </div>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Group</Label>
              <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder='Production' />
            </div>
          </div>
          <VaultPicker vaultItems={vaultItems} value={vaultItemId} onChange={setVaultItemId} />
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={saving || !name.trim() || !host.trim()}>Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
