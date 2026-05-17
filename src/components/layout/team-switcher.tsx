import { ChevronsUpDown, Plus, Users } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { usePlanStore } from '@/stores/plan-store'
import { useWorkspaceWindowStore } from '@/stores/workspace-window-store'
import { db } from '@/lib/db'

export function TeamSwitcher() {
  const { isMobile } = useSidebar()
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceStore()
  const plan = usePlanStore((s) => s.plan)
  const openWorkspace = useWorkspaceWindowStore((s) => s.openWorkspace)
  const { data: localWorkspace } = useQuery({ queryKey: ['workspace'], queryFn: () => db.getWorkspace() })

  const displayName = localWorkspace?.name ?? 'My Workspace'
  const initial = displayName.slice(0, 2).toUpperCase()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
            >
              <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold'>
                {initial}
              </div>
              <div className='grid flex-1 text-start text-sm leading-tight'>
                <span className='truncate font-semibold'>{displayName}</span>
              </div>
              <ChevronsUpDown className='ms-auto' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            align='start'
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            {workspaces.length > 0 ? (
              <>
                <DropdownMenuLabel className='text-xs text-muted-foreground'>Workspaces</DropdownMenuLabel>
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => { setActiveWorkspace(ws); openWorkspace(ws) }}
                    className='gap-2 p-2'
                  >
                    <div className='flex size-6 items-center justify-center rounded-sm border text-[10px] font-bold'>
                      {ws.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className='flex-1 truncate'>{ws.name}</span>
                    {activeWorkspace?.id === ws.id && (
                      <span className='text-[10px] text-violet-400'>Active</span>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className='gap-2 p-2'>
                  <Link to='/cloud'>
                    <div className='flex size-6 items-center justify-center rounded-md border bg-background'>
                      <Plus className='size-4' />
                    </div>
                    <span className='font-medium text-muted-foreground'>Manage workspaces</span>
                  </Link>
                </DropdownMenuItem>
              </>
            ) : plan === 'enterprise' || plan === 'pro' ? (
              <>
                <DropdownMenuLabel className='text-xs text-muted-foreground'>Workspaces</DropdownMenuLabel>
                <DropdownMenuItem asChild className='gap-2 p-2'>
                  <Link to='/cloud'>
                    <div className='flex size-6 items-center justify-center rounded-md border bg-background'>
                      <Plus className='size-4' />
                    </div>
                    <span className='font-medium text-muted-foreground'>Create workspace</span>
                  </Link>
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuLabel className='text-xs text-muted-foreground'>Workspace</DropdownMenuLabel>
                <DropdownMenuItem className='gap-2 p-2' disabled>
                  <div className='flex size-6 items-center justify-center rounded-sm border text-[10px] font-bold'>
                    {initial}
                  </div>
                  <span className='flex-1 truncate'>{displayName}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className='gap-2 p-2'>
                  <Link to='/upgrade'>
                    <div className='flex size-6 items-center justify-center rounded-md border bg-background'>
                      <Users className='size-4' />
                    </div>
                    <span className='font-medium text-muted-foreground'>Upgrade for team workspaces</span>
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
