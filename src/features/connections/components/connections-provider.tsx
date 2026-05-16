import { createContext, useContext, useState } from 'react'
import { type Connection } from '@/lib/db'

type DialogType = 'create' | 'update' | 'delete' | null

type ConnectionsContextType = {
  open: DialogType
  setOpen: (v: DialogType) => void
  currentRow: Connection | null
  setCurrentRow: (v: Connection | null) => void
}

const ConnectionsContext = createContext<ConnectionsContextType | null>(null)

export function ConnectionsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<DialogType>(null)
  const [currentRow, setCurrentRow] = useState<Connection | null>(null)
  return (
    <ConnectionsContext.Provider value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </ConnectionsContext.Provider>
  )
}

export function useConnections() {
  const ctx = useContext(ConnectionsContext)
  if (!ctx) throw new Error('useConnections must be used within ConnectionsProvider')
  return ctx
}
