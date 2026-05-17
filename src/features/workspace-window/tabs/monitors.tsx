import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CheckCircle, XCircle, Clock, ToggleLeft, ToggleRight, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface Props { workspaceId: string; isAdmin: boolean }

const MONITOR_TYPES = ['http', 'ping', 'tcp', 'dns', 'ssl'] as const

export function MonitorsTab({ workspaceId, isAdmin }: Props) {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<null | {
    id: string; name: string; type: string; target: string; interval_seconds: number
  }>(null)

  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ['ws-monitors', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_monitors')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
      return data ?? []
    },
  })

  const deleteMon = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workspace_monitors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ws-monitors', workspaceId] }),
    onError: () => toast.error('Failed to delete monitor'),
  })

  const toggleMon = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('workspace_monitors').update({ enabled }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ws-monitors', workspaceId] }),
  })

  return (
    <div className='flex flex-col gap-4 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='font-semibold'>Monitors</h3>
          <p className='text-xs text-muted-foreground mt-0.5'>{monitors.length} configured</p>
        </div>
        {isAdmin && (
          <Button size='sm' onClick={() => setAddOpen(true)}>
            <Plus className='h-4 w-4 mr-1' /> Add monitor
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className='py-10 text-center text-sm text-muted-foreground'>Loading…</div>
      ) : monitors.length === 0 ? (
        <div className='rounded-lg border border-dashed border-border/50 py-16 flex flex-col items-center gap-3 text-center'>
          <p className='text-sm text-muted-foreground'>No monitors yet</p>
          {isAdmin && (
            <Button size='sm' variant='outline' onClick={() => setAddOpen(true)}>
              <Plus className='h-4 w-4 mr-1' /> Add first monitor
            </Button>
          )}
        </div>
      ) : (
        <div className='rounded-lg border border-border/50 bg-card divide-y divide-border/30'>
          {monitors.map((m: {
            id: string; name: string; type: string; target: string;
            status: string; enabled: boolean; response_ms: number; interval_seconds: number
          }) => (
            <div key={m.id} className='flex items-center gap-3 px-4 py-3'>
              <StatusDot status={m.status} enabled={m.enabled} />
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                  <p className='text-sm font-medium truncate'>{m.name}</p>
                  <Badge variant='outline' className='text-[10px] shrink-0 capitalize'>{m.type}</Badge>
                  {!m.enabled && <Badge variant='outline' className='text-[10px] shrink-0 text-muted-foreground'>Paused</Badge>}
                </div>
                <p className='text-xs text-muted-foreground truncate'>{m.target}</p>
              </div>
              <div className='text-right text-xs text-muted-foreground shrink-0'>
                {m.response_ms != null && <p className='tabular-nums'>{m.response_ms}ms</p>}
                <p>every {m.interval_seconds}s</p>
              </div>
              {isAdmin && (
                <div className='flex items-center gap-1 shrink-0'>
                  <Button
                    size='sm' variant='ghost' className='h-7 w-7 p-0'
                    onClick={() => toggleMon.mutate({ id: m.id, enabled: !m.enabled })}
                  >
                    {m.enabled
                      ? <ToggleRight className='h-4 w-4 text-emerald-500' />
                      : <ToggleLeft className='h-4 w-4 text-muted-foreground' />}
                  </Button>
                  <Button
                    size='sm' variant='ghost' className='h-7 w-7 p-0 text-muted-foreground hover:text-foreground'
                    onClick={() => setEditTarget({ id: m.id, name: m.name, type: m.type, target: m.target, interval_seconds: m.interval_seconds })}
                  >
                    <Pencil className='h-3.5 w-3.5' />
                  </Button>
                  <Button
                    size='sm' variant='ghost' className='h-7 w-7 p-0 text-muted-foreground hover:text-destructive'
                    onClick={() => deleteMon.mutate(m.id)}
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
        <AddMonitorDialog open={addOpen} workspaceId={workspaceId} onClose={() => setAddOpen(false)} />
      )}
      {isAdmin && editTarget && (
        <EditMonitorDialog monitor={editTarget} workspaceId={workspaceId} onClose={() => setEditTarget(null)} />
      )}
    </div>
  )
}

function StatusDot({ status, enabled }: { status: string; enabled: boolean }) {
  if (!enabled) return <div className='h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0' />
  if (status === 'up') return <CheckCircle className='h-4 w-4 text-emerald-500 shrink-0' />
  if (status === 'down') return <XCircle className='h-4 w-4 text-red-500 shrink-0' />
  return <Clock className='h-4 w-4 text-amber-500/60 shrink-0' />
}

function EditMonitorDialog({
  monitor, workspaceId, onClose,
}: { monitor: { id: string; name: string; type: string; target: string; interval_seconds: number }; workspaceId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(monitor.name)
  const [type, setType] = useState(monitor.type)
  const [target, setTarget] = useState(monitor.target)
  const [interval, setInterval] = useState(monitor.interval_seconds)
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !target.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('workspace_monitors').update({
        name: name.trim(), type, target: target.trim(), interval_seconds: interval,
      }).eq('id', monitor.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['ws-monitors', workspaceId] })
      toast.success('Monitor updated')
      onClose()
    } catch {
      toast.error('Failed to update monitor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader><DialogTitle>Edit monitor</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1.5'>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Type</Label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className='rounded-md border border-input bg-background px-3 py-2 text-sm'>
                {MONITOR_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div className='flex flex-col gap-1.5 w-28'>
              <Label>Interval (s)</Label>
              <Input type='number' value={interval} onChange={(e) => setInterval(Number(e.target.value))} min={30} />
            </div>
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label>Target</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={saving || !name.trim() || !target.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddMonitorDialog({ open, workspaceId, onClose }: { open: boolean; workspaceId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('http')
  const [target, setTarget] = useState('')
  const [interval, setInterval] = useState(300)
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !target.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('workspace_monitors').insert({
        workspace_id: workspaceId,
        name: name.trim(),
        type,
        target: target.trim(),
        interval_seconds: interval,
        timeout_seconds: 10,
        status: 'pending',
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['ws-monitors', workspaceId] })
      toast.success('Monitor added')
      setName(''); setTarget(''); setType('http'); setInterval(300)
      onClose()
    } catch {
      toast.error('Failed to add monitor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader><DialogTitle>Add monitor</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1.5'>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='My API' autoFocus />
          </div>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className='rounded-md border border-input bg-background px-3 py-2 text-sm'
              >
                {MONITOR_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div className='flex flex-col gap-1.5 w-28'>
              <Label>Interval (s)</Label>
              <Input type='number' value={interval} onChange={(e) => setInterval(Number(e.target.value))} min={30} />
            </div>
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label>Target</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder='https://example.com' />
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={saving || !name.trim() || !target.trim()}>Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
