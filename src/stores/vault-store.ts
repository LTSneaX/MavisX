import { create } from 'zustand'
import { vault } from '@/lib/vault'

interface VaultState {
  isSetup: boolean
  isUnlocked: boolean
  loading: boolean
  refresh: () => Promise<void>
  unlock: (password: string) => Promise<boolean>
  setup: (password: string) => Promise<void>
  lock: () => Promise<void>
}

export const useVaultStore = create<VaultState>((set) => ({
  isSetup: false,
  isUnlocked: false,
  loading: true,

  refresh: async () => {
    const [isSetup, isUnlocked] = await Promise.all([
      vault.isSetup(),
      vault.isUnlocked(),
    ])
    set({ isSetup, isUnlocked, loading: false })
  },

  unlock: async (password: string) => {
    const ok = await vault.unlock(password)
    if (ok) set({ isUnlocked: true })
    return ok
  },

  setup: async (password: string) => {
    await vault.setup(password)
    set({ isSetup: true, isUnlocked: true })
  },

  lock: async () => {
    await vault.lock()
    set({ isUnlocked: false })
  },
}))
