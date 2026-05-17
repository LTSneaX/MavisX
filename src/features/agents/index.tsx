import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/db'
import { sshExec, sshExecStop, type SshAuth, type SshEvent } from '@/lib/ssh'
import { vault } from '@/lib/vault'
import { VaultCredentialPicker } from '@/components/vault-credential-picker'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  ServerCog, Cpu, MemoryStick, HardDrive, Activity,
  Loader2, RefreshCw, X, Server, Clock, Plus, Wifi, WifiOff,
} from 'lucide-react'

// ── Metrics command ───────────────────────────────────────────────────────────

const METRICS_CMD = [
  'echo __CPU1__',
  'cat /proc/stat | head -1',
  'sleep 1',
  'echo __CPU2__',
  'cat /proc/stat | head -1',
  'echo __MEM__',
  "grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo",
  'echo __DISK__',
  "df -P 2>/dev/null | grep -v 'tmpfs\\|devtmpfs\\|udev\\|overlay\\|shm'",
  'echo __LOAD__',
  'cat /proc/loadavg',
  'echo __UPTIME__',
  'cat /proc/uptime',
  'echo __PROCS__',
  "ps axo pid,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -8 | tail -n +2",
  'echo __END__',
].join('; ')

// ── Parser ────────────────────────────────────────────────────────────────────

interface DiskEntry { mount: string; size: number; used: number; avail: number; usePct: number }
interface ProcEntry { pid: string; cpu: number; mem: number; name: string }

interface Metrics {
  cpu: number
  memTotal: number
  memAvail: number
  swapTotal: number
  swapFree: number
  load1: number
  load5: number
  load15: number
  uptimeSec: number
  disks: DiskEntry[]
  procs: ProcEntry[]
  ts: number
}

function parseMetrics(raw: string): Metrics | null {
  try {
    const sections: Record<string, string[]> = {}
    let cur = ''
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (t.startsWith('__') && t.endsWith('__')) { cur = t; sections[cur] = []; continue }
      if (cur && t) sections[cur].push(t)
    }
    function parseCpuLine(l: string): number[] {
      return l.split(/\s+/).slice(1).map(Number)
    }
    const cpu1 = sections['__CPU1__']?.[0]
    const cpu2 = sections['__CPU2__']?.[0]
    let cpuPct = 0
    if (cpu1 && cpu2) {
      const a = parseCpuLine(cpu1), b = parseCpuLine(cpu2)
      const dt = b.reduce((s, v) => s + v, 0) - a.reduce((s, v) => s + v, 0)
      const di = (b[3] ?? 0) - (a[3] ?? 0)
      cpuPct = dt > 0 ? Math.round(((dt - di) / dt) * 100) : 0
    }
    const memMap: Record<string, number> = {}
    for (const l of sections['__MEM__'] ?? []) {
      const [key, val] = l.split(':')
      memMap[key.trim()] = parseInt(val.trim()) * 1024
    }
    const disks: DiskEntry[] = []
    for (const l of (sections['__DISK__'] ?? []).slice(1)) {
      const parts = l.split(/\s+/)
      if (parts.length < 6) continue
      const size = parseInt(parts[1]) * 1024, used = parseInt(parts[2]) * 1024
      const avail = parseInt(parts[3]) * 1024, usePct = parseInt(parts[4].replace('%', ''))
      if (!isNaN(size) && !isNaN(used)) disks.push({ mount: parts[5], size, used, avail, usePct })
    }
    const [load1, load5, load15] = (sections['__LOAD__']?.[0] ?? '').split(' ').map(parseFloat)
    const uptimeSec = parseFloat(sections['__UPTIME__']?.[0]?.split(' ')[0] ?? '0')
    const procs: ProcEntry[] = []
    for (const l of sections['__PROCS__'] ?? []) {
      const p = l.trim().split(/\s+/)
      if (p.length < 4) continue
      procs.push({ pid: p[0], cpu: parseFloat(p[1]), mem: parseFloat(p[2]), name: p[3] })
    }
    return {
      cpu: cpuPct,
      memTotal: memMap['MemTotal'] ?? 0, memAvail: memMap['MemAvailable'] ?? 0,
      swapTotal: memMap['SwapTotal'] ?? 0, swapFree: memMap['SwapFree'] ?? 0,
      load1: load1 ?? 0, load5: load5 ?? 0, load15: load15 ?? 0,
      uptimeSec, disks, procs, ts: Date.now(),
    }
  } catch { return null }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b <= 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function pctColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MiniBar({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  return (
    <div className='space-y-1'>
      <div className='flex justify-between text-xs'>
        <span className='font-medium text-zinc-300'>{label}</span>
        <span className='tabular-nums text-zinc-400'>{sub}</span>
      </div>
      <div className='h-1.5 w-full rounded-full bg-zinc-800'>
        <div className={`h-1.5 rounded-full transition-all ${pctColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className='text-right text-[10px] text-zinc-600'>{pct}%</div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className='rounded-lg border border-zinc-800 bg-zinc-900/60 p-4'>
      <div className='flex items-center gap-2 mb-2'>
        <Icon className={`h-4 w-4 ${color}`} />
        <span className='text-xs font-medium text-zinc-400'>{label}</span>
      </div>
      <p className='text-2xl font-bold tabular-nums text-zinc-100'>{value}</p>
      {sub && <p className='mt-0.5 text-[11px] text-zinc-500'>{sub}</p>}
    </div>
  )
}

// ── Agent picker (shown before connecting) ────────────────────────────────────

interface AgentSession {
  id: string
  label: string
  host: string
  port: number
  username: string
  auth: SshAuth
}

function AgentPicker({ onConnect }: {
  onConnect: (session: AgentSession) => void
}) {
  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => db.listConnections(),
  })
  const sshConns = connections.filter(c => c.type === 'ssh')

  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState({ host: '', port: '22', username: '', password: '' })
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // connId → password prompt state
  const [pwPrompt, setPwPrompt] = useState<{ connId: string; value: string } | null>(null)

  async function connectSaved(connId: string, overridePw?: string) {
    const conn = sshConns.find(c => c.id === connId)
    if (!conn) return
    setError(null)

    // Resolve password
    let pw = overridePw ?? ''
    if (!pw && conn.vault_item_id) {
      try { pw = await vault.getSecretByItemId(conn.vault_item_id) } catch { /* vault locked */ }
    }

    // No password found — show inline prompt instead of attempting
    if (!pw && overridePw === undefined) {
      setPwPrompt({ connId, value: '' })
      return
    }

    setConnecting(connId)
    const auth: SshAuth = { method: 'password', password: pw }
    try {
      await testExec(conn.host ?? '', Number(conn.port ?? 22), conn.username ?? '', auth)
      setPwPrompt(null)
      onConnect({
        id: connId,
        label: conn.name,
        host: conn.host ?? '',
        port: Number(conn.port ?? 22),
        username: conn.username ?? '',
        auth,
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setConnecting(null)
    }
  }

  async function connectManual() {
    setConnecting('manual')
    setError(null)
    const auth: SshAuth = { method: 'password', password: manualForm.password }
    try {
      await testExec(manualForm.host, Number(manualForm.port) || 22, manualForm.username, auth)
      onConnect({
        id: `manual-${Date.now()}`,
        label: `${manualForm.username}@${manualForm.host}`,
        host: manualForm.host,
        port: Number(manualForm.port) || 22,
        username: manualForm.username,
        auth,
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className='flex flex-col gap-6 bg-zinc-950 min-h-full p-6'>
      <div>
        <h2 className='text-base font-semibold text-zinc-100'>Connect to an agent</h2>
        <p className='text-xs text-zinc-500 mt-0.5'>Pick a saved SSH connection or enter manually</p>
      </div>

      {error && (
        <div className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>
          {error}
        </div>
      )}

      {/* Saved connections */}
      {sshConns.length > 0 && (
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {sshConns.map(conn => (
            <div
              key={conn.id}
              className='relative flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-700 transition-colors'
            >
              <div className='flex items-center gap-3'>
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10'>
                  <Server className='h-4 w-4 text-violet-400' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-semibold text-zinc-100 truncate'>{conn.name}</p>
                  <p className='text-[11px] font-mono text-zinc-500 truncate'>
                    {conn.username ? `${conn.username}@` : ''}{conn.host}:{conn.port ?? 22}
                  </p>
                </div>
              </div>

              <div className='flex items-center gap-2'>
                <Badge variant='outline' className='border-zinc-700 text-zinc-400 text-[10px]'>SSH</Badge>
                {conn.vault_item_id && (
                  <Badge variant='outline' className='border-zinc-700 text-zinc-400 text-[10px]'>Vault</Badge>
                )}
                {conn.last_connected_at && (
                  <span className='text-[10px] text-zinc-600 ml-auto'>
                    {new Date(conn.last_connected_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              {pwPrompt?.connId === conn.id ? (
                <div className='flex flex-col gap-2'>
                  <Label className='text-xs text-zinc-400'>Password for {conn.username}@{conn.host}</Label>
                  <Input
                    type='password'
                    autoFocus
                    placeholder='••••••••'
                    value={pwPrompt.value}
                    onChange={e => setPwPrompt(p => p ? { ...p, value: e.target.value } : p)}
                    onKeyDown={e => e.key === 'Enter' && connectSaved(conn.id, pwPrompt.value)}
                    className='h-8 border-zinc-700 bg-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600'
                  />
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      className='h-7 flex-1 bg-violet-600 hover:bg-violet-500 text-xs'
                      onClick={() => connectSaved(conn.id, pwPrompt.value)}
                      disabled={connecting === conn.id || !pwPrompt.value}
                    >
                      {connecting === conn.id ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Connect'}
                    </Button>
                    <Button
                      variant='ghost' size='sm'
                      className='h-7 text-xs text-zinc-500'
                      onClick={() => setPwPrompt(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size='sm'
                  className='h-7 w-full bg-violet-600 hover:bg-violet-500 text-xs'
                  onClick={() => connectSaved(conn.id)}
                  disabled={connecting !== null}
                >
                  {connecting === conn.id ? (
                    <><Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />Connecting…</>
                  ) : (
                    <><Wifi className='mr-1.5 h-3.5 w-3.5' />Connect</>
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual entry */}
      {!showManual ? (
        <button
          onClick={() => setShowManual(true)}
          className='flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-fit'
        >
          <Plus className='h-3.5 w-3.5' />
          Enter connection manually
        </button>
      ) : (
        <div className='rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 max-w-md flex flex-col gap-3'>
          <p className='text-xs font-semibold text-zinc-300'>Manual connection</p>
          <div className='flex gap-2'>
            <div className='flex-1'>
              <Label className='text-xs text-zinc-400'>Host</Label>
              <Input
                value={manualForm.host}
                onChange={e => setManualForm(f => ({ ...f, host: e.target.value }))}
                placeholder='192.168.1.10'
                className='mt-1 h-8 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-600'
              />
            </div>
            <div className='w-20'>
              <Label className='text-xs text-zinc-400'>Port</Label>
              <Input
                value={manualForm.port}
                onChange={e => setManualForm(f => ({ ...f, port: e.target.value }))}
                className='mt-1 h-8 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100'
              />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <div>
              <Label className='text-xs text-zinc-400'>Username</Label>
              <Input
                value={manualForm.username}
                onChange={e => setManualForm(f => ({ ...f, username: e.target.value }))}
                placeholder='root'
                className='mt-1 h-8 border-zinc-700 bg-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600'
              />
            </div>
            <div>
              <div className='flex items-center justify-between mb-1'>
                <Label className='text-xs text-zinc-400'>Password</Label>
                <VaultCredentialPicker
                  types={['password', 'username_password']}
                  onSelect={s => setManualForm(f => ({ ...f, password: s }))}
                />
              </div>
              <Input
                type='password'
                value={manualForm.password}
                onChange={e => setManualForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && manualForm.host && manualForm.username && connectManual()}
                placeholder='••••••••'
                className='h-8 border-zinc-700 bg-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600'
              />
            </div>
          </div>
          <div className='flex gap-2'>
            <Button
              size='sm'
              className='h-7 bg-violet-600 hover:bg-violet-500 text-xs'
              onClick={connectManual}
              disabled={connecting !== null || !manualForm.host || !manualForm.username}
            >
              {connecting === 'manual' ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Connect'}
            </Button>
            <Button variant='ghost' size='sm' className='h-7 text-xs text-zinc-500' onClick={() => setShowManual(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {sshConns.length === 0 && !showManual && (
        <div className='flex flex-col items-center gap-3 py-16 text-center'>
          <ServerCog className='h-8 w-8 text-zinc-600' />
          <div>
            <p className='text-sm font-medium text-zinc-300'>No SSH connections saved</p>
            <p className='text-xs text-zinc-500 mt-1'>Add an SSH connection in the Connections page, or connect manually above.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Test exec helper ──────────────────────────────────────────────────────────

function testExec(host: string, port: number, username: string, auth: SshAuth): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false
    sshExec({
      host, port, username, auth,
      command: 'echo ok',
      onOutput: (ev: SshEvent) => {
        if (ev.type === 'exit') { if (!done) { done = true; resolve() } }
        if (ev.type === 'error') { if (!done) { done = true; reject(new Error(ev.message)) } }
      },
    }).catch(reject)
  })
}

// ── Metrics dashboard ─────────────────────────────────────────────────────────

function MetricsDashboard({
  host, port, username, auth, onDisconnect, onMetrics,
}: {
  host: string; port: number; username: string; auth: SshAuth
  onDisconnect: () => void
  onMetrics?: (m: Metrics | null) => void
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polling, setPolling] = useState(true)
  const execRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  const runPoll = useCallback(async () => {
    if (!mountedRef.current) return
    let output = ''
    try {
      const sessionId = await sshExec({
        host, port, username, auth,
        command: METRICS_CMD,
        onOutput: (ev: SshEvent) => {
          if (ev.type === 'data') {
            output += new TextDecoder().decode(new Uint8Array(ev.data))
          } else if (ev.type === 'exit') {
            if (!mountedRef.current) return
            const m = parseMetrics(output)
            if (m) { setMetrics(m); setError(null); onMetrics?.(m) }
            else setError('Failed to parse metrics')
          } else if (ev.type === 'error') {
            if (mountedRef.current) setError(ev.message)
          }
        },
      })
      execRef.current = sessionId
    } catch (e) {
      if (mountedRef.current) setError(String(e))
    }
  }, [host, port, username, auth, onMetrics])

  useEffect(() => {
    mountedRef.current = true
    runPoll()
    const id = setInterval(() => { if (polling) runPoll() }, 5000)
    return () => {
      mountedRef.current = false
      clearInterval(id)
      if (execRef.current) { sshExecStop(execRef.current).catch(() => {}); execRef.current = null }
    }
  }, [runPoll, polling])

  const memUsed = metrics ? metrics.memTotal - metrics.memAvail : 0
  const memPct = metrics ? Math.round((memUsed / metrics.memTotal) * 100) : 0
  const swapUsed = metrics ? metrics.swapTotal - metrics.swapFree : 0
  const swapPct = metrics && metrics.swapTotal > 0 ? Math.round((swapUsed / metrics.swapTotal) * 100) : 0

  return (
    <div className='flex h-full flex-col bg-zinc-950 text-zinc-100'>
      <div className='flex shrink-0 items-center gap-3 border-b border-zinc-800 px-6 py-3'>
        <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10'>
          <Server className='h-4 w-4 text-violet-400' />
        </div>
        <div>
          <p className='text-sm font-semibold text-zinc-100'>{host}</p>
          <p className='text-xs text-zinc-500'>{username}@{host}:{port}</p>
        </div>
        <div className='ml-auto flex items-center gap-2'>
          {polling && !error && (
            <span className='flex items-center gap-1 text-[10px] text-emerald-400'>
              <span className='relative flex h-2 w-2'>
                <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
                <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
              </span>
              Live · 5s
            </span>
          )}
          <Button variant='ghost' size='sm' className='h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200'
            onClick={() => setPolling(p => !p)}>
            <RefreshCw className='mr-1 h-3 w-3' />{polling ? 'Pause' : 'Resume'}
          </Button>
          <Button variant='ghost' size='sm' className='h-7 px-2 text-xs text-zinc-500 hover:text-red-400'
            onClick={onDisconnect}>
            <WifiOff className='mr-1 h-3 w-3' />Disconnect
          </Button>
        </div>
      </div>

      {error && (
        <div className='shrink-0 border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-xs text-red-400'>{error}</div>
      )}

      {!metrics && !error && (
        <div className='flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500'>
          <Loader2 className='h-4 w-4 animate-spin' />Collecting metrics…
        </div>
      )}

      {metrics && (
        <div className='min-h-0 flex-1 overflow-y-auto p-6 space-y-6'>
          <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
            <KpiCard icon={Cpu} label='CPU' value={`${metrics.cpu}%`} sub='user + system' color='text-violet-400' />
            <KpiCard icon={MemoryStick} label='RAM' value={`${memPct}%`}
              sub={`${fmtBytes(memUsed)} / ${fmtBytes(metrics.memTotal)}`} color='text-blue-400' />
            <KpiCard icon={Activity} label='Load (1m)' value={metrics.load1.toFixed(2)}
              sub={`5m: ${metrics.load5.toFixed(2)} · 15m: ${metrics.load15.toFixed(2)}`} color='text-amber-400' />
            <KpiCard icon={Clock} label='Uptime' value={fmtUptime(metrics.uptimeSec)} color='text-emerald-400' />
          </div>

          <div className='rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-4'>
            <p className='text-xs font-semibold uppercase tracking-widest text-zinc-500'>Usage</p>
            <MiniBar pct={metrics.cpu} label='CPU' sub={`${metrics.cpu}%`} />
            <MiniBar pct={memPct} label='RAM' sub={`${fmtBytes(memUsed)} used / ${fmtBytes(metrics.memTotal)}`} />
            {metrics.swapTotal > 0 && (
              <MiniBar pct={swapPct} label='Swap' sub={`${fmtBytes(swapUsed)} used / ${fmtBytes(metrics.swapTotal)}`} />
            )}
          </div>

          {metrics.disks.length > 0 && (
            <div className='rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden'>
              <div className='flex items-center gap-2 px-4 py-3 border-b border-zinc-800'>
                <HardDrive className='h-3.5 w-3.5 text-zinc-500' />
                <p className='text-xs font-semibold uppercase tracking-widest text-zinc-500'>Disks</p>
              </div>
              <table className='w-full text-xs'>
                <thead>
                  <tr className='border-b border-zinc-800 text-left text-zinc-600'>
                    <th className='px-4 py-2 font-medium'>Mount</th>
                    <th className='px-4 py-2 font-medium'>Size</th>
                    <th className='px-4 py-2 font-medium'>Used</th>
                    <th className='px-4 py-2 font-medium'>Available</th>
                    <th className='px-4 py-2 font-medium w-32'>Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.disks.map(d => (
                    <tr key={d.mount} className='border-b border-zinc-800/40 hover:bg-zinc-800/30'>
                      <td className='px-4 py-2 font-mono text-zinc-200'>{d.mount}</td>
                      <td className='px-4 py-2 text-zinc-400'>{fmtBytes(d.size)}</td>
                      <td className='px-4 py-2 text-zinc-400'>{fmtBytes(d.used)}</td>
                      <td className='px-4 py-2 text-zinc-400'>{fmtBytes(d.avail)}</td>
                      <td className='px-4 py-2'>
                        <div className='flex items-center gap-2'>
                          <div className='h-1.5 flex-1 rounded-full bg-zinc-800'>
                            <div className={`h-1.5 rounded-full ${pctColor(d.usePct)}`}
                              style={{ width: `${Math.min(d.usePct, 100)}%` }} />
                          </div>
                          <span className={`text-[10px] tabular-nums ${d.usePct >= 90 ? 'text-red-400' : 'text-zinc-500'}`}>
                            {d.usePct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {metrics.procs.length > 0 && (
            <div className='rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden'>
              <div className='flex items-center gap-2 px-4 py-3 border-b border-zinc-800'>
                <Cpu className='h-3.5 w-3.5 text-zinc-500' />
                <p className='text-xs font-semibold uppercase tracking-widest text-zinc-500'>Top Processes</p>
              </div>
              <table className='w-full text-xs'>
                <thead>
                  <tr className='border-b border-zinc-800 text-left text-zinc-600'>
                    <th className='px-4 py-2 font-medium'>PID</th>
                    <th className='px-4 py-2 font-medium'>Process</th>
                    <th className='px-4 py-2 font-medium'>CPU%</th>
                    <th className='px-4 py-2 font-medium'>MEM%</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.procs.map(p => (
                    <tr key={p.pid} className='border-b border-zinc-800/40 hover:bg-zinc-800/30'>
                      <td className='px-4 py-2 font-mono text-zinc-500'>{p.pid}</td>
                      <td className='px-4 py-2 font-mono text-zinc-200'>{p.name}</td>
                      <td className='px-4 py-2 tabular-nums text-zinc-300'>{p.cpu.toFixed(1)}</td>
                      <td className='px-4 py-2 tabular-nums text-zinc-300'>{p.mem.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className='text-center text-[10px] text-zinc-700'>
            Last updated {new Date(metrics.ts).toLocaleTimeString()} · polling every 5s via SSH exec
          </p>
        </div>
      )}
    </div>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

interface Tab {
  id: string
  label: string
  session: AgentSession | null
  liveMetrics: Metrics | null
}

let _counter = 1

// ── Main export ───────────────────────────────────────────────────────────────

export function AgentsPage() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'tab-1', label: 'New agent', session: null, liveMetrics: null },
  ])
  const [activeId, setActiveId] = useState('tab-1')

  function addTab() {
    _counter++
    const id = `tab-${_counter}`
    setTabs(prev => [...prev, { id, label: 'New agent', session: null, liveMetrics: null }])
    setActiveId(id)
  }

  function closeTab(id: string) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeId === id && next.length > 0) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  function connectTab(id: string, session: AgentSession) {
    setTabs(prev => prev.map(t =>
      t.id === id ? { ...t, label: session.label, session, liveMetrics: null } : t
    ))
  }

  function disconnectTab(id: string) {
    setTabs(prev => prev.map(t =>
      t.id === id ? { ...t, label: 'New agent', session: null, liveMetrics: null } : t
    ))
  }

  function updateMetrics(id: string, m: Metrics | null) {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, liveMetrics: m } : t))
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-1 me-auto overflow-x-auto'>
          {tabs.map(tab => {
            const isActive = tab.id === activeId
            const isLive = !!tab.session
            return (
              <button
                key={tab.id}
                onClick={() => setActiveId(tab.id)}
                className={`flex items-center gap-1.5 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {isLive ? (
                  <>
                    <span className='relative flex h-2 w-2 shrink-0'>
                      <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
                      <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
                    </span>
                    <span className='max-w-[120px] truncate'>{tab.label}</span>
                    {tab.liveMetrics && (
                      <span className='text-[10px] text-zinc-500 tabular-nums'>
                        {tab.liveMetrics.cpu}%
                      </span>
                    )}
                  </>
                ) : (
                  <span className='max-w-[120px] truncate'>{tab.label}</span>
                )}
                {tabs.length > 1 && (
                  <X
                    className='h-3 w-3 shrink-0 text-zinc-600 hover:text-zinc-300'
                    onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                  />
                )}
              </button>
            )
          })}
          <button
            onClick={addTab}
            className='flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors shrink-0'
          >
            <Plus className='h-3.5 w-3.5' />
          </button>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='p-0 bg-zinc-950 overflow-hidden'>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className='h-full'
            style={{ display: tab.id === activeId ? 'block' : 'none' }}
          >
            {tab.session ? (
              <MetricsDashboard
                {...tab.session}
                onDisconnect={() => disconnectTab(tab.id)}
                onMetrics={m => updateMetrics(tab.id, m)}
              />
            ) : (
              <AgentPicker
                onConnect={session => connectTab(tab.id, session)}
              />
            )}
          </div>
        ))}
      </Main>
    </>
  )
}
