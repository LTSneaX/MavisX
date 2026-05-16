import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { db } from '@/lib/db'
import { ExternalLink, Globe, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

// Extract a display hostname from a URL or bare host
function parseHost(raw: string): string {
  try {
    const url = raw.startsWith('http') ? raw : `https://${raw}`
    return new URL(url).hostname
  } catch {
    return raw
  }
}

function faviconUrl(rawUrl: string): string {
  const host = parseHost(rawUrl)
  return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
}

function normalizeUrl(raw: string): string {
  if (!raw) return raw
  return raw.startsWith('http') ? raw : `https://${raw}`
}

// ── Add bookmark dialog ────────────────────────────────────────────────────────

interface AddDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdd: (name: string, url: string) => Promise<void>
}

function AddBookmarkDialog({ open, onOpenChange, onAdd }: AddDialogProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim() || !url.trim()) return
    setSaving(true)
    try {
      await onAdd(name.trim(), url.trim())
      setName(''); setUrl('')
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle className='text-sm font-semibold'>Add web bookmark</DialogTitle>
        </DialogHeader>
        <div className='space-y-3 pt-1'>
          <div>
            <Label className='text-xs text-muted-foreground'>Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='Grafana'
              className='mt-1 h-8 text-sm'
            />
          </div>
          <div>
            <Label className='text-xs text-muted-foreground'>URL</Label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder='https://grafana.local or 192.168.1.10:3000'
              className='mt-1 h-8 font-mono text-sm'
            />
          </div>
          <Button size='sm' className='w-full' onClick={handleSave} disabled={saving || !name || !url}>
            Add bookmark
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Web card ──────────────────────────────────────────────────────────────────

interface WebCardProps {
  id: string
  name: string
  url: string
  onDelete: (id: string) => void
}

function WebCard({ id, name, url, onDelete }: WebCardProps) {
  const [imgErr, setImgErr] = useState(false)
  const normalized = normalizeUrl(url)
  const host = parseHost(url)

  async function handleOpen() {
    try {
      await shellOpen(normalized)
    } catch {
      toast.error('Could not open URL')
    }
  }

  return (
    <div className='group relative flex flex-col overflow-hidden rounded-lg border border-border/50 bg-card transition-colors hover:border-border'>
      <div className='absolute left-0 top-0 h-full w-[3px] bg-indigo-500 rounded-l-lg' />
      <div className='flex items-start gap-3 px-4 pt-3 pb-2'>
        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted'>
          {!imgErr ? (
            <img
              src={faviconUrl(url)}
              alt=''
              className='h-5 w-5'
              onError={() => setImgErr(true)}
            />
          ) : (
            <Globe className='h-4 w-4 text-muted-foreground' />
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium leading-tight'>{name}</p>
          <p className='mt-0.5 truncate font-mono text-[11px] text-muted-foreground'>{host}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100'
            >
              <MoreHorizontal className='h-3.5 w-3.5' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              className='text-destructive focus:text-destructive'
              onClick={() => onDelete(id)}
            >
              <Trash2 className='mr-2 h-3.5 w-3.5' />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className='px-4 pb-3'>
        <Button
          size='sm'
          className='h-7 w-full gap-1.5 text-xs'
          onClick={handleOpen}
        >
          <ExternalLink className='h-3 w-3' />
          Open
        </Button>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function WebViewer() {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => db.listConnections(),
    select: data => data.filter(c => c.type === 'web'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => db.deleteConnection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  const saveMutation = useMutation({
    mutationFn: ({ name, url }: { name: string; url: string }) =>
      db.saveConnection({ name, type: 'web', host: url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      toast.success('Bookmark added')
    },
  })

  const filtered = connections.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.host ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <Globe className='h-4 w-4 text-muted-foreground' />
          <span className='font-semibold'>Web Viewer</span>
          <Badge variant='outline' className='tabular-nums text-xs'>{connections.length}</Badge>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold tracking-tight'>Web Viewer</h2>
            <p className='text-xs text-muted-foreground'>
              Quick-launch bookmarks for Grafana, Proxmox, router, NAS, or any internal webapp
            </p>
          </div>
          <Button size='sm' onClick={() => setAddOpen(true)}>
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            Add bookmark
          </Button>
        </div>

        {connections.length > 3 && (
          <Input
            placeholder='Search bookmarks...'
            value={search}
            onChange={e => setSearch(e.target.value)}
            className='h-8 max-w-xs text-sm'
          />
        )}

        {isLoading ? (
          <p className='text-xs text-muted-foreground'>Loading...</p>
        ) : filtered.length === 0 ? (
          <div className='flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border'>
            <Globe className='h-8 w-8 text-muted-foreground/40' />
            <div className='text-center'>
              <p className='text-sm font-medium'>
                {connections.length === 0 ? 'No bookmarks yet' : 'No results'}
              </p>
              <p className='text-xs text-muted-foreground'>
                {connections.length === 0
                  ? 'Add Grafana, Proxmox, your router — any internal webapp.'
                  : 'Try a different search term.'}
              </p>
            </div>
            {connections.length === 0 && (
              <Button size='sm' onClick={() => setAddOpen(true)}>
                <Plus className='mr-1.5 h-3.5 w-3.5' />Add bookmark
              </Button>
            )}
          </div>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
            {filtered.map(c => (
              <WebCard
                key={c.id}
                id={c.id}
                name={c.name}
                url={c.host ?? ''}
                onDelete={id => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </Main>

      <AddBookmarkDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(name, url) => saveMutation.mutateAsync({ name, url })}
      />
    </>
  )
}
