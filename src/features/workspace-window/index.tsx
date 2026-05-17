import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Activity, Plug, Users, LayoutDashboard, Crown, Shield, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useWorkspaceWindowStore } from '@/stores/workspace-window-store'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { OverviewTab } from './tabs/overview'
import { MonitorsTab } from './tabs/monitors'
import { ConnectionsTab } from './tabs/connections'
import { MembersTab } from './tabs/members'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'monitors',     label: 'Monitors',     icon: Activity },
  { id: 'connections',  label: 'Connections',  icon: Plug },
  { id: 'members',      label: 'Members',      icon: Users },
] as const

export function WorkspaceOverlay() {
  const { open, workspace, activeTab, closeWorkspace, setTab } = useWorkspaceWindowStore()
  const { auth } = useAuthStore()

  const { data: myMember } = useQuery({
    queryKey: ['ws-my-role', workspace?.id, auth.user?.id],
    queryFn: async () => {
      if (!workspace || !auth.user) return null
      const { data } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace.id)
        .eq('user_id', auth.user.id)
        .eq('status', 'active')
        .single()
      return data
    },
    enabled: !!workspace && !!auth.user,
  })

  const isOwner = workspace?.owner_id === auth.user?.id
  const isAdmin = isOwner || myMember?.role === 'admin'
  const myRole: 'owner' | 'admin' | 'member' = isOwner ? 'owner' : (myMember?.role as 'admin' | 'member') ?? 'member'

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeWorkspace()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeWorkspace])

  if (!open || !workspace) return null

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-background'>
      {/* Header */}
      <div className='flex items-center gap-4 px-6 py-3 border-b border-border/60 bg-card/80 backdrop-blur-sm shrink-0'>
        <div className='flex items-center gap-3 flex-1 min-w-0'>
          <div className='flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400 text-sm font-bold shrink-0'>
            {workspace.name.slice(0, 2).toUpperCase()}
          </div>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <h1 className='font-semibold text-sm truncate'>{workspace.name}</h1>
              <RolePill role={myRole} />
            </div>
            <p className='text-[11px] text-muted-foreground'>Enterprise workspace</p>
          </div>
        </div>
        <Button
          variant='ghost' size='sm'
          className='h-8 w-8 p-0 text-muted-foreground shrink-0'
          onClick={closeWorkspace}
        >
          <X className='h-4 w-4' />
        </Button>
      </div>

      {/* Tab bar */}
      <div className='flex items-center gap-1 px-4 border-b border-border/40 bg-card/50 shrink-0'>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-violet-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className='h-3.5 w-3.5' />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto'>
        {activeTab === 'overview' && (
          <OverviewTab workspaceId={workspace.id} />
        )}
        {activeTab === 'monitors' && (
          <MonitorsTab workspaceId={workspace.id} isAdmin={isAdmin} />
        )}
        {activeTab === 'connections' && (
          <ConnectionsTab workspaceId={workspace.id} isAdmin={isAdmin} />
        )}
        {activeTab === 'members' && (
          <MembersTab workspaceId={workspace.id} ownerId={workspace.owner_id} isAdmin={isAdmin} />
        )}
      </div>
    </div>
  )
}

function RolePill({ role }: { role: 'owner' | 'admin' | 'member' }) {
  if (role === 'owner') return (
    <span className='flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded'>
      <Crown className='h-2.5 w-2.5' /> Owner
    </span>
  )
  if (role === 'admin') return (
    <span className='flex items-center gap-1 text-[10px] font-semibold text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded'>
      <Shield className='h-2.5 w-2.5' /> Admin
    </span>
  )
  return (
    <span className='flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded'>
      <User className='h-2.5 w-2.5' /> Member
    </span>
  )
}
