import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { vault, type VaultMeta, type VaultItemMeta, VAULT_ITEM_TYPE_LABELS } from '@/lib/vault'
import { ENABLE_ENTERPRISE } from '@/config/features'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { VaultItemDialog } from './components/vault-item-dialog'
import {
  ShieldCheck, Lock, Unlock, Plus, MoreHorizontal, Trash2,
  Pencil, KeyRound, Eye, EyeOff, ChevronDown, ChevronUp,
} from 'lucide-react'
import { usePlanStore } from '@/stores/plan-store'

function useVaultLimit(): number {
  const plan = usePlanStore((s) => s.plan)
  if (plan === 'enterprise') return 10
  if (plan === 'pro') return 3
  return 1
}

// ─── Create vault dialog ──────────────────────────────────────────────────────

function CreateVaultDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (v: VaultMeta) => void }) {
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(''); setPw(''); setConfirm(''); setErr('')
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required.'); return }
    if (pw.length < 6) { setErr('Password must be at least 6 characters.'); return }
    if (pw !== confirm) { setErr('Passwords do not match.'); return }
    setLoading(true); setErr('')
    try {
      const v = await vault.createVault(name.trim(), pw)
      onCreated(v)
      onClose()
    } catch (e) { setErr(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader><DialogTitle>New vault</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium'>Vault name</label>
            <Input placeholder='e.g. Homelab' value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium'>Master password</label>
            <div className='relative'>
              <Input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} className='pr-9' />
              <button type='button' onClick={() => setShow((s) => !s)} className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground' tabIndex={-1}>
                {show ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
              </button>
            </div>
          </div>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium'>Confirm password</label>
            <Input type='password' value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {err && <p className='text-xs text-destructive'>{err}</p>}
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={loading}>{loading ? 'Creating…' : 'Create vault'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Unlock dialog ────────────────────────────────────────────────────────────

function UnlockDialog({
  vaultId, vaultName, open, onClose, onUnlocked,
}: { vaultId: string; vaultName: string; open: boolean; onClose: () => void; onUnlocked: () => void }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (!open) { setPw(''); setErr('') } }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      const ok = await vault.unlock(vaultId, pw)
      if (ok) { onUnlocked(); onClose() }
      else setErr('Wrong password.')
    } catch (e) { setErr(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader><DialogTitle>Unlock "{vaultName}"</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium'>Master password</label>
            <div className='relative'>
              <Input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus className='pr-9' />
              <button type='button' onClick={() => setShow((s) => !s)} className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground' tabIndex={-1}>
                {show ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
              </button>
            </div>
          </div>
          {err && <p className='text-xs text-destructive'>{err}</p>}
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={loading}>{loading ? 'Unlocking…' : 'Unlock'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Single vault card ────────────────────────────────────────────────────────

function VaultCard({ v, onDeleted, onRenamed }: {
  v: VaultMeta
  onDeleted: () => void
  onRenamed: (name: string) => void
}) {
  const qc = useQueryClient()
  const [unlocked, setUnlocked] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(v.name)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<VaultItemMeta | null>(null)
  const [deleteItem, setDeleteItem] = useState<VaultItemMeta | null>(null)

  // Check unlock state on mount
  useEffect(() => {
    vault.isUnlocked(v.id).then(setUnlocked)
  }, [v.id])

  const { data: items = [], refetch } = useQuery({
    queryKey: ['vault-items', v.id],
    queryFn: () => vault.listItems(v.id),
    enabled: unlocked && expanded,
  })

  async function handleLock() {
    await vault.lock(v.id)
    setUnlocked(false)
    qc.removeQueries({ queryKey: ['vault-items', v.id] })
  }

  async function handleUnlocked() {
    setUnlocked(true)
    setExpanded(true)
  }

  async function handleRename() {
    if (!renameVal.trim() || renameVal === v.name) { setRenaming(false); return }
    await vault.renameVault(v.id, renameVal.trim())
    onRenamed(renameVal.trim())
    setRenaming(false)
  }

  async function handleDeleteItem() {
    if (!deleteItem) return
    await vault.deleteItem(v.id, deleteItem.id)
    setDeleteItem(null)
    refetch()
    qc.invalidateQueries({ queryKey: ['vaults'] })
  }

  return (
    <>
      <Card className='overflow-hidden'>
        <CardHeader className='flex flex-row items-center gap-3 py-3 px-4'>
          {/* Icon */}
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/10'>
            <ShieldCheck className='h-4 w-4 text-violet-400' />
          </div>

          {/* Name / rename */}
          {renaming ? (
            <form onSubmit={(e) => { e.preventDefault(); handleRename() }} className='flex-1 flex gap-2'>
              <Input
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                className='h-7 text-sm'
                autoFocus
                onBlur={handleRename}
              />
              <Button type='submit' size='sm' className='h-7'>Save</Button>
            </form>
          ) : (
            <div className='flex-1 min-w-0'>
              <p className='font-semibold text-sm truncate'>{v.name}</p>
              <p className='text-[11px] text-muted-foreground'>{v.item_count} credential{v.item_count !== 1 ? 's' : ''}</p>
            </div>
          )}

          {/* Badges + actions */}
          <div className='flex items-center gap-2 shrink-0'>
            <Badge
              variant='outline'
              className={unlocked ? 'text-emerald-500 border-emerald-500/30' : 'text-muted-foreground border-border'}
            >
              {unlocked ? <Unlock className='h-3 w-3 mr-1' /> : <Lock className='h-3 w-3 mr-1' />}
              {unlocked ? 'Unlocked' : 'Locked'}
            </Badge>

            {unlocked && (
              <Button variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={handleLock}>
                <Lock className='h-3.5 w-3.5 mr-1' /> Lock
              </Button>
            )}

            {!unlocked && (
              <Button variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={() => setUnlockOpen(true)}>
                <KeyRound className='h-3.5 w-3.5 mr-1' /> Unlock
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' className='h-7 w-7'>
                  <MoreHorizontal className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => { setRenameVal(v.name); setRenaming(true) }}>
                  <Pencil className='h-4 w-4 mr-2' /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='text-destructive focus:text-destructive'
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className='h-4 w-4 mr-2' /> Delete vault
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant='ghost' size='icon' className='h-7 w-7'
              onClick={() => { if (unlocked) { setExpanded((e) => !e) } else { setUnlockOpen(true) } }}
            >
              {expanded ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
            </Button>
          </div>
        </CardHeader>

        {/* Item list (expanded + unlocked) */}
        {expanded && unlocked && (
          <CardContent className='p-0 border-t border-border/50'>
            {items.length === 0 ? (
              <div className='flex flex-col items-center gap-2 py-8 text-center'>
                <p className='text-xs text-muted-foreground'>No credentials yet.</p>
                <Button variant='outline' size='sm' onClick={() => { setEditTarget(null); setAddOpen(true) }}>
                  <Plus className='h-3.5 w-3.5 mr-1' /> Add credential
                </Button>
              </div>
            ) : (
              <>
                <div className='divide-y divide-border/50'>
                  {items.map((item) => (
                    <div key={item.id} className='flex items-center gap-3 px-4 py-2.5'>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm font-medium truncate'>{item.name}</p>
                        <p className='text-[10px] text-muted-foreground uppercase tracking-widest'>
                          {VAULT_ITEM_TYPE_LABELS[item.type as keyof typeof VAULT_ITEM_TYPE_LABELS] ?? item.type}
                        </p>
                      </div>
                      {item.used_by && (
                        <Badge variant='secondary' className='text-[10px]'>In use</Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant='ghost' size='icon' className='h-7 w-7 shrink-0'>
                            <MoreHorizontal className='h-4 w-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem onClick={() => { setEditTarget(item); setAddOpen(true) }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            className='text-destructive focus:text-destructive'
                            onClick={() => setDeleteItem(item)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
                <div className='px-4 py-2 border-t border-border/30'>
                  <Button variant='ghost' size='sm' className='h-7 text-xs' onClick={() => { setEditTarget(null); setAddOpen(true) }}>
                    <Plus className='h-3.5 w-3.5 mr-1' /> Add credential
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Dialogs */}
      <UnlockDialog
        vaultId={v.id} vaultName={v.name}
        open={unlockOpen} onClose={() => setUnlockOpen(false)} onUnlocked={handleUnlocked}
      />

      <VaultItemDialog
        vaultId={v.id}
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditTarget(null) }}
        onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ['vaults'] }) }}
        item={editTarget}
      />

      <AlertDialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteItem?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This credential will be permanently deleted. Any services referencing it will need to be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={handleDeleteItem}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vault "{v.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              All {v.item_count} credential{v.item_count !== 1 ? 's' : ''} inside will be permanently destroyed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={async () => { await vault.deleteVault(v.id); onDeleted() }}
            >Delete vault</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function VaultPage() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const vaultLimit = useVaultLimit()

  const { data: vaults = [], refetch } = useQuery({
    queryKey: ['vaults'],
    queryFn: () => vault.listVaults(),
  })

  const atLimit = vaults.length >= vaultLimit

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <span className='font-semibold'>Vault</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-6 max-w-2xl'>
        <div className='flex items-start justify-between'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Credential Vault</h2>
            <p className='text-muted-foreground text-sm'>
              AES-256-GCM encrypted. Each vault has its own master password.
            </p>
          </div>
          <div className='flex flex-col items-end gap-1'>
            <Button
              size='sm'
              onClick={() => setCreateOpen(true)}
              disabled={atLimit}
              title={atLimit ? `Your plan allows ${vaultLimit} vault${vaultLimit !== 1 ? 's' : ''}. Upgrade to add more.` : undefined}
            >
              <Plus className='h-4 w-4 mr-1' /> New vault
            </Button>
            <p className='text-[11px] text-muted-foreground'>
              {vaults.length} / {vaultLimit} vault{vaultLimit !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {atLimit && vaults.length > 0 && (
          <div className='rounded-lg border border-violet-500/20 bg-violet-950/10 px-4 py-3 flex items-center justify-between'>
            <p className='text-sm text-violet-300'>
              You've reached your plan limit of {vaultLimit} vault{vaultLimit !== 1 ? 's' : ''}. Upgrade to Pro for up to 3{ENABLE_ENTERPRISE ? ', or Enterprise for up to 10' : ''}.
            </p>
            <Button size='sm' className='shrink-0 ml-4 bg-violet-600 hover:bg-violet-700 text-white'>
              Upgrade
            </Button>
          </div>
        )}

        {vaults.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-4 py-20 text-center'>
            <ShieldCheck className='h-10 w-10 text-muted-foreground/40' />
            <div>
              <p className='font-semibold'>No vaults yet</p>
              <p className='text-xs text-muted-foreground mt-1'>Create a vault to start storing encrypted credentials.</p>
            </div>
            <Button size='sm' onClick={() => setCreateOpen(true)}>
              <Plus className='h-4 w-4 mr-1' /> Create your first vault
            </Button>
          </div>
        ) : (
          <div className='flex flex-col gap-3'>
            {vaults.map((v) => (
              <VaultCard
                key={v.id}
                v={v}
                onDeleted={() => refetch()}
                onRenamed={(name) => {
                  qc.setQueryData<VaultMeta[]>(['vaults'], (old) =>
                    old?.map((x) => x.id === v.id ? { ...x, name } : x) ?? []
                  )
                }}
              />
            ))}
          </div>
        )}
      </Main>

      <CreateVaultDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => refetch()}
      />
    </>
  )
}
