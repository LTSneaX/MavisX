import { createFileRoute, redirect, isRedirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { invoke } from '@tauri-apps/api/core'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { usePlanStore, resolvePlan } from '@/stores/plan-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getSession()
      console.log('[auth] session:', !!data.session, 'user:', data.session?.user?.email)

      if (error || !data.session) {
        throw redirect({ to: '/sign-in', replace: true })
      }

      useAuthStore.getState().auth.setSession(data.session)

      const plan = await resolvePlan(data.session.user.id, data.session.access_token)
      console.log('[auth] resolved plan:', plan)
      usePlanStore.getState().setPlan(plan)
      invoke('set_workspace_plan', { plan }).catch(() => {})
      invoke('set_supabase_session', {
        url: SUPABASE_URL,
        anon_key: SUPABASE_ANON_KEY,
        access_token: data.session.access_token,
      }).catch(() => {})

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.session.user.id)
        .single()
      useAuthStore.getState().auth.setUsername(profile?.username ?? null)

      // Activate any pending invites matching the user's email
      await supabase.rpc('activate_my_invites')

      // Ensure email is always populated for this user's workspace_members rows
      if (data.session.user.email) {
        await supabase
          .from('workspace_members')
          .update({ email: data.session.user.email })
          .eq('user_id', data.session.user.id)
          .is('email', null)
      }

      // Load workspaces for all users (free users can be members of enterprise workspaces)
      const { data: memberRows } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', data.session.user.id)
        .eq('status', 'active')
      const wsIds = (memberRows ?? []).map((r: { workspace_id: string }) => r.workspace_id)
      if (wsIds.length > 0) {
        const { data: wsData } = await supabase
          .from('workspaces')
          .select('*')
          .in('id', wsIds)
          .order('created_at', { ascending: true })
        const { useWorkspaceStore } = await import('@/stores/workspace-store')
        useWorkspaceStore.getState().setWorkspaces(wsData ?? [])
      }
    } catch (e) {
      if (isRedirect(e)) throw e
      console.error('[auth] error:', e)
      throw redirect({ to: '/sign-in', replace: true })
    }
  },
  component: AuthenticatedLayout,
})
