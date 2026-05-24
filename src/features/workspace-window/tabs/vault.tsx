import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { Lock, Unlock, Plus, Trash2, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props { workspaceId: string; isAdmin: boolean }

const ITEM_TYPES = ['password', 'ssh_key', 'api_key'] as const

interface VaultStatus { exists: boolean; unlocked: boolean }
interface VaultItem { id: string; name: string; item_type: string; created_at: string }

export function VaultTab({ workspaceId, isAdmin }: Props) {
  const qc = useQueryClient()
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [revealId, setRevealId] = useState<string | null>(null)
  const [revealSecret, setRevealSecret] = useState<string | null>(null)

  const { data: status, isLoading: statusLoading } = useQuery<VaultStatus>({
    queryKey: ['ws-vault-status', workspaceId],
    queryFn: () => invoke('ws_vault_status', { workspace_id: workspaceId }),
    refetchInterval: 5000,
  })

  const { data: items = [], isLoading: itemsLoading } = useQuery<VaultItem[]>({
    queryKey: ['ws-vault-items', workspaceId],
    queryFn: () => invoke('ws_vault_list', { workspace_id: workspaceId }),
    enabled: !!status?.unlocked,
  })

  const lockMut = useMutation({
    mutationFn: () => invoke('ws_vault_lock', { workspace_id: workspaceId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ws-vault-status', workspaceId] })
      qc.invalidateQueries({ queryKey: ['ws-vault-items', workspaceId] })
      toast.success('Vault locked')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (itemId: string) => invoke('ws_vault_delete', { workspace_id: workspaceId, item_id: itemId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ws-vault-items', workspaceId] })
      toast.success('Item deleted')
    },
    onError: () => toast.error('Failed to delete item'),
  })

  async function handleReveal(itemId: string) {
    if (revealId === itemId) {
      setRevealId(null)
      setRevealSecret(null)
      return
    }
    try {
      const secret = await invoke<string>('ws_vault_get_secret', { workspace_id: workspaceId, item_id: itemId })
      setRevealId(itemId)
      setRevealSecret(secret)
    } catch {
      toast.error('Failed to reveal — is the vault unlocked?')
    }
  }

  if (statusLoading) {
    return <div className='py-16 text-center text-sm text-muted-foreground'>Loading vault…</div>
  }

  return (
    <div className='flex flex-col gap-4 p-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='font-semibold'>Workspace Vault</h3>
          <p className='text-xs text-muted-foreground mt-0.5'>
            {status?.unlocked
              ? `${items.length} credential${items.length !== 1 ? 's' : ''} available`
              : 'Unlock to access credentials'}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {status?.unlocked && isAdmin && (
            <Button size='sm' onClick={() => setAddOpen(true)}>
              <Plus className='h-4 w-4 mr-1' /> Add credential
            </Button>
          )}
          {status?.exists && status.unlocked && (
            <Button size='sm' variant='outline' onClick={() => lockMut.mutate()}>
              <Lock className='h-3.5 w-3.5 mr-1' /> Lock
            </Button>
          )}
          {status?.exists && !status.unlocked && (
            <Button size='sm' variant='outline' onClick={() => setUnlockOpen(true)}>
              <Unlock className='h-3.5 w-3.5 mr-1' /> Unlock
            </Button>
          )}
          {!status?.exists && isAdmin && (
            <Button size='sm' onClick={() => setCreateOpen(true)}>
              <ShieldCheck className='h-3.5 w-3.5 mr-1' /> Create vault
            </Button>
          )}
        </div>
      </div>

      {/* No vault yet */}
      {!status?.exists && (
        <div className='rounded-lg border border-dashed border-border/50 py-16 flex flex-col items-center gap-3 text-center'>
          <ShieldCheck className='h-8 w-8 text-muted-foreground/40' />
          <div>
            <p className='text-sm font-medium'>No vault configured</p>
            <p className='text-xs text-muted-foreground mt-1'>
              {isAdmin ? 'Create a vault to store shared credentials for this workspace.' : 'Ask an admin to create a vault for this workspace.'}
            </p>
          </div>
          {isAdmin && (
            <Button size='sm' variant='outline' onClick={() => setCreateOpen(true)}>
              <ShieldCheck className='h-4 w-4 mr-1' /> Create vault
            </Button>
          )}
        </div>
      )}

      {/* Vault locked */}
      {status?.exists && !status.unlocked && (
        <div className='rounded-lg border border-dashed border-border/50 py-16 flex flex-col items-center gap-3 text-center'>
          <Lock className='h-8 w-8 text-muted-foreground/40' />
          <div>
            <p className='text-sm font-medium'>Vault is locked</p>
            <p className='text-xs text-muted-foreground mt-1'>Enter the vault master password to access credentials.</p>
          </div>
          <Button size='sm' variant='outline' onClick={() => setUnlockOpen(true)}>
            <Unlock className='h-3.5 w-3.5 mr-1' /> Unlock vault
          </Button>
        </div>
      )}

      {/* Vault unlocked — item list */}
      {status?.unlocked && (
        itemsLoading ? (
          <div className='py-8 text-center text-sm text-muted-foreground'>Loading…</div>
        ) : items.length === 0 ? (
          <div className='rounded-lg border border-dashed border-border/50 py-12 flex flex-col items-center gap-3 text-center'>
            <KeyRound className='h-6 w-6 text-muted-foreground/40' />
            <p className='text-sm text-muted-foreground'>No credentials yet</p>
            {isAdmin && (
              <Button size='sm' variant='outline' onClick={() => setAddOpen(true)}>
                <Plus className='h-4 w-4 mr-1' /> Add first credential
              </Button>
            )}
          </div>
        ) : (
          <div className='rounded-lg border border-border/50 bg-card divide-y divide-border/30'>
            {items.map((item) => (
              <div key={item.id} className='flex items-center gap-3 px-4 py-3'>
                <KeyRound className='h-4 w-4 text-violet-400 shrink-0' />
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <p className='text-sm font-medium truncate'>{item.name}</p>
                    <Badge variant='outline' className='text-[10px] shrink-0 capitalize'>{item.item_type}</Badge>
                  </div>
                  {revealId === item.id && revealSecret && (
                    <p className='text-xs font-mono text-amber-400 mt-0.5 break-all'>{revealSecret}</p>
                  )}
                  {revealId !== item.id && (
                    <p className='text-xs text-muted-foreground mt-0.5 font-mono tracking-widest'>••••••••</p>
                  )}
                </div>
                <div className='flex items-center gap-1 shrink-0'>
                  {isAdmin && (
                    <Button
                      size='sm' variant='ghost' className='h-7 w-7 p-0 text-muted-foreground hover:text-foreground'
                      title={revealId === item.id ? 'Hide' : 'Reveal (admin only)'}
                      onClick={() => handleReveal(item.id)}
                    >
                      {revealId === item.id ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size='sm' variant='ghost' className='h-7 w-7 p-0 text-muted-foreground hover:text-destructive'
                      onClick={() => deleteMut.mutate(item.id)}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Dialogs */}
      {status?.exists && (
        <UnlockDialog
          open={unlockOpen}
          workspaceId={workspaceId}
          onClose={() => setUnlockOpen(false)}
          onUnlocked={() => {
            setUnlockOpen(false)
            qc.invalidateQueries({ queryKey: ['ws-vault-status', workspaceId] })
            qc.invalidateQueries({ queryKey: ['ws-vault-items', workspaceId] })
          }}
        />
      )}
      {isAdmin && !status?.exists && (
        <CreateVaultDialog
          open={createOpen}
          workspaceId={workspaceId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            qc.invalidateQueries({ queryKey: ['ws-vault-status', workspaceId] })
          }}
        />
      )}
      {isAdmin && status?.unlocked && (
        <AddItemDialog
          open={addOpen}
          workspaceId={workspaceId}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            qc.invalidateQueries({ queryKey: ['ws-vault-items', workspaceId] })
          }}
        />
      )}
    </div>
  )
}

function UnlockDialog({ open, workspaceId, onClose, onUnlocked }: {
  open: boolean; workspaceId: string; onClose: () => void; onUnlocked: () => void
}) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    try {
      await invoke('ws_vault_unlock', { workspace_id: workspaceId, master_password: password })
      toast.success('Vault unlocked')
      setPassword('')
      onUnlocked()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader><DialogTitle>Unlock vault</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1.5'>
            <Label>Master password</Label>
            <Input
              type='password' value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder='Enter vault master password' autoFocus
            />
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={loading || !password}>
              <Unlock className='h-3.5 w-3.5 mr-1' /> Unlock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateVaultDialog({ open, workspaceId, onClose, onCreated }: {
  open: boolean; workspaceId: string; onClose: () => void; onCreated: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || password !== confirm) return
    setLoading(true)
    try {
      await invoke('ws_vault_create', { workspace_id: workspaceId, master_password: password })
      toast.success('Vault created and unlocked')
      setPassword(''); setConfirm('')
      onCreated()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader><DialogTitle>Create workspace vault</DialogTitle></DialogHeader>
        <p className='text-xs text-muted-foreground -mt-1'>
          Set a master password that all members will use to unlock the vault. Share it securely out-of-band.
        </p>
        <form onSubmit={handleSubmit} className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1.5'>
            <Label>Master password</Label>
            <Input type='password' value={password} onChange={(e) => setPassword(e.target.value)} placeholder='Choose a strong password' autoFocus />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label>Confirm password</Label>
            <Input type='password' value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='Re-enter password' />
          </div>
          {password && confirm && password !== confirm && (
            <p className='text-xs text-destructive'>Passwords do not match</p>
          )}
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={loading || !password || password !== confirm}>
              <ShieldCheck className='h-3.5 w-3.5 mr-1' /> Create vault
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddItemDialog({ open, workspaceId, onClose, onAdded }: {
  open: boolean; workspaceId: string; onClose: () => void; onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [itemType, setItemType] = useState<string>('password')
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !secret.trim()) return
    setLoading(true)
    try {
      await invoke('ws_vault_add', {
        workspace_id: workspaceId,
        name: name.trim(),
        item_type: itemType,
        secret: secret,
      })
      toast.success('Credential added')
      setName(''); setSecret(''); setItemType('password')
      onAdded()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader><DialogTitle>Add credential</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className='flex flex-col gap-3'>
          <div className='flex gap-2'>
            <div className='flex flex-col gap-1.5 flex-1'>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='prod-server-root' autoFocus />
            </div>
            <div className='flex flex-col gap-1.5 w-32'>
              <Label>Type</Label>
              <select value={itemType} onChange={(e) => setItemType(e.target.value)}
                className='rounded-md border border-input bg-background px-3 py-2 text-sm'>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label>{itemType === 'ssh_key' ? 'Private key (PEM)' : 'Secret'}</Label>
            {itemType === 'ssh_key' ? (
              <textarea
                value={secret} onChange={(e) => setSecret(e.target.value)}
                placeholder='-----BEGIN OPENSSH PRIVATE KEY-----'
                className='rounded-md border border-input bg-background px-3 py-2 text-xs font-mono min-h-[120px] resize-y'
              />
            ) : (
              <Input type='password' value={secret} onChange={(e) => setSecret(e.target.value)} placeholder='••••••••' />
            )}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={loading || !name.trim() || !secret.trim()}>Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
