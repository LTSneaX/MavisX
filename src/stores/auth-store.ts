import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  auth: {
    session: Session | null
    user: User | null
    accessToken: string
    username: string | null
    setSession: (session: Session | null) => void
    setUsername: (username: string | null) => void
    signOut: () => Promise<void>
    // Legacy compat — used by existing route guard + nav-user
    setUser: (user: User | null) => void
    setAccessToken: (token: string) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  auth: {
    session: null,
    user: null,
    accessToken: '',
    username: null,

    setUsername: (username) =>
      set((s) => ({ auth: { ...s.auth, username } })),

    setSession: (session) =>
      set((s) => ({
        auth: {
          ...s.auth,
          session,
          user: session?.user ?? null,
          accessToken: session?.access_token ?? '',
        },
      })),

    setUser: (user) =>
      set((s) => ({ auth: { ...s.auth, user } })),

    setAccessToken: (token) =>
      set((s) => ({ auth: { ...s.auth, accessToken: token } })),

    resetAccessToken: () =>
      set((s) => ({ auth: { ...s.auth, accessToken: '' } })),

    signOut: async () => {
      await supabase.auth.signOut()
      set((s) => ({
        auth: { ...s.auth, session: null, user: null, accessToken: '', username: null },
      }))
    },

    reset: () => {
      supabase.auth.signOut()
      set((s) => ({
        auth: { ...s.auth, session: null, user: null, accessToken: '', username: null },
      }))
    },
  },
}))
