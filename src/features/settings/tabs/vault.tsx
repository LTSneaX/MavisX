import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVaultStore } from '@/stores/vault-store'
import { vault, VaultItemMeta, VAULT_ITEM_TYPE_LABELS } from '@/lib/vault'
import { VaultUnlockDialog } from '@/features/vault/components/vault-unlock-dialog'
import { VaultItemDialog } from '@/features/vault/components/vault-item-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LockIcon, PlusIcon, MoreHorizontalIcon, ShieldIcon } from 'lucide-react'

export function VaultTab() {
  const qc = useQueryClient()
  const { isSetup, isUnlocked, loading, refresh, lock } = useVaultStore()

  const [unlockOpen, setUnlockOpen] = useState(false)
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<VaultItemMeta | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VaultItemMeta | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  const { data: items = [], refetch } = useQuery({
    queryKey: ['vault-items'],
    queryFn: () => vault.listItems(),
    enabled: isUnlocked,
  })

  function handleUnlockSuccess() {
    setUnlockOpen(false)
    refetch()
  }

  function openAdd() {
    setEditTarget(null)
    setItemDialogOpen(true)
  }

  function openEdit(item: VaultItemMeta) {
    setEditTarget(item)
    setItemDialogOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await vault.deleteItem(deleteTarget.id)
    setDeleteTarget(null)
    refetch()
  }

  async function handleLock() {
    await lock()
    qc.removeQueries({ queryKey: ['vault-items'] })
  }

  if (loading) return null

  // Locked state — show unlock prompt
  if (!isUnlocked) {
    return (
      <>
        <div className='flex flex-col items-center justify-center gap-4 py-16 text-center max-w-sm mx-auto'>
          <ShieldIcon className='h-10 w-10 text-muted-foreground' />
          <div>
            <p className='font-semibold'>
              {isSetup ? 'Vault is locked' : 'Vault not set up'}
            </p>
            <p className='text-xs text-muted-foreground mt-1'>
              {isSetup
                ? 'Enter your master password to manage encrypted credentials.'
                : 'Create a master password to start storing credentials securely.'}
            </p>
          </div>
          <Button size='sm' onClick={() => setUnlockOpen(true)}>
            {isSetup ? 'Unlock vault' : 'Set up vault'}
          </Button>
        </div>

        <VaultUnlockDialog open={unlockOpen} onSuccess={handleUnlockSuccess} />
      </>
    )
  }

  // Unlocked state — show items
  return (
    <>
      <div className='flex flex-col gap-4 max-w-2xl'>
        <Card>
          <CardHeader className='flex flex-row items-center gap-3 pb-3'>
            <div className='flex-1'>
              <CardTitle className='flex items-center gap-2'>
                Credential Vault
                <Badge variant='outline' className='text-emerald-500 border-emerald-500/30 text-[10px]'>
                  Unlocked
                </Badge>
              </CardTitle>
              <CardDescription>
                Named credentials stored with AES-256-GCM encryption. Reference them by name across alert rules and connections.
              </CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              <Button variant='ghost' size='sm' onClick={handleLock}>
                <LockIcon className='h-4 w-4 mr-1' />
                Lock
              </Button>
              <Button size='sm' onClick={openAdd}>
                <PlusIcon className='h-4 w-4 mr-1' />
                Add
              </Button>
            </div>
          </CardHeader>

          <CardContent className='p-0'>
            {items.length === 0 ? (
              <div className='flex flex-col items-center gap-2 py-10 text-center'>
                <p className='text-xs text-muted-foreground'>No credentials saved yet.</p>
                <Button variant='outline' size='sm' onClick={openAdd}>
                  Add your first credential
                </Button>
              </div>
            ) : (
              <div className='divide-y divide-border/50'>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className='flex items-center gap-3 px-4 py-3'
                  >
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium truncate'>{item.name}</p>
                      <p className='text-[10px] text-muted-foreground uppercase tracking-widest'>
                        {VAULT_ITEM_TYPE_LABELS[item.type as keyof typeof VAULT_ITEM_TYPE_LABELS] ?? item.type}
                      </p>
                    </div>

                    {item.used_by && (
                      <Badge variant='secondary' className='text-[10px]'>
                        In use
                      </Badge>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='icon' className='h-7 w-7 shrink-0'>
                          <MoreHorizontalIcon className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem onClick={() => openEdit(item)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className='text-destructive focus:text-destructive'
                          onClick={() => setDeleteTarget(item)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <VaultItemDialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        onSaved={() => refetch()}
        item={editTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The credential will be permanently deleted. Any services referencing it will need to be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
