import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'
import { db } from '@/lib/db'

function UpgradeButton() {
  const { state } = useSidebar()
  const { data: plan } = useQuery({
    queryKey: ['workspace-plan'],
    queryFn: () => db.getWorkspacePlan(),
    staleTime: 60_000,
  })

  if (plan === 'pro' || state === 'collapsed') return null

  return (
    <div className='px-2 pb-2'>
      <button className='group relative w-full overflow-hidden rounded-lg bg-gradient-to-br from-violet-600/30 via-violet-600/15 to-indigo-600/10 border border-violet-500/20 px-3 py-2.5 text-left transition-all hover:from-violet-600/40 hover:via-violet-600/20 hover:border-violet-500/40'>
        <div className='flex items-center gap-2.5'>
          <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/20'>
            <Sparkles className='h-3.5 w-3.5 text-violet-400' />
          </div>
          <div className='min-w-0'>
            <p className='text-xs font-semibold text-white/90 leading-none mb-0.5'>Upgrade to Pro</p>
            <p className='text-[10px] text-white/40 leading-none truncate'>Unlock all features</p>
          </div>
        </div>
      </button>
    </div>
  )
}

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { data: plan = 'free' } = useQuery({
    queryKey: ['workspace-plan'],
    queryFn: () => db.getWorkspacePlan(),
    staleTime: 60_000,
  })

  const navGroups = plan === 'pro'
    ? sidebarData.navGroups
    : sidebarData.navGroups
        .map(group => ({ ...group, items: group.items.filter(item => !item.pro) }))
        .filter(group => group.items.length > 0)

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarData.teams} />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <UpgradeButton />
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
