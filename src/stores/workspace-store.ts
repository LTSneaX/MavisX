import { create } from 'zustand'
import type { Workspace } from '@/lib/workspace'

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  setWorkspaces: (ws: Workspace[]) => void
  setActiveWorkspace: (ws: Workspace) => void
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  workspaces: [],
  activeWorkspace: null,
  setWorkspaces: (workspaces) =>
    set({ workspaces, activeWorkspace: workspaces[0] ?? null }),
  setActiveWorkspace: (ws) => set({ activeWorkspace: ws }),
}))
