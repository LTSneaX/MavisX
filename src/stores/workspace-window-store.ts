import { create } from 'zustand'
import type { Workspace } from '@/lib/workspace'

interface WorkspaceWindowState {
  open: boolean
  workspace: Workspace | null
  activeTab: string
  openWorkspace: (ws: Workspace) => void
  closeWorkspace: () => void
  setTab: (tab: string) => void
}

export const useWorkspaceWindowStore = create<WorkspaceWindowState>()((set) => ({
  open: false,
  workspace: null,
  activeTab: 'overview',

  openWorkspace: (ws) => set({ open: true, workspace: ws, activeTab: 'overview' }),
  closeWorkspace: () => set({ open: false, workspace: null }),
  setTab: (tab) => set({ activeTab: tab }),
}))
