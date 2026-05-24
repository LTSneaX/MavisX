import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { open } from '@tauri-apps/plugin-shell'
import { Globe, Copy, ExternalLink, Check, RefreshCw, Loader2, Plus, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/db'
import { usePlanStore } from '@/stores/plan-store'
import { toast } from 'sonner'

type StatusPage = { id: string; name: string; slug: string; last_generated: string | null; created_at: string }

const PLAN_LIMITS: Record<string, number> = { free: 1, pro: 3, enterprise: 5 }

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── Add page dialog ───────────────────────────────────────────────────────────

function AddPageDialog({ open: dialogOpen, onOpenChange, onCreate }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreate: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onCreate(name.trim())
      setName('')
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-sm'>
        <div className='flex flex-col gap-4'>
          <p className='text-sm font-semibold'>New status page</p>
          <div>
            <Label className='text-xs text-muted-foreground'>Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder='Infrastructure, Backend Services...'
              className='mt-1 h-8 text-sm'
              autoFocus
            />
          </div>
          <Button size='sm' onClick={handleSave} disabled={saving || !name.trim()}>
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Page card ─────────────────────────────────────────────────────────────────

function PageCard({ page, onDelete }: { page: StatusPage; onDelete: () => void }) {
  const qc = useQueryClient()
  const [generating, setGenerating] = useState(false)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate() {
    setGenerating(true)
    try {
      const path = await db.generateStatusPage(page.id)
      setOutputPath(path)
      qc.invalidateQueries({ queryKey: ['status-pages'] })
      toast.success('Status page generated')
    } catch (e) {
      toast.error(String(e))
    } finally {
      setGenerating(false)
    }
  }

  async function copyPath() {
    const p = outputPath
    if (!p) return
    await navigator.clipboard.writeText(p)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function openInBrowser() {
    const p = outputPath
    if (!p) return
    const fileUrl = p.startsWith('/') ? `file://${p}` : `file:///${p.replace(/\\/g, '/')}`
    await open(fileUrl)
  }

  return (
    <div className='group relative flex flex-col gap-3 rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:border-border'>
      <div className='absolute left-0 top-0 h-full w-[3px] bg-indigo-500 rounded-l-lg' />
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-sm font-medium'>{page.name}</p>
          {page.last_generated && (
            <p className='mt-0.5 text-xs text-muted-foreground'>
              Last generated {formatDate(page.last_generated)}
            </p>
          )}
        </div>
        <Button
          variant='ghost'
          size='icon'
          className='h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive'
          onClick={onDelete}
        >
          <Trash2 className='h-3.5 w-3.5' />
        </Button>
      </div>

      <div className='flex items-center gap-2'>
        <Button size='sm' className='h-7 gap-1.5 text-xs' onClick={generate} disabled={generating}>
          {generating
            ? <Loader2 className='h-3 w-3 animate-spin' />
            : <RefreshCw className='h-3 w-3' />}
          {outputPath ? 'Regenerate' : 'Generate'}
        </Button>
      </div>

      {outputPath && (
        <>
          <Separator />
          <div className='flex flex-col gap-2'>
            <div className='bg-muted flex items-center gap-2 rounded-md px-3 py-1.5'>
              <code className='text-muted-foreground min-w-0 flex-1 truncate text-[11px]'>
                {outputPath}
              </code>
              <Button variant='ghost' size='icon' className='h-5 w-5 shrink-0' onClick={copyPath}>
                {copied
                  ? <Check className='h-3 w-3 text-green-500' />
                  : <Copy className='h-3 w-3' />}
              </Button>
            </div>
            <Button variant='outline' size='sm' className='h-7 w-fit gap-1.5 text-xs' onClick={openInBrowser}>
              <ExternalLink className='h-3 w-3' />
              Open in browser
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main feature ──────────────────────────────────────────────────────────────

export function StatusPageFeature() {
  const plan = usePlanStore(s => s.plan)
  const limit = PLAN_LIMITS[plan] ?? 1
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['status-pages'],
    queryFn: () => db.listStatusPages(),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => db.createStatusPage(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status-pages'] }),
    onError: (e) => toast.error(String(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => db.deleteStatusPage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status-pages'] }),
  })

  const atLimit = pages.length >= limit

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <Globe className='h-4 w-4 text-muted-foreground' />
          <span className='font-semibold'>Status Page</span>
          <Badge variant='outline' className='tabular-nums text-xs'>{pages.length} / {limit}</Badge>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold tracking-tight'>Status Pages</h2>
            <p className='text-xs text-muted-foreground'>
              Generate static HTML exports you can host anywhere — Nginx, GitHub Pages, Cloudflare.
            </p>
          </div>
          <Button
            size='sm'
            onClick={() => setAddOpen(true)}
            disabled={atLimit}
            title={atLimit ? `${limit}-page limit on ${plan} plan` : undefined}
          >
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            New page
          </Button>
        </div>

        {isLoading ? (
          <p className='text-xs text-muted-foreground'>Loading...</p>
        ) : pages.length === 0 ? (
          <div className='flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border'>
            <Globe className='h-8 w-8 text-muted-foreground/40' />
            <div className='text-center'>
              <p className='text-sm font-medium'>No status pages yet</p>
              <p className='text-xs text-muted-foreground'>Create your first page to get a shareable status export.</p>
            </div>
            <Button size='sm' onClick={() => setAddOpen(true)}>
              <Plus className='mr-1.5 h-3.5 w-3.5' />New page
            </Button>
          </div>
        ) : (
          <div className='flex flex-col gap-2'>
            {pages.map(p => (
              <PageCard
                key={p.id}
                page={p}
                onDelete={() => deleteMutation.mutate(p.id)}
              />
            ))}
            {atLimit && (
              <p className='text-xs text-muted-foreground'>
                {limit}-page limit reached on {plan} plan.
                {plan !== 'enterprise' && ' Upgrade for more.'}
              </p>
            )}
          </div>
        )}
      </Main>

      <AddPageDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={name => createMutation.mutateAsync(name)}
      />
    </>
  )
}
