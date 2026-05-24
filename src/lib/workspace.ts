import { supabase } from './supabase'

export interface Workspace {
  id: string
  name: string
  owner_id: string
  created_at: string
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
