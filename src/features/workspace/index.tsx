import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Trash2, Crown, Shield, User, Mail,
  MoreHorizontal, Pencil, Check, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { workspaceApi, type Workspace, type WorkspaceMember } from '@/lib/workspace'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useAuthStore } from '@/stores/auth-store'
import { usePlanStore } from '@/stores/plan-store'

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: WorkspaceMember['role'] }) {
  if (role === 'owner') return (
    <span className='flex items-center gap-1 text-[10px] font-semibold text-amber-400'>
      <Crown className='h-3 w-3' /> Owner
    </span>
  )
  if (role === 'admin') return (
    <span className='flex items-center gap-1 text-[10px] font-semibold text-violet-400'>
      <Shield className='h-3 w-3' /> Admin
    </span>
  )
  return (
    <span className='flex items-center gap-1 text-[10px] font-semibold text-muted-foreground'>
      <User className='h-3 w-3' /> Member
    </span>
  )
}

// ─── Create workspace dialog ───────────────────────────────────────────────────

function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const qc = useQueryClient()
  const { setWorkspaces } = useWorkspaceStore()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await workspaceApi.createWorkspace(name.trim())
      const updated = await workspaceApi.listMyWorkspaces()
      setWorkspaces(updated)
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      toast.success(`Workspace "${name.trim()}" created`)
      setName('')
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className='flex flex-col gap-3'>
          <Input
            placeholder='Workspace name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={loading || !name.trim()}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Invite member dialog ──────────────────────────────────────────────────────

function InviteDialog({
  open, workspaceId, onClose,
}: { open: boolean; workspaceId: string; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [loading, setLoading] = useState(false)
  const qc = useQueryClient()

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      await workspaceApi.inviteMember(workspaceId, email.trim(), role)
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      toast.success(`Invite sent to ${email.trim()}`)
      setEmail('')
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleInvite} className='flex flex-col gap-3'>
          <Input
            type='email'
            placeholder='Email address'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <div className='flex items-center gap-2'>
            <span className='text-xs text-muted-foreground w-10'>Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              className='flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs'
            >
              <option value='member'>Member</option>
              <option value='admin'>Admin</option>
            </select>
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={loading || !email.trim()}>
              <Mail className='h-3.5 w-3.5 mr-1' /> Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Workspace card ────────────────────────────────────────────────────────────

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const qc = useQueryClient()
  const { activeWorkspace, setActiveWorkspace, setWorkspaces } = useWorkspaceStore()
  const { auth } = useAuthStore()
  const isActive = activeWorkspace?.id === workspace.id

  const [inviteOpen, setInviteOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(workspace.name)

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspace.id],
    queryFn: () => workspaceApi.listMembers(workspace.id),
  })

  const myMember = members.find((m) => m.user_id === auth.user?.id)
  const isOwner = workspace.owner_id === auth.user?.id
  const isAdmin = isOwner || myMember?.role === 'admin'

  const removeMember = useMutation({
    mutationFn: (id: string) => workspaceApi.removeMember(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspace.id] }),
  })

  async function handleRename() {
    if (!newName.trim() || newName === workspace.name) { setRenaming(false); return }
    try {
      await workspaceApi.renameWorkspace(workspace.id, newName.trim())
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      toast.success('Workspace renamed')
    } catch {
      toast.error('Failed to rename')
    }
    setRenaming(false)
  }

  async function handleDelete() {
    try {
      await workspaceApi.deleteWorkspace(workspace.id)
      const updated = await workspaceApi.listMyWorkspaces()
      setWorkspaces(updated)
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      toast.success('Workspace deleted')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <>
      <Card className={`border ${isActive ? 'border-violet-500/40' : 'border-border/50'} bg-card`}>
        <CardHeader className='px-4 pb-2 pt-4'>
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2 flex-1 min-w-0'>
              <div className={`w-[3px] h-5 rounded-full shrink-0 ${isActive ? 'bg-violet-500' : 'bg-border'}`} />
              {renaming ? (
                <div className='flex items-center gap-1 flex-1'>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className='h-7 text-sm'
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename()
                      if (e.key === 'Escape') { setNewName(workspace.name); setRenaming(false) }
                    }}
                  />
                  <Button size='sm' variant='ghost' className='h-7 w-7 p-0' onClick={handleRename}><Check className='h-3.5 w-3.5' /></Button>
                  <Button size='sm' variant='ghost' className='h-7 w-7 p-0' onClick={() => { setNewName(workspace.name); setRenaming(false) }}><X className='h-3.5 w-3.5' /></Button>
                </div>
              ) : (
                <span className='font-semibold text-sm truncate'>{workspace.name}</span>
              )}
              {isActive && <Badge variant='outline' className='text-[10px] border-violet-500/30 text-violet-400 shrink-0'>Active</Badge>}
            </div>
            <div className='flex items-center gap-1 shrink-0'>
              {!isActive && (
                <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => setActiveWorkspace(workspace)}>
                  Switch
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size='sm' variant='ghost' className='h-7 w-7 p-0'>
                    <MoreHorizontal className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  {isOwner && (
                    <DropdownMenuItem onClick={() => setRenaming(true)}>
                      <Pencil className='h-3.5 w-3.5 mr-2' /> Rename
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                      <Mail className='h-3.5 w-3.5 mr-2' /> Invite member
                    </DropdownMenuItem>
                  )}
                  {isOwner && (
                    <DropdownMenuItem variant='destructive' onClick={() => setDeleteOpen(true)}>
                      <Trash2 className='h-3.5 w-3.5 mr-2' /> Delete workspace
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <p className='text-xs text-muted-foreground ml-5'>
            {members.filter(m => m.status === 'active').length} member{members.filter(m => m.status === 'active').length !== 1 ? 's' : ''} ·{' '}
            {members.filter(m => m.status === 'pending').length} pending
          </p>
        </CardHeader>

        <CardContent className='px-4 pb-4'>
          <div className='flex flex-col gap-1'>
            {members.map((m) => (
              <div key={m.id} className='flex items-center justify-between py-1.5 border-b border-border/30 last:border-0'>
                <div className='flex items-center gap-2 min-w-0'>
                  <div className='h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0'>
                    {(m.email ?? '??').slice(0, 2).toUpperCase()}
                  </div>
                  <div className='min-w-0'>
                    <p className='text-xs truncate'>{m.email ?? 'Unknown'}</p>
                    {m.status === 'pending' && (
                      <p className='text-[10px] text-amber-500/80'>Invite pending</p>
                    )}
                  </div>
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                  <RoleBadge role={m.role} />
                  {isOwner && m.role !== 'owner' && (
                    <Button
                      size='sm' variant='ghost'
                      className='h-6 w-6 p-0 text-muted-foreground hover:text-destructive'
                      onClick={() => removeMember.mutate(m.id)}
                    >
                      <X className='h-3 w-3' />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {isAdmin && (
              <Button
                size='sm' variant='outline'
                className='mt-2 w-full h-7 text-xs border-dashed'
                onClick={() => setInviteOpen(true)}
              >
                <Plus className='h-3.5 w-3.5 mr-1' /> Invite member
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <InviteDialog open={inviteOpen} workspaceId={workspace.id} onClose={() => setInviteOpen(false)} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{workspace.name}" and removes all members. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className='bg-destructive hover:bg-destructive/90'>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const WORKSPACE_LIMITS: Record<string, number> = {
  free: 0,
  pro: 3,
  enterprise: 10,
}

export function WorkspacePage() {
  const plan = usePlanStore((s) => s.plan)
  const workspaceLimit = WORKSPACE_LIMITS[plan] ?? 0
  const [createOpen, setCreateOpen] = useState(false)
  const { setWorkspaces } = useWorkspaceStore()

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const ws = await workspaceApi.listMyWorkspaces()
      setWorkspaces(ws)
      return ws
    },
  })

  const canCreate = plan === 'enterprise' || plan === 'pro'
  const atLimit = workspaces.length >= workspaceLimit

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <Users className='h-4 w-4 text-muted-foreground' />
          <span className='font-semibold'>Workspaces</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-6 max-w-2xl'>
        <div className='flex items-start justify-between'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Workspaces</h2>
            <p className='text-muted-foreground text-sm'>
              Invite your team and share monitors, connections, and alert rules.
            </p>
          </div>
          {canCreate && (
            <div className='flex flex-col items-end gap-1'>
              <Button size='sm' onClick={() => setCreateOpen(true)} disabled={atLimit}>
                <Plus className='h-4 w-4 mr-1' /> New workspace
              </Button>
              <p className='text-[11px] text-muted-foreground'>
                {workspaces.length} / {workspaceLimit} workspaces
              </p>
            </div>
          )}
        </div>

        {workspaces.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-4 py-20 text-center'>
            <Users className='h-10 w-10 text-muted-foreground/40' />
            <div>
              <p className='font-semibold'>No workspaces yet</p>
              {canCreate ? (
                <p className='text-sm text-muted-foreground mt-1'>Create your first workspace and invite your team.</p>
              ) : (
                <p className='text-sm text-muted-foreground mt-1 max-w-xs'>
                  You haven't been added to any workspaces. Ask a workspace owner to invite your email address.
                </p>
              )}
            </div>
            {canCreate && (
              <Button size='sm' onClick={() => setCreateOpen(true)}>
                <Plus className='h-4 w-4 mr-1' /> Create workspace
              </Button>
            )}
          </div>
        ) : (
          <div className='flex flex-col gap-4'>
            {workspaces.map((ws) => <WorkspaceCard key={ws.id} workspace={ws} />)}
          </div>
        )}
      </Main>

      <CreateWorkspaceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}
