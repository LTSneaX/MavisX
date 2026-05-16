import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type MonitorWithStatus } from '@/lib/db'

type MonitorsDialogType = 'create' | 'update' | 'delete'

type MonitorsContextType = {
  open: MonitorsDialogType | null
  setOpen: (str: MonitorsDialogType | null) => void
  currentRow: MonitorWithStatus | null
  setCurrentRow: React.Dispatch<React.SetStateAction<MonitorWithStatus | null>>
}

const MonitorsContext = React.createContext<MonitorsContextType | null>(null)

export function MonitorsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<MonitorsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<MonitorWithStatus | null>(null)

  return (
    <MonitorsContext value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </MonitorsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useMonitors = () => {
  const ctx = React.useContext(MonitorsContext)
  if (!ctx) throw new Error('useMonitors must be used within <MonitorsProvider>')
  return ctx
}
