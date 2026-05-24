import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Plus, Pencil, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { db, type MaintenanceWindow, type CreateMaintenanceWindowInput } from '@/lib/db'
import { toast } from 'sonner'

// ── Helpers ───────────────────────────────────────────────────────────────────

function windowStatus(w: MaintenanceWindow): 'active' | 'upcoming' | 'past' {
  const now = new Date()
  const start = new Date(w.starts_at)
  const end = new Date(w.ends_at)
  if (now >= start && now <= end) return 'active'
  if (now < start) return 'upcoming'
  return 'past'
}

function formatRange(starts_at: string, ends_at: string) {
  const fmt = (s: string) =>
    new Date(s).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  return `${fmt(starts_at)} → ${fmt(ends_at)}`
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toIso(localValue: string): string {
  return new Date(localValue).toISOString()
}

// ── Form dialog ───────────────────────────────────────────────────────────────

interface WindowFormState {
  name: string
  monitor_id: string
  starts_at: string
  ends_at: string
  repeat: string
}

const EMPTY_FORM: WindowFormState = {
  name: '',
  monitor_id: 'all',
  starts_at: '',
  ends_at: '',
  repeat: 'none',
}

function WindowDialog({ open, onOpenChange, editing, onSave }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: MaintenanceWindow | null
  onSave: (input: CreateMaintenanceWindowInput & { id?: string }) => Promise<void>
}) {
  const { data: monitors = [] } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => db.listMonitors(),
  })

  const [form, setForm] = useState<WindowFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        monitor_id: editing.monitor_id ?? 'all',
        starts_at: toLocalInputValue(editing.starts_at),
        ends_at: toLocalInputValue(editing.ends_at),
        repeat: editing.repeat ?? 'none',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, editing])

  function set(key: keyof WindowFormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.starts_at || !form.ends_at) {
      toast.error('Fill in name, start, and end')
      return
    }
    if (new Date(form.starts_at) >= new Date(form.ends_at)) {
      toast.error('End must be after start')
      return
    }
    setSaving(true)
    try {
      await onSave({
        id: editing?.id,
        name: form.name.trim(),
        monitor_id: form.monitor_id === 'all' ? null : form.monitor_id,
        starts_at: toIso(form.starts_at),
        ends_at: toIso(form.ends_at),
        repeat: form.repeat === 'none' ? null : (form.repeat as 'daily' | 'weekly' | 'monthly'),
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit maintenance window' : 'New maintenance window'}</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div>
            <Label className='text-xs text-muted-foreground'>Name</Label>
            <Input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder='Scheduled maintenance'
              className='mt-1 h-8 text-sm'
              autoFocus
            />
          </div>
          <div>
            <Label className='text-xs text-muted-foreground'>Monitor</Label>
            <Select value={form.monitor_id} onValueChange={v => set('monitor_id', v)}>
              <SelectTrigger className='mt-1 h-8 text-sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All monitors</SelectItem>
                {monitors.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label className='text-xs text-muted-foreground'>Start</Label>
              <Input
                type='datetime-local'
                value={form.starts_at}
                onChange={e => set('starts_at', e.target.value)}
                className='mt-1 h-8 text-xs'
              />
            </div>
            <div>
              <Label className='text-xs text-muted-foreground'>End</Label>
              <Input
                type='datetime-local'
                value={form.ends_at}
                onChange={e => set('ends_at', e.target.value)}
                className='mt-1 h-8 text-xs'
              />
            </div>
          </div>
          <div>
            <Label className='text-xs text-muted-foreground'>Repeat</Label>
            <Select value={form.repeat} onValueChange={v => set('repeat', v)}>
              <SelectTrigger className='mt-1 h-8 text-sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>No repeat</SelectItem>
                <SelectItem value='daily'>Daily</SelectItem>
                <SelectItem value='weekly'>Weekly</SelectItem>
                <SelectItem value='monthly'>Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size='sm' onClick={handleSave} disabled={saving}>
            {editing ? 'Save changes' : 'Create'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Window row ────────────────────────────────────────────────────────────────

function WindowRow({ window: w, monitors, onEdit, onDelete }: {
  window: MaintenanceWindow
  monitors: { id: string; name: string }[]
  onEdit: () => void
  onDelete: () => void
}) {
  const status = windowStatus(w)
  const monitorName = w.monitor_id
    ? (monitors.find(m => m.id === w.monitor_id)?.name ?? 'Unknown monitor')
    : 'All monitors'

  return (
    <div className='group relative flex items-center gap-4 rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:border-border'>
      <div className={`absolute left-0 top-0 h-full w-[3px] rounded-l-lg ${
        status === 'active' ? 'bg-amber-500' : status === 'upcoming' ? 'bg-blue-500' : 'bg-border'
      }`} />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium'>{w.name}</span>
          {status === 'active' && (
            <Badge className='border-0 bg-amber-500/15 text-amber-400 text-[10px] px-1.5 py-0'>Active</Badge>
          )}
          {status === 'upcoming' && (
            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>Upcoming</Badge>
          )}
          {status === 'past' && (
            <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-muted-foreground'>Past</Badge>
          )}
          {w.repeat && (
            <Badge variant='outline' className='text-[10px] px-1.5 py-0 capitalize'>{w.repeat}</Badge>
          )}
        </div>
        <p className='mt-0.5 text-xs text-muted-foreground'>
          {monitorName} · {formatRange(w.starts_at, w.ends_at)}
        </p>
      </div>
      <div className='flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
        <Button variant='ghost' size='icon' className='h-7 w-7' onClick={onEdit}>
          <Pencil className='h-3.5 w-3.5' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          className='h-7 w-7 text-muted-foreground hover:text-destructive'
          onClick={onDelete}
        >
          <Trash2 className='h-3.5 w-3.5' />
        </Button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function MaintenanceWindows() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MaintenanceWindow | null>(null)

  const { data: windows = [], isLoading } = useQuery({
    queryKey: ['maintenance-windows'],
    queryFn: () => db.listMaintenanceWindows(),
  })

  const { data: monitors = [] } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => db.listMonitors(),
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateMaintenanceWindowInput) => db.createMaintenanceWindow(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-windows'] }),
  })

  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof db.updateMaintenanceWindow>[0]) => db.updateMaintenanceWindow(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-windows'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => db.deleteMaintenanceWindow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-windows'] }),
  })

  async function handleSave(input: CreateMaintenanceWindowInput & { id?: string }) {
    if (input.id) {
      await updateMutation.mutateAsync({ id: input.id, ...input })
      toast.success('Maintenance window updated')
    } else {
      await createMutation.mutateAsync(input)
      toast.success('Maintenance window created')
    }
  }

  const activeCount = windows.filter(w => windowStatus(w) === 'active').length

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <CalendarClock className='h-4 w-4 text-muted-foreground' />
          <span className='font-semibold'>Maintenance</span>
          {activeCount > 0 && (
            <Badge className='border-0 bg-amber-500/15 text-amber-400 text-xs'>{activeCount} active</Badge>
          )}
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold tracking-tight'>Maintenance Windows</h2>
            <p className='text-xs text-muted-foreground'>
              Suppress alerts for planned downtime. Active windows block incident creation and notifications.
            </p>
          </div>
          <Button size='sm' onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            New window
          </Button>
        </div>

        {isLoading ? (
          <p className='text-xs text-muted-foreground'>Loading...</p>
        ) : windows.length === 0 ? (
          <div className='flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border'>
            <CalendarClock className='h-8 w-8 text-muted-foreground/40' />
            <div className='text-center'>
              <p className='text-sm font-medium'>No maintenance windows</p>
              <p className='text-xs text-muted-foreground'>Create one to silence alerts during planned downtime.</p>
            </div>
            <Button size='sm' onClick={() => { setEditing(null); setDialogOpen(true) }}>
              <Plus className='mr-1.5 h-3.5 w-3.5' />New window
            </Button>
          </div>
        ) : (
          <div className='flex flex-col gap-2'>
            {windows.map(w => (
              <WindowRow
                key={w.id}
                window={w}
                monitors={monitors}
                onEdit={() => { setEditing(w); setDialogOpen(true) }}
                onDelete={() => deleteMutation.mutate(w.id)}
              />
            ))}
          </div>
        )}
      </Main>

      <WindowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSave={handleSave}
      />
    </>
  )
}
