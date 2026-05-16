import { useState, useRef, useEffect, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollText, Play, Square, Trash2, Search, X, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { sshExec, sshExecStop, type SshAuth, type SshEvent } from '@/lib/ssh'
import { cn } from '@/lib/utils'

// ── Command presets ────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'syslog (tail)', value: 'tail -f /var/log/syslog' },
  { label: 'auth.log (tail)', value: 'tail -f /var/log/auth.log' },
  { label: 'journalctl -f', value: 'journalctl -f --no-pager' },
  { label: 'journalctl -f (errors)', value: 'journalctl -f -p err --no-pager' },
  { label: 'dmesg -w', value: 'dmesg -w' },
  { label: 'kern.log (tail)', value: 'tail -f /var/log/kern.log' },
  { label: 'nginx access', value: 'tail -f /var/log/nginx/access.log' },
  { label: 'nginx error', value: 'tail -f /var/log/nginx/error.log' },
  { label: 'docker events', value: 'docker events' },
  { label: 'custom', value: '__custom__' },
]

// ── Log line coloring ──────────────────────────────────────────────────────────

function colorClass(line: string): string {
  const l = line.toLowerCase()
  if (/\b(error|err|crit|emerg|alert|fail|fatal)\b/.test(l)) return 'text-red-400'
  if (/\b(warn|warning)\b/.test(l)) return 'text-yellow-400'
  if (/\b(info|notice|debug)\b/.test(l)) return 'text-sky-400'
  return 'text-muted-foreground'
}

// ── Connect form ───────────────────────────────────────────────────────────────

interface ConnectFormProps {
  onConnect: (params: {
    host: string
    port: number
    username: string
    auth: SshAuth
    command: string
  }) => void
  connecting: boolean
}

function ConnectForm({ onConnect, connecting }: ConnectFormProps) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [preset, setPreset] = useState(PRESETS[0].value)
  const [custom, setCustom] = useState('')

  function handleConnect() {
    const command = preset === '__custom__' ? custom.trim() : preset
    if (!host.trim() || !username.trim() || !password || !command) return
    onConnect({
      host: host.trim(),
      port: parseInt(port) || 22,
      username: username.trim(),
      auth: { method: 'password', password },
      command,
    })
  }

  return (
    <div className='flex flex-col gap-4 rounded-lg border border-border/50 bg-card p-5'>
      <p className='text-sm font-semibold'>Connect to host</p>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <div className='col-span-2 sm:col-span-2'>
          <Label className='text-xs text-muted-foreground'>Host</Label>
          <Input
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder='192.168.1.10'
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <div>
          <Label className='text-xs text-muted-foreground'>Port</Label>
          <Input
            value={port}
            onChange={e => setPort(e.target.value)}
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <div>
          <Label className='text-xs text-muted-foreground'>Username</Label>
          <Input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder='root'
            className='mt-1 h-8 text-sm'
          />
        </div>
        <div className='col-span-2 sm:col-span-4'>
          <Label className='text-xs text-muted-foreground'>Password</Label>
          <Input
            type='password'
            value={password}
            onChange={e => setPassword(e.target.value)}
            className='mt-1 h-8 text-sm'
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
          />
        </div>
      </div>

      <div className='flex flex-col gap-2'>
        <Label className='text-xs text-muted-foreground'>Command</Label>
        <select
          value={preset}
          onChange={e => setPreset(e.target.value)}
          className='h-8 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
        >
          {PRESETS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        {preset === '__custom__' && (
          <Input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder='tail -f /var/log/myapp.log'
            className='h-8 font-mono text-sm'
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
          />
        )}
      </div>

      <Button
        size='sm'
        onClick={handleConnect}
        disabled={connecting || !host || !username || !password || (preset === '__custom__' && !custom)}
        className='self-start gap-1.5'
      >
        <Play className='h-3.5 w-3.5' />
        {connecting ? 'Connecting…' : 'Start streaming'}
      </Button>
    </div>
  )
}

// ── Log output pane ────────────────────────────────────────────────────────────

interface LogLine {
  id: number
  text: string
}

interface LogPaneProps {
  lines: LogLine[]
  filter: string
  autoScroll: boolean
  onAutoScrollToggle: () => void
  onClear: () => void
  onStop: () => void
  running: boolean
  host: string
  command: string
}

function LogPane({
  lines,
  filter,
  autoScroll,
  onAutoScrollToggle,
  onClear,
  onStop,
  running,
  host,
  command,
}: LogPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, autoScroll])

  const filtered = filter
    ? lines.filter(l => l.text.toLowerCase().includes(filter.toLowerCase()))
    : lines

  return (
    <div className='flex flex-1 flex-col overflow-hidden rounded-lg border border-border/50 bg-[#0d0d0f]'>
      {/* toolbar */}
      <div className='flex items-center gap-2 border-b border-border/40 px-3 py-2'>
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <span className='truncate font-mono text-[11px] text-muted-foreground'>
            {host} — {command}
          </span>
          {running ? (
            <Badge variant='outline' className='shrink-0 border-emerald-500/40 text-emerald-400 text-[10px]'>
              live
            </Badge>
          ) : (
            <Badge variant='outline' className='shrink-0 text-[10px] text-muted-foreground'>
              stopped
            </Badge>
          )}
          <span className='shrink-0 text-[10px] text-muted-foreground tabular-nums'>
            {lines.length} lines
          </span>
        </div>
        <Button
          variant='ghost'
          size='icon'
          className={cn('h-6 w-6', autoScroll && 'text-indigo-400')}
          onClick={onAutoScrollToggle}
          title='Toggle auto-scroll'
        >
          <ChevronDown className='h-3.5 w-3.5' />
        </Button>
        <Button variant='ghost' size='icon' className='h-6 w-6' onClick={onClear} title='Clear'>
          <Trash2 className='h-3.5 w-3.5' />
        </Button>
        {running && (
          <Button
            variant='ghost'
            size='icon'
            className='h-6 w-6 text-red-400 hover:text-red-300'
            onClick={onStop}
            title='Stop'
          >
            <Square className='h-3 w-3 fill-current' />
          </Button>
        )}
      </div>

      {/* log lines */}
      <div className='flex-1 overflow-y-auto px-3 py-2'>
        {filtered.length === 0 ? (
          <p className='text-xs text-muted-foreground/50'>
            {lines.length === 0 ? 'Waiting for output…' : 'No lines match filter.'}
          </p>
        ) : (
          filtered.map(l => (
            <div key={l.id} className={cn('font-mono text-[11px] leading-5 whitespace-pre-wrap break-all', colorClass(l.text))}>
              {l.text}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function LogViewer() {
  const [connecting, setConnecting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [lines, setLines] = useState<LogLine[]>([])
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [connInfo, setConnInfo] = useState<{ host: string; command: string } | null>(null)
  const lineCounter = useRef(0)
  const textBuf = useRef('')

  const running = sessionId !== null

  const handleEvent = useCallback((event: SshEvent) => {
    if (event.type === 'data') {
      const chunk = new TextDecoder().decode(new Uint8Array(event.data))
      textBuf.current += chunk
      const parts = textBuf.current.split('\n')
      textBuf.current = parts.pop() ?? ''
      const newLines: LogLine[] = parts.map(text => ({
        id: ++lineCounter.current,
        text,
      }))
      if (newLines.length > 0) {
        setLines(prev => {
          const combined = [...prev, ...newLines]
          // cap at 5000 lines to avoid memory blow-up
          return combined.length > 5000 ? combined.slice(-5000) : combined
        })
      }
    } else if (event.type === 'exit') {
      setSessionId(null)
    } else if (event.type === 'error') {
      toast.error(event.message)
      setSessionId(null)
    }
  }, [])

  async function handleConnect(params: {
    host: string
    port: number
    username: string
    auth: SshAuth
    command: string
  }) {
    setConnecting(true)
    try {
      const id = await sshExec({
        host: params.host,
        port: params.port,
        username: params.username,
        auth: params.auth,
        command: params.command,
        onOutput: handleEvent,
      })
      setSessionId(id)
      setConnInfo({ host: params.host, command: params.command })
      setLines([])
      textBuf.current = ''
    } catch (e) {
      toast.error(String(e))
    } finally {
      setConnecting(false)
    }
  }

  async function handleStop() {
    if (!sessionId) return
    await sshExecStop(sessionId).catch(() => {})
    setSessionId(null)
  }

  function handleNewSession() {
    handleStop()
    setConnInfo(null)
    setLines([])
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <ScrollText className='h-4 w-4 text-muted-foreground' />
          <span className='font-semibold'>Log Viewer</span>
          {running && (
            <Badge variant='outline' className='border-emerald-500/40 text-emerald-400 text-[10px] tabular-nums'>
              live
            </Badge>
          )}
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold tracking-tight'>Log Viewer</h2>
            <p className='text-xs text-muted-foreground'>
              Tail remote logs over SSH — syslog, journalctl, nginx, docker, custom commands
            </p>
          </div>
          {connInfo && (
            <Button size='sm' variant='outline' onClick={handleNewSession} className='gap-1.5'>
              <X className='h-3.5 w-3.5' />
              New session
            </Button>
          )}
        </div>

        {!connInfo ? (
          <ConnectForm onConnect={handleConnect} connecting={connecting} />
        ) : (
          <>
            <div className='flex items-center gap-2'>
              <div className='relative flex-1 max-w-xs'>
                <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
                <Input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder='Filter lines…'
                  className='h-8 pl-8 text-sm font-mono'
                />
                {filter && (
                  <button
                    className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                    onClick={() => setFilter('')}
                  >
                    <X className='h-3.5 w-3.5' />
                  </button>
                )}
              </div>
            </div>

            <div className='flex flex-1 overflow-hidden' style={{ minHeight: 400 }}>
              <LogPane
                lines={lines}
                filter={filter}
                autoScroll={autoScroll}
                onAutoScrollToggle={() => setAutoScroll(v => !v)}
                onClear={() => setLines([])}
                onStop={handleStop}
                running={running}
                host={connInfo.host}
                command={connInfo.command}
              />
            </div>
          </>
        )}
      </Main>
    </>
  )
}
