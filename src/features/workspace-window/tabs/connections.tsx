import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Terminal, Globe, Server, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface Props { workspaceId: string; isAdmin: boolean }

const CONN_TYPES = ['ssh', 'sftp', 'ftp', 'rdp', 'vnc', 'telnet', 'docker', 'web'] as const

function ConnIcon({ type }: { type: string }) {
  if (type === 'ssh' || type === 'sftp' || type === 'telnet') return <Terminal className='h-4 w-4 text-muted-foreground shrink-0' />
  if (type === 'web') return <Globe className='h-4 w-4 text-muted-foreground shrink-0' />
  return <Server className='h-4 w-4 text-muted-foreground shrink-0' />
}

export function ConnectionsTab({ workspaceId, isAdmin }: Props) {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<null | {
    id: string; name: string; type: string; host: string; port: number | null; username: string | null; group_name: string | null
  }>(null)

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['ws-connections', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_connections')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
      return data ?? []
    },
  })

  const deleteConn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workspace_connections').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ws-connections', workspaceId] }),
    onError: () => toast.error('Failed to delete connection'),
  })

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
          {connections.map((c: {
            id: string; name: string; type: string; host: string; port: number; username: string; group_name: string
          }) => (
            <div key={c.id} className='flex items-center gap-3 px-4 py-3'>
              <ConnIcon type={c.type} />
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                  <p className='text-sm font-medium truncate'>{c.name}</p>
                  <Badge variant='outline' className='text-[10px] shrink-0 uppercase'>{c.type}</Badge>
                </div>
                <p className='text-xs text-muted-foreground truncate'>
                  {c.username ? `${c.username}@` : ''}{c.host}{c.port ? `:${c.port}` : ''}
                </p>
              </div>
              {c.group_name && (
                <span className='text-xs text-muted-foreground shrink-0'>{c.group_name}</span>
              )}
              {isAdmin && (
                <div className='flex items-center gap-1 shrink-0'>
                  <Button
                    size='sm' variant='ghost' className='h-7 w-7 p-0 text-muted-foreground hover:text-foreground'
                    onClick={() => setEditTarget({ id: c.id, name: c.name, type: c.type, host: c.host, port: c.port, username: c.username, group_name: c.group_name })}
                  >
                    <Pencil className='h-3.5 w-3.5' />
                  </Button>
                  <Button
                    size='sm' variant='ghost' className='h-7 w-7 p-0 text-muted-foreground hover:text-destructive'
                    onClick={() => deleteConn.mutate(c.id)}
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <AddConnectionDialog open={addOpen} workspaceId={workspaceId} onClose={() => setAddOpen(false)} />
      )}
      {isAdmin && editTarget && (
        <EditConnectionDialog conn={editTarget} workspaceId={workspaceId} onClose={() => setEditTarget(null)} />
      )}
    </div>
  )
}

function EditConnectionDialog({
  conn, workspaceId, onClose,
}: {
  conn: { id: string; name: string; type: string; host: string; port: number | null; username: string | null; group_name: string | null }
  workspaceId: string; onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(conn.name)
  const [type, setType] = useState(conn.type)
  const [host, setHost] = useState(conn.host ?? '')
  const [port, setPort] = useState(conn.port?.toString() ?? '')
  const [username, setUsername] = useState(conn.username ?? '')
  const [group, setGroup] = useState(conn.group_name ?? '')
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
                {CONN_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
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
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={saving || !name.trim() || !host.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddConnectionDialog({ open, workspaceId, onClose }: { open: boolean; workspaceId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('ssh')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [username, setUsername] = useState('')
  const [group, setGroup] = useState('')
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
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['ws-connections', workspaceId] })
      toast.success('Connection saved')
      setName(''); setHost(''); setPort(''); setUsername(''); setGroup(''); setType('ssh')
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
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className='rounded-md border border-input bg-background px-3 py-2 text-sm'
              >
                {CONN_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
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
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={saving || !name.trim() || !host.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
