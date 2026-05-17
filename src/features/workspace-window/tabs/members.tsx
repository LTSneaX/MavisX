import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Crown, Shield, User, Mail, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth-store'
import type { WorkspaceMember } from '@/lib/workspace'

interface Props { workspaceId: string; ownerId: string; isAdmin: boolean }

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

export function MembersTab({ workspaceId, ownerId, isAdmin }: Props) {
  const qc = useQueryClient()
  const { auth } = useAuthStore()
  const [inviteOpen, setInviteOpen] = useState(false)

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('invited_at', { ascending: true })
      return (data ?? []) as WorkspaceMember[]
    },
  })

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workspace_members').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }),
    onError: () => toast.error('Failed to remove member'),
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'admin' | 'member' }) => {
      const { error } = await supabase.from('workspace_members').update({ role }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }),
  })

  const active = members.filter((m) => m.status === 'active')
  const pending = members.filter((m) => m.status === 'pending')

  return (
    <div className='flex flex-col gap-4 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='font-semibold'>Members</h3>
          <p className='text-xs text-muted-foreground mt-0.5'>
            {active.length} active · {pending.length} pending
          </p>
        </div>
        {isAdmin && (
          <Button size='sm' onClick={() => setInviteOpen(true)}>
            <Plus className='h-4 w-4 mr-1' /> Invite
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className='py-10 text-center text-sm text-muted-foreground'>Loading…</div>
      ) : (
        <div className='rounded-lg border border-border/50 bg-card divide-y divide-border/30'>
          {members.map((m) => (
            <div key={m.id} className='flex items-center gap-3 px-4 py-3'>
              <div className='h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0'>
                {m.email.slice(0, 2).toUpperCase()}
              </div>
              <div className='flex-1 min-w-0'>
                <p className='text-sm font-medium truncate'>{m.email}</p>
                {m.status === 'pending' && (
                  <p className='text-[10px] text-amber-500/80'>Invite pending</p>
                )}
              </div>
              <div className='flex items-center gap-2 shrink-0'>
                {isAdmin && m.role !== 'owner' && m.status === 'active' ? (
                  <select
                    value={m.role}
                    onChange={(e) => updateRole.mutate({ id: m.id, role: e.target.value as 'admin' | 'member' })}
                    className='text-[10px] font-semibold bg-transparent border-0 cursor-pointer focus:outline-none'
                  >
                    <option value='admin'>Admin</option>
                    <option value='member'>Member</option>
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {isAdmin && m.role !== 'owner' && m.user_id !== auth.user?.id && (
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
        </div>
      )}

      {isAdmin && (
        <InviteDialog open={inviteOpen} workspaceId={workspaceId} onClose={() => setInviteOpen(false)} />
      )}
    </div>
  )
}

function InviteDialog({ open, workspaceId, onClose }: { open: boolean; workspaceId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [saving, setSaving] = useState(false)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('workspace_members').insert({
        workspace_id: workspaceId,
        email: email.toLowerCase().trim(),
        role,
        status: 'pending',
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      toast.success(`Invite sent to ${email.trim()}`)
      setEmail('')
      onClose()
    } catch {
      toast.error('Failed to send invite')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader><DialogTitle>Invite member</DialogTitle></DialogHeader>
        <form onSubmit={handleInvite} className='flex flex-col gap-3'>
          <Input type='email' placeholder='Email address' value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
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
            <Button type='submit' size='sm' disabled={saving || !email.trim()}>
              <Mail className='h-3.5 w-3.5 mr-1' /> Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
