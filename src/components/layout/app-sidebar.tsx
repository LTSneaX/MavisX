import { Zap } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'
import { usePlanStore } from '@/stores/plan-store'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const plan = usePlanStore((s) => s.plan)

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        {plan === 'free' && (
          <Link to='/upgrade'>
            <div className='mx-1 mb-1 flex items-center gap-2 rounded-lg bg-violet-600/10 border border-violet-500/20 px-3 py-2.5 hover:bg-violet-600/20 transition-colors cursor-pointer group'>
              <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-600/20 group-hover:bg-violet-600/30 transition-colors'>
                <Zap className='h-3.5 w-3.5 text-violet-400' />
              </div>
              <div className='flex-1 min-w-0 group-data-[collapsible=icon]:hidden'>
                <p className='text-xs font-semibold text-violet-300 leading-none mb-0.5'>Upgrade to Pro</p>
                <p className='text-[10px] text-violet-400/70 leading-none'>Unlimited monitors & more</p>
              </div>
            </div>
          </Link>
        )}
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
