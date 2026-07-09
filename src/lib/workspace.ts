import { supabase } from './supabase'

export interface Workspace {
  id: string
  name: string
  owner_id: string
  created_at: string
  // Nullable Enterprise grace stamp, set/cleared ONLY by the lemon-webhook
  // (service_role). Present on `select('*')`. Drives read-only / locked UX.
  // The server (RLS) is the security truth; this is presentation only.
  grace_until?: string | null
}

export type WorkspaceEntitlement = 'active' | 'grace' | 'locked'

/**
 * Client-side entitlement state for UX only — RLS is the real boundary.
 *   grace_until null                → active  (owner enterprise; full access)
 *   grace_until set, now < it       → grace   (read-only; owner's sub lapsed)
 *   grace_until set, now >= it       → locked  (only the owner still sees the row)
 */
export function workspaceEntitlement(
  ws: Pick<Workspace, 'grace_until'>
): WorkspaceEntitlement {
  if (!ws.grace_until) return 'active'
  return Date.now() < new Date(ws.grace_until).getTime() ? 'grace' : 'locked'
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string | null
  email: string | null
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'pending'
  invited_at: string
  joined_at: string | null
}

export const workspaceApi = {
  async listMyWorkspaces(): Promise<Workspace[]> {
    const { data } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true })
    return data ?? []
  },

  async createWorkspace(name: string): Promise<Workspace> {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase
      .from('workspaces')
      .insert({ name, owner_id: session!.user.id })
      .select()
      .single()
    if (error) throw new Error(error.message)

    // Add owner as active member
    await supabase.from('workspace_members').insert({
      workspace_id: data.id,
      user_id: session!.user.id,
      email: session!.user.email!,
      role: 'owner',
      status: 'active',
      joined_at: new Date().toISOString(),
    })

    return data
  },

  async deleteWorkspace(id: string): Promise<void> {
    const { error } = await supabase.from('workspaces').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  async renameWorkspace(id: string, name: string): Promise<void> {
    const { error } = await supabase.from('workspaces').update({ name }).eq('id', id)
    if (error) throw new Error(error.message)
  },

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const { data } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('invited_at', { ascending: true })
    return data ?? []
  },

  async inviteMember(workspaceId: string, email: string, role: 'admin' | 'member' = 'member'): Promise<void> {
    const { error } = await supabase.from('workspace_members').insert({
      workspace_id: workspaceId,
      email: email.toLowerCase().trim(),
      role,
      status: 'pending',
    })
    if (error) throw new Error(error.message)
  },

  async removeMember(memberId: string): Promise<void> {
    const { error } = await supabase.from('workspace_members').delete().eq('id', memberId)
    if (error) throw new Error(error.message)
  },

  async updateMemberRole(memberId: string, role: 'admin' | 'member'): Promise<void> {
    const { error } = await supabase.from('workspace_members').update({ role }).eq('id', memberId)
    if (error) throw new Error(error.message)
  },
}
