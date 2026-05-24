import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { invoke } from '@tauri-apps/api/core'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'
import { WorkspaceOverlay } from '@/features/workspace-window'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        invoke('set_supabase_session', { url: '', anon_key: '', access_token: '' }).catch(() => {})
      } else if (session?.access_token) {
        invoke('set_supabase_session', {
          url: SUPABASE_URL,
          anon_key: SUPABASE_ANON_KEY,
          access_token: session.access_token,
        }).catch(() => {})
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              '@container/content',

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              'has-data-[layout=fixed]:h-svh',

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {children ?? <Outlet />}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
      <WorkspaceOverlay />
    </SearchProvider>
  )
}
