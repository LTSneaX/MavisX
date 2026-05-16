import { useState, useCallback } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Plus, Terminal, X } from 'lucide-react'
import { SshTerminalPane } from './components/SshTerminalPane'

interface SshTab {
  id: string
  label: string
  host: string
  port: number
  username: string
}

let _tabCounter = 1

export function SshTerminalPage() {
  const search = useSearch({ from: '/_authenticated/ssh/' })
  const [tabs, setTabs] = useState<SshTab[]>(() => {
    if (search.host) {
      return [
        {
          id: 'tab-1',
          label: `${search.username ?? 'ssh'}@${search.host}`,
          host: search.host,
          port: search.port ?? 22,
          username: search.username ?? '',
        },
      ]
    }
    return [{ id: 'tab-1', label: 'New session', host: '', port: 22, username: '' }]
  })
  const [activeTab, setActiveTab] = useState<string>('tab-1')

  const addTab = useCallback(() => {
    _tabCounter++
    const id = `tab-${_tabCounter}`
    setTabs(prev => [...prev, { id, label: 'New session', host: '', port: 22, username: '' }])
    setActiveTab(id)
  }, [])

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs(prev => {
        const next = prev.filter(t => t.id !== tabId)
        if (activeTab === tabId && next.length > 0) {
          setActiveTab(next[next.length - 1].id)
        }
        return next
      })
    },
    [activeTab]
  )

  const updateTabLabel = useCallback((tabId: string, label: string) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, label } : t)))
  }, [])

  if (tabs.length === 0) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 bg-zinc-950'>
        <Terminal className='h-8 w-8 text-zinc-600' />
        <p className='text-sm text-zinc-500'>No sessions open</p>
        <Button size='sm' onClick={addTab} className='bg-emerald-600 hover:bg-emerald-500'>
          <Plus className='mr-1.5 h-3.5 w-3.5' />
          New session
        </Button>
      </div>
    )
  }

  return (
    <div className='flex h-full flex-col bg-zinc-950'>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <Terminal className='h-4 w-4 text-emerald-400' />
          <span className='font-semibold'>SSH Terminal</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      {/* Tab bar */}
      <div className='flex shrink-0 items-center gap-0.5 border-b border-zinc-800 bg-zinc-900 px-2 pt-1' style={{ marginTop: '57px' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`group flex max-w-[180px] cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-zinc-700 bg-zinc-950 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:border-zinc-800 hover:text-zinc-300'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Terminal className='h-3 w-3 shrink-0 text-emerald-400' />
            <span className='min-w-0 truncate'>{tab.label}</span>
            {tabs.length > 1 && (
              <button
                className='ml-0.5 shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100'
                onClick={e => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <X className='h-3 w-3' />
              </button>
            )}
          </div>
        ))}
        <button
          className='mb-1 ml-1 flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
          onClick={addTab}
          title='New session'
        >
          <Plus className='h-3.5 w-3.5' />
        </button>
      </div>

      {/* Terminal panes — only active one is visible, all stay mounted to preserve session */}
      <div className='relative min-h-0 flex-1'>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${activeTab === tab.id ? 'z-10' : 'pointer-events-none z-0 opacity-0'}`}
          >
            <SshTerminalPane
              initialHost={tab.host}
              initialPort={tab.port}
              initialUsername={tab.username}
              onConnected={(host, username) =>
                updateTabLabel(tab.id, `${username}@${host}`)
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
}
