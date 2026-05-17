import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { sshConnect, sshSendInput, sshResize, sshDisconnect, type SshAuth } from '@/lib/ssh'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { VaultCredentialPicker } from '@/components/vault-credential-picker'
import { Loader2, Terminal as TerminalIcon, X } from 'lucide-react'

interface ConnectForm {
  host: string
  port: string
  username: string
  authMethod: 'password' | 'key'
  password: string
  privateKey: string
}

interface SshTerminalPaneProps {
  initialHost?: string
  initialPort?: number
  initialUsername?: string
  onClose?: () => void
  onConnected?: (host: string, username: string) => void
}

export function SshTerminalPane({
  initialHost = '',
  initialPort = 22,
  initialUsername = '',
  onClose,
  onConnected,
}: SshTerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<ConnectForm>({
    host: initialHost,
    port: String(initialPort),
    username: initialUsername,
    authMethod: 'password',
    password: '',
    privateKey: '',
  })

  // Initialize xterm when component mounts
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        cursorAccent: '#09090b',
        selectionBackground: '#3f3f46',
        black: '#18181b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#3f3f46',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f4f4f5',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)

    try {
      const webgl = new WebglAddon()
      term.loadAddon(webgl)
    } catch {
      // WebGL not available, falls back to canvas
    }

    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    const observer = new ResizeObserver(() => {
      fit.fit()
      if (sessionIdRef.current && termRef.current) {
        sshResize(sessionIdRef.current, termRef.current.cols, termRef.current.rows).catch(() => {})
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  const handleConnect = useCallback(async () => {
    const term = termRef.current
    if (!term) return

    setConnecting(true)
    setError(null)

    const auth: SshAuth =
      form.authMethod === 'key'
        ? { method: 'key', private_key_pem: form.privateKey }
        : { method: 'password', password: form.password }

    try {
      const sessionId = await sshConnect({
        host: form.host,
        port: Number(form.port) || 22,
        username: form.username,
        auth,
        cols: term.cols,
        rows: term.rows,
        onOutput: (event) => {
          if (event.type === 'data') {
            term.write(new Uint8Array(event.data))
          } else if (event.type === 'exit') {
            term.write('\r\n\x1b[90m[Connection closed]\x1b[0m\r\n')
            sessionIdRef.current = null
            setConnected(false)
          } else if (event.type === 'error') {
            term.write(`\r\n\x1b[31m[Error: ${event.message}]\x1b[0m\r\n`)
          }
        },
      })

      sessionIdRef.current = sessionId
      setConnected(true)
      onConnected?.(form.host, form.username)

      // Wire keyboard input
      term.onData((data) => {
        if (sessionIdRef.current) {
          const bytes = new TextEncoder().encode(data)
          sshSendInput(sessionIdRef.current, bytes).catch(() => {})
        }
      })

      // Focus terminal
      term.focus()
    } catch (err) {
      setError(String(err))
    } finally {
      setConnecting(false)
    }
  }, [form])

  const handleDisconnect = useCallback(async () => {
    if (sessionIdRef.current) {
      await sshDisconnect(sessionIdRef.current)
      sessionIdRef.current = null
    }
    setConnected(false)
    termRef.current?.write('\r\n\x1b[90m[Disconnected]\x1b[0m\r\n')
  }, [])

  return (
    <div className='flex h-full flex-col bg-[#09090b]'>
      {/* Terminal toolbar */}
      <div className='flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2'>
        <TerminalIcon className='h-3.5 w-3.5 text-emerald-400' />
        <span className='font-mono text-xs text-zinc-300'>
          {connected
            ? `${form.username}@${form.host}:${form.port}`
            : 'SSH Terminal'}
        </span>
        <div className='ml-auto flex items-center gap-1.5'>
          {connected && (
            <Button
              variant='ghost'
              size='sm'
              className='h-6 px-2 text-[11px] text-zinc-400 hover:text-red-400'
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          )}
          {onClose && (
            <Button
              variant='ghost'
              size='icon'
              className='h-6 w-6 text-zinc-500 hover:text-zinc-200'
              onClick={onClose}
            >
              <X className='h-3.5 w-3.5' />
            </Button>
          )}
        </div>
      </div>

      {/* Connect form overlay (shown when not connected) */}
      {!connected && (
        <div className='absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm'>
          <div className='w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl'>
            <div className='mb-5 flex items-center gap-2'>
              <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10'>
                <TerminalIcon className='h-4 w-4 text-emerald-400' />
              </div>
              <div>
                <p className='text-sm font-semibold text-zinc-100'>SSH Connect</p>
                <p className='text-xs text-zinc-500'>Secure Shell connection</p>
              </div>
            </div>

            <div className='space-y-3'>
              <div className='flex gap-2'>
                <div className='flex-1'>
                  <Label className='text-xs text-zinc-400'>Host</Label>
                  <Input
                    value={form.host}
                    onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                    placeholder='192.168.1.1'
                    className='mt-1 h-8 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/50'
                  />
                </div>
                <div className='w-20'>
                  <Label className='text-xs text-zinc-400'>Port</Label>
                  <Input
                    value={form.port}
                    onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                    placeholder='22'
                    className='mt-1 h-8 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/50'
                  />
                </div>
              </div>

              <div>
                <Label className='text-xs text-zinc-400'>Username</Label>
                <Input
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder='root'
                  className='mt-1 h-8 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/50'
                />
              </div>

              <div>
                <Label className='text-xs text-zinc-400'>Auth method</Label>
                <select
                  value={form.authMethod}
                  onChange={e => setForm(f => ({ ...f, authMethod: e.target.value as 'password' | 'key' }))}
                  className='mt-1 h-8 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/50'
                >
                  <option value='password'>Password</option>
                  <option value='key'>Private key (PEM)</option>
                </select>
              </div>

              {form.authMethod === 'password' ? (
                <div>
                  <div className='flex items-center justify-between mb-1'>
                    <Label className='text-xs text-zinc-400'>Password</Label>
                    <VaultCredentialPicker
                      types={['password', 'username_password']}
                      onSelect={(secret) => setForm(f => ({ ...f, password: secret }))}
                    />
                  </div>
                  <Input
                    type='password'
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleConnect()}
                    placeholder='••••••••'
                    className='h-8 border-zinc-700 bg-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/50'
                  />
                </div>
              ) : (
                <div>
                  <div className='flex items-center justify-between mb-1'>
                    <Label className='text-xs text-zinc-400'>Private key (PEM)</Label>
                    <VaultCredentialPicker
                      types={['ssh_key']}
                      onSelect={(secret) => setForm(f => ({ ...f, privateKey: secret }))}
                    />
                  </div>
                  <Textarea
                    value={form.privateKey}
                    onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))}
                    placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...'}
                    rows={5}
                    className='border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/50 resize-none'
                  />
                </div>
              )}

              {error && (
                <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>
                  {error}
                </p>
              )}

              <Button
                className='mt-1 h-8 w-full bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-500'
                onClick={handleConnect}
                disabled={
                  connecting ||
                  !form.host ||
                  !form.username ||
                  (form.authMethod === 'password' ? !form.password : !form.privateKey.trim())
                }
              >
                {connecting ? (
                  <>
                    <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* xterm.js container */}
      <div ref={containerRef} className='relative min-h-0 flex-1 p-1' />
    </div>
  )
}
