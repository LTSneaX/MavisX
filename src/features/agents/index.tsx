import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/db'
import { sshExec, sshExecStop, type SshAuth, type SshEvent } from '@/lib/ssh'
import { vault } from '@/lib/vault'
import { VaultCredentialPicker } from '@/components/vault-credential-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ServerCog,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Loader2,
  RefreshCw,
  X,
  Server,
  Clock,
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

    // CPU from two /proc/stat samples
    function parseCpuLine(l: string): number[] {
      return l.split(/\s+/).slice(1).map(Number)
    }
    const cpu1 = sections['__CPU1__']?.[0]
    const cpu2 = sections['__CPU2__']?.[0]
    let cpuPct = 0
    if (cpu1 && cpu2) {
      const a = parseCpuLine(cpu1)
      const b = parseCpuLine(cpu2)
      const totalA = a.reduce((s, v) => s + v, 0)
      const totalB = b.reduce((s, v) => s + v, 0)
      const idleA = a[3] ?? 0
      const idleB = b[3] ?? 0
      const dt = totalB - totalA
      const di = idleB - idleA
      cpuPct = dt > 0 ? Math.round(((dt - di) / dt) * 100) : 0
    }

    // Memory
    const memMap: Record<string, number> = {}
    for (const l of sections['__MEM__'] ?? []) {
      const [key, val] = l.split(':')
      memMap[key.trim()] = parseInt(val.trim()) * 1024
    }

    // Disks — df -P header: Filesystem 1024-blocks Used Available Capacity Mounted
    const disks: DiskEntry[] = []
    for (const l of (sections['__DISK__'] ?? []).slice(1)) {
      const parts = l.split(/\s+/)
      if (parts.length < 6) continue
      const size = parseInt(parts[1]) * 1024
      const used = parseInt(parts[2]) * 1024
      const avail = parseInt(parts[3]) * 1024
      const usePct = parseInt(parts[4].replace('%', ''))
      const mount = parts[5]
      if (!isNaN(size) && !isNaN(used)) disks.push({ mount, size, used, avail, usePct })
    }

    // Load
    const loadLine = sections['__LOAD__']?.[0] ?? ''
    const [load1, load5, load15] = loadLine.split(' ').map(parseFloat)

    // Uptime
    const uptimeSec = parseFloat(sections['__UPTIME__']?.[0]?.split(' ')[0] ?? '0')

    // Processes
    const procs: ProcEntry[] = []
    for (const l of sections['__PROCS__'] ?? []) {
      const parts = l.trim().split(/\s+/)
      if (parts.length < 4) continue
      procs.push({ pid: parts[0], cpu: parseFloat(parts[1]), mem: parseFloat(parts[2]), name: parts[3] })
    }

    return {
      cpu: cpuPct,
      memTotal: memMap['MemTotal'] ?? 0,
      memAvail: memMap['MemAvailable'] ?? 0,
      swapTotal: memMap['SwapTotal'] ?? 0,
      swapFree: memMap['SwapFree'] ?? 0,
      load1: load1 ?? 0,
      load5: load5 ?? 0,
      load15: load15 ?? 0,
      uptimeSec,
      disks,
      procs,
      ts: Date.now(),
    }
  } catch {
    return null
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b <= 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
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
        <div
          className={`h-1.5 rounded-full transition-all ${pctColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
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

// ── Connect form ──────────────────────────────────────────────────────────────

interface ConnForm {
  connectionId: string
  host: string
  port: string
  username: string
  authMethod: 'password' | 'key'
  password: string
  privateKey: string
}

function ConnectForm({ onConnect }: {
  onConnect: (host: string, port: number, username: string, auth: SshAuth) => void
}) {
  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => db.listConnections(),
  })
  const sshConns = connections.filter((c) => c.type === 'ssh')

  const [form, setForm] = useState<ConnForm>({
    connectionId: '',
    host: '',
    port: '22',
    username: '',
    authMethod: 'password',
    password: '',
    privateKey: '',
  })
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickConnection(id: string) {
    setForm((f) => ({ ...f, connectionId: id }))
    if (!id) return
    const conn = sshConns.find((c) => c.id === id)
    if (!conn) return
    let pw = ''
    if (conn.vault_item_id) {
      try { pw = await vault.getSecret(conn.vault_item_id) } catch { /* vault locked */ }
    }
    setForm((f) => ({
      ...f,
      connectionId: id,
      host: conn.host ?? '',
      port: String(conn.port ?? 22),
      username: conn.username ?? '',
      authMethod: 'password',
      password: pw,
    }))
  }

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    const auth: SshAuth =
      form.authMethod === 'key'
        ? { method: 'key', private_key_pem: form.privateKey }
        : { method: 'password', password: form.password }
    try {
      // Quick test exec to validate credentials
      await new Promise<void>((resolve, reject) => {
        let done = false
        sshExec({
          host: form.host,
          port: Number(form.port) || 22,
          username: form.username,
          auth,
          command: 'echo ok',
          onOutput: (ev: SshEvent) => {
            if (ev.type === 'exit') { if (!done) { done = true; resolve() } }
            if (ev.type === 'error') { if (!done) { done = true; reject(new Error(ev.message)) } }
          },
        }).catch(reject)
      })
      onConnect(form.host, Number(form.port) || 22, form.username, auth)
    } catch (e) {
      setError(String(e))
    } finally {
      setConnecting(false)
    }
  }

  const canConnect =
    !connecting &&
    form.host &&
    form.username &&
    (form.authMethod === 'password' ? !!form.password : !!form.privateKey.trim())

  return (
    <div className='flex h-full items-center justify-center bg-zinc-950'>
      <div className='w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl'>
        <div className='mb-5 flex items-center gap-2'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10'>
            <ServerCog className='h-4 w-4 text-violet-400' />
          </div>
          <div>
            <p className='text-sm font-semibold text-zinc-100'>Server Metrics</p>
            <p className='text-xs text-zinc-500'>Connect via SSH</p>
          </div>
        </div>

        <div className='space-y-3'>
          {sshConns.length > 0 && (
            <div>
              <Label className='text-xs text-zinc-400'>Saved connection</Label>
              <select
                value={form.connectionId}
                onChange={(e) => pickConnection(e.target.value)}
                className='mt-1 h-8 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500/50'
              >
                <option value=''>— enter manually —</option>
                {sshConns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.host})</option>
                ))}
              </select>
            </div>
          )}

          <div className='flex gap-2'>
            <div className='flex-1'>
              <Label className='text-xs text-zinc-400'>Host</Label>
              <Input
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder='192.168.1.10'
                className='mt-1 h-8 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-violet-500/50'
              />
            </div>
            <div className='w-20'>
              <Label className='text-xs text-zinc-400'>Port</Label>
              <Input
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                placeholder='22'
                className='mt-1 h-8 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-violet-500/50'
              />
            </div>
          </div>

          <div>
            <Label className='text-xs text-zinc-400'>Username</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder='root'
              className='mt-1 h-8 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-violet-500/50'
            />
          </div>

          <div>
            <Label className='text-xs text-zinc-400'>Auth method</Label>
            <select
              value={form.authMethod}
              onChange={(e) => setForm((f) => ({ ...f, authMethod: e.target.value as 'password' | 'key' }))}
              className='mt-1 h-8 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500/50'
            >
              <option value='password'>Password</option>
              <option value='key'>Private key (PEM)</option>
            </select>
          </div>

          {form.authMethod === 'password' ? (
            <div>
              <div className='mb-1 flex items-center justify-between'>
                <Label className='text-xs text-zinc-400'>Password</Label>
                <VaultCredentialPicker
                  types={['password', 'username_password']}
                  onSelect={(s) => setForm((f) => ({ ...f, password: s }))}
                />
              </div>
              <Input
                type='password'
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && canConnect && handleConnect()}
                placeholder='••••••••'
                className='h-8 border-zinc-700 bg-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-violet-500/50'
              />
            </div>
          ) : (
            <div>
              <div className='mb-1 flex items-center justify-between'>
                <Label className='text-xs text-zinc-400'>Private key (PEM)</Label>
                <VaultCredentialPicker
                  types={['ssh_key']}
                  onSelect={(s) => setForm((f) => ({ ...f, privateKey: s }))}
                />
              </div>
              <textarea
                value={form.privateKey}
                onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))}
                placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...'}
                rows={4}
                className='w-full rounded-md border border-zinc-700 bg-zinc-800 p-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none'
              />
            </div>
          )}

          {error && (
            <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>
              {error}
            </p>
          )}

          <Button
            className='mt-1 h-8 w-full bg-violet-600 text-xs font-medium text-white hover:bg-violet-500'
            onClick={handleConnect}
            disabled={!canConnect}
          >
            {connecting ? (
              <><Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />Connecting…</>
            ) : (
              'Connect'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Metrics dashboard ─────────────────────────────────────────────────────────

function MetricsDashboard({
  host,
  port,
  username,
  auth,
  onDisconnect,
}: {
  host: string
  port: number
  username: string
  auth: SshAuth
  onDisconnect: () => void
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
            if (m) { setMetrics(m); setError(null) }
            else setError('Failed to parse metrics — command may not be supported on this OS')
          } else if (ev.type === 'error') {
            if (mountedRef.current) setError(ev.message)
          }
        },
      })
      execRef.current = sessionId
    } catch (e) {
      if (mountedRef.current) setError(String(e))
    }
  }, [host, port, username, auth])

  useEffect(() => {
    mountedRef.current = true
    runPoll()
    const id = setInterval(runPoll, 5000)
    return () => {
      mountedRef.current = false
      clearInterval(id)
      if (execRef.current) {
        sshExecStop(execRef.current).catch(() => {})
        execRef.current = null
      }
    }
  }, [runPoll])

  const memUsed = metrics ? metrics.memTotal - metrics.memAvail : 0
  const memPct = metrics ? Math.round((memUsed / metrics.memTotal) * 100) : 0
  const swapUsed = metrics ? metrics.swapTotal - metrics.swapFree : 0
  const swapPct = metrics && metrics.swapTotal > 0
    ? Math.round((swapUsed / metrics.swapTotal) * 100)
    : 0

  return (
    <div className='flex h-full flex-col bg-zinc-950 text-zinc-100'>
      {/* header */}
      <div className='flex shrink-0 items-center gap-3 border-b border-zinc-800 px-6 py-3'>
        <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10'>
          <Server className='h-4 w-4 text-violet-400' />
        </div>
        <div>
          <p className='text-sm font-semibold text-zinc-100'>{host}</p>
          <p className='text-xs text-zinc-500'>{username}@{host}:{port}</p>
        </div>
        <div className='ml-auto flex items-center gap-2'>
          {polling && (
            <span className='flex items-center gap-1 text-[10px] text-emerald-400'>
              <span className='relative flex h-2 w-2'>
                <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
                <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
              </span>
              Live · 5s
            </span>
          )}
          <Button
            variant='ghost'
            size='sm'
            className='h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200'
            onClick={() => { setPolling((p) => !p) }}
          >
            {polling ? <><RefreshCw className='mr-1 h-3 w-3' />Pause</> : <><RefreshCw className='mr-1 h-3 w-3' />Resume</>}
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 px-2 text-xs text-zinc-500 hover:text-red-400'
            onClick={onDisconnect}
          >
            <X className='mr-1 h-3 w-3' />Disconnect
          </Button>
        </div>
      </div>

      {error && (
        <div className='shrink-0 border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-xs text-red-400'>
          {error}
        </div>
      )}

      {!metrics && !error && (
        <div className='flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500'>
          <Loader2 className='h-4 w-4 animate-spin' />
          Collecting metrics…
        </div>
      )}

      {metrics && (
        <div className='min-h-0 flex-1 overflow-y-auto p-6 space-y-6'>
          {/* KPI row */}
          <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
            <KpiCard
              icon={Cpu}
              label='CPU'
              value={`${metrics.cpu}%`}
              sub='user + system'
              color='text-violet-400'
            />
            <KpiCard
              icon={MemoryStick}
              label='RAM'
              value={`${memPct}%`}
              sub={`${fmtBytes(memUsed)} / ${fmtBytes(metrics.memTotal)}`}
              color='text-blue-400'
            />
            <KpiCard
              icon={Activity}
              label='Load (1m)'
              value={metrics.load1.toFixed(2)}
              sub={`5m: ${metrics.load5.toFixed(2)} · 15m: ${metrics.load15.toFixed(2)}`}
              color='text-amber-400'
            />
            <KpiCard
              icon={Clock}
              label='Uptime'
              value={fmtUptime(metrics.uptimeSec)}
              color='text-emerald-400'
            />
          </div>

          {/* Usage bars */}
          <div className='rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-4'>
            <p className='text-xs font-semibold uppercase tracking-widest text-zinc-500'>Usage</p>
            <MiniBar pct={metrics.cpu} label='CPU' sub={`${metrics.cpu}%`} />
            <MiniBar
              pct={memPct}
              label='RAM'
              sub={`${fmtBytes(memUsed)} used / ${fmtBytes(metrics.memTotal)}`}
            />
            {metrics.swapTotal > 0 && (
              <MiniBar
                pct={swapPct}
                label='Swap'
                sub={`${fmtBytes(swapUsed)} used / ${fmtBytes(metrics.swapTotal)}`}
              />
            )}
          </div>

          {/* Disks */}
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
                  {metrics.disks.map((d) => (
                    <tr key={d.mount} className='border-b border-zinc-800/40 hover:bg-zinc-800/30'>
                      <td className='px-4 py-2 font-mono text-zinc-200'>{d.mount}</td>
                      <td className='px-4 py-2 text-zinc-400'>{fmtBytes(d.size)}</td>
                      <td className='px-4 py-2 text-zinc-400'>{fmtBytes(d.used)}</td>
                      <td className='px-4 py-2 text-zinc-400'>{fmtBytes(d.avail)}</td>
                      <td className='px-4 py-2'>
                        <div className='flex items-center gap-2'>
                          <div className='h-1.5 flex-1 rounded-full bg-zinc-800'>
                            <div
                              className={`h-1.5 rounded-full ${pctColor(d.usePct)}`}
                              style={{ width: `${Math.min(d.usePct, 100)}%` }}
                            />
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

          {/* Top processes */}
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
                  {metrics.procs.map((p) => (
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
            Last updated {metrics ? new Date(metrics.ts).toLocaleTimeString() : '—'} · polls every 5s via SSH exec
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Session { host: string; port: number; username: string; auth: SshAuth }

export function AgentsPage() {
  const [session, setSession] = useState<Session | null>(null)

  if (!session) {
    return (
      <ConnectForm
        onConnect={(host, port, username, auth) =>
          setSession({ host, port, username, auth })
        }
      />
    )
  }

  return (
    <MetricsDashboard
      {...session}
      onDisconnect={() => setSession(null)}
    />
  )
}
