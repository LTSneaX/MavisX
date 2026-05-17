import { useState, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { isPlanPro } from '@/stores/plan-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Activity,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Lock,
  Network,
  Search,
  Shield,
  XCircle,
  Zap,
} from 'lucide-react'
import {
  pingHost,
  portScan,
  dnsLookup,
  sslInfo,
  wakeOnLan,
  PORT_PRESETS,
  DNS_RECORD_TYPES,
  type PingResult,
  type PortResult,
  type DnsResult,
  type SslInfo,
} from '@/lib/network'
import { toast } from 'sonner'

// ── Shared helpers ─────────────────────────────────────────────────────────────

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success('Copied'))
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-border/50 bg-card px-4 pb-3 pt-3`}>
      <div className={`absolute left-0 top-0 h-full w-[3px] ${accent}`} />
      <p className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>{label}</p>
      <p className='mt-1 text-xl font-bold tabular-nums leading-none'>{value}</p>
    </div>
  )
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'ping',    label: 'Ping',           icon: Activity, pro: false },
  { id: 'ports',   label: 'Port Scan',      icon: Search,   pro: true  },
  { id: 'dns',     label: 'DNS',            icon: Globe,    pro: true  },
  { id: 'ssl',     label: 'SSL',            icon: Lock,     pro: true  },
  { id: 'wol',     label: 'Wake-on-LAN',    icon: Zap,      pro: true  },
  { id: 'headers', label: 'HTTP Headers',   icon: Network,  pro: true  },
  { id: 'subnet',  label: 'Subnet Calc',    icon: Shield,   pro: true  },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Ping tool ──────────────────────────────────────────────────────────────────

function PingTool() {
  const [host, setHost] = useState('')
  const [count, setCount] = useState('4')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PingResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!host.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await pingHost(host.trim(), Number(count) || 4, 3000)
      setResult(r)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [host, count])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-end gap-2'>
        <div className='flex-1'>
          <Label className='text-xs text-muted-foreground'>Host / IP</Label>
          <Input
            value={host}
            onChange={e => setHost(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder='8.8.8.8 or example.com'
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <div className='w-20'>
          <Label className='text-xs text-muted-foreground'>Count</Label>
          <Select value={count} onValueChange={setCount}>
            <SelectTrigger className='mt-1 h-8 text-sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['1', '4', '8', '16'].map(n => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size='sm' className='h-8' onClick={run} disabled={loading || !host}>
          {loading ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Ping'}
        </Button>
      </div>

      {error && <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>{error}</p>}

      {result && (
        <div className='flex flex-col gap-3'>
          <div className='flex items-center gap-2'>
            {result.alive
              ? <CheckCircle2 className='h-4 w-4 text-emerald-400' />
              : <XCircle className='h-4 w-4 text-red-400' />}
            <span className='text-sm font-medium'>{result.host}</span>
            <Badge className={cn('border-0 text-xs', result.alive
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-red-500/15 text-red-400'
            )}>
              {result.alive ? 'Reachable' : 'Unreachable'}
            </Badge>
          </div>

          <div className='grid grid-cols-4 gap-2'>
            <KpiCard label='Sent' value={result.sent} accent='bg-zinc-500' />
            <KpiCard label='Received' value={result.received} accent='bg-emerald-500' />
            <KpiCard label='Loss' value={`${result.loss_percent.toFixed(0)}%`} accent={result.loss_percent > 0 ? 'bg-red-500' : 'bg-emerald-500'} />
            <KpiCard label='Avg RTT' value={result.avg_ms != null ? `${result.avg_ms.toFixed(1)}ms` : '—'} accent='bg-violet-500' />
          </div>

          {result.min_ms != null && (
            <div className='grid grid-cols-3 gap-2'>
              <KpiCard label='Min RTT' value={`${result.min_ms.toFixed(1)}ms`} accent='bg-cyan-500' />
              <KpiCard label='Avg RTT' value={result.avg_ms != null ? `${result.avg_ms.toFixed(1)}ms` : '—'} accent='bg-indigo-500' />
              <KpiCard label='Max RTT' value={result.max_ms != null ? `${result.max_ms.toFixed(1)}ms` : '—'} accent='bg-amber-500' />
            </div>
          )}

          <div className='rounded-lg border border-border/50 bg-zinc-950 p-3'>
            <div className='mb-1 flex items-center justify-between'>
              <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>Raw output</span>
              <Button variant='ghost' size='sm' className='h-5 px-1.5 text-[10px]' onClick={() => copyToClipboard(result.output)}>
                <Copy className='mr-1 h-3 w-3' />Copy
              </Button>
            </div>
            <pre className='max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-300'>
              {result.output}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Port Scan tool ─────────────────────────────────────────────────────────────

function PortScanTool() {
  const [host, setHost] = useState('')
  const [preset, setPreset] = useState('Common')
  const [customPorts, setCustomPorts] = useState('')
  const [timeout, setTimeout_] = useState('500')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PortResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsePorts = useCallback((): number[] => {
    if (preset !== 'Custom') return PORT_PRESETS[preset] ?? []
    const ports: number[] = []
    for (const part of customPorts.split(',')) {
      const trimmed = part.trim()
      if (trimmed.includes('-')) {
        const [from, to] = trimmed.split('-').map(Number)
        if (!isNaN(from) && !isNaN(to) && to >= from && (to - from) <= 10000) {
          for (let p = from; p <= to; p++) ports.push(p)
        }
      } else {
        const p = Number(trimmed)
        if (!isNaN(p) && p > 0 && p <= 65535) ports.push(p)
      }
    }
    return [...new Set(ports)].slice(0, 10_000)
  }, [preset, customPorts])

  const run = useCallback(async () => {
    if (!host.trim()) return
    const ports = parsePorts()
    if (ports.length === 0) { setError('No valid ports'); return }
    setLoading(true); setError(null); setResults(null)
    try {
      const r = await portScan(host.trim(), ports, Number(timeout) || 500)
      setResults(r)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [host, parsePorts, timeout])

  const open = results?.filter(r => r.open) ?? []
  const closed = results?.filter(r => !r.open) ?? []

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-end gap-2'>
        <div className='min-w-[180px] flex-1'>
          <Label className='text-xs text-muted-foreground'>Host / IP</Label>
          <Input
            value={host}
            onChange={e => setHost(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder='192.168.1.1 or example.com'
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <div className='w-32'>
          <Label className='text-xs text-muted-foreground'>Port preset</Label>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className='mt-1 h-8 text-sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(PORT_PRESETS).map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
              <SelectItem value='Custom'>Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='w-24'>
          <Label className='text-xs text-muted-foreground'>Timeout (ms)</Label>
          <Input
            value={timeout}
            onChange={e => setTimeout_(e.target.value)}
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <Button size='sm' className='h-8' onClick={run} disabled={loading || !host}>
          {loading ? <><Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />Scanning…</> : 'Scan'}
        </Button>
      </div>

      {preset === 'Custom' && (
        <div>
          <Label className='text-xs text-muted-foreground'>Ports (comma-separated, ranges ok: 80,443,8000-8100)</Label>
          <Input
            value={customPorts}
            onChange={e => setCustomPorts(e.target.value)}
            placeholder='22,80,443,8000-8100'
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
      )}

      {error && <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>{error}</p>}

      {results && (
        <div className='flex flex-col gap-3'>
          <div className='grid grid-cols-3 gap-2'>
            <KpiCard label='Scanned' value={results.length} accent='bg-zinc-500' />
            <KpiCard label='Open' value={open.length} accent='bg-emerald-500' />
            <KpiCard label='Closed' value={closed.length} accent='bg-zinc-600' />
          </div>

          {open.length > 0 && (
            <div className='rounded-lg border border-border/50 bg-card overflow-hidden'>
              <div className='border-b border-border/50 px-3 py-2'>
                <span className='text-xs font-semibold text-emerald-400'>Open ports ({open.length})</span>
              </div>
              <div className='divide-y divide-border/30'>
                {open.map(r => (
                  <div key={r.port} className='flex items-center gap-3 px-3 py-2'>
                    <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-emerald-400' />
                    <span className='w-12 font-mono text-xs font-bold tabular-nums'>{r.port}</span>
                    <span className='text-xs text-muted-foreground'>{r.service || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {open.length === 0 && (
            <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center'>
              <Shield className='h-6 w-6 text-muted-foreground/40' />
              <p className='text-xs text-muted-foreground'>No open ports found in scanned range</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── DNS Lookup tool ────────────────────────────────────────────────────────────

function DnsTool() {
  const [host, setHost] = useState('')
  const [recordType, setRecordType] = useState('A')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DnsResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!host.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await dnsLookup(host.trim(), recordType)
      setResult(r)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [host, recordType])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-end gap-2'>
        <div className='flex-1'>
          <Label className='text-xs text-muted-foreground'>Domain</Label>
          <Input
            value={host}
            onChange={e => setHost(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder='example.com'
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <div className='w-28'>
          <Label className='text-xs text-muted-foreground'>Record type</Label>
          <Select value={recordType} onValueChange={setRecordType}>
            <SelectTrigger className='mt-1 h-8 text-sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DNS_RECORD_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size='sm' className='h-8' onClick={run} disabled={loading || !host}>
          {loading ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Lookup'}
        </Button>
      </div>

      {error && <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>{error}</p>}

      {result && (
        <div className='flex flex-col gap-3'>
          <div className='grid grid-cols-2 gap-2'>
            <KpiCard label='Records found' value={result.records.length} accent='bg-indigo-500' />
            <KpiCard label='Query time' value={`${result.query_ms}ms`} accent='bg-violet-500' />
          </div>

          {result.records.length > 0 ? (
            <div className='rounded-lg border border-border/50 bg-card overflow-hidden'>
              <div className='flex items-center justify-between border-b border-border/50 px-3 py-2'>
                <span className='text-xs font-semibold text-indigo-400'>{result.record_type} records</span>
                <Button variant='ghost' size='sm' className='h-5 px-1.5 text-[10px]'
                  onClick={() => copyToClipboard(result.records.join('\n'))}>
                  <Copy className='mr-1 h-3 w-3' />Copy all
                </Button>
              </div>
              <div className='divide-y divide-border/30'>
                {result.records.map((rec, i) => (
                  <div key={i} className='flex items-center gap-3 px-3 py-2'>
                    <Badge variant='outline' className='shrink-0 text-[9px] font-mono'>
                      {result.record_type}
                    </Badge>
                    <span className='min-w-0 truncate font-mono text-xs'>{rec}</span>
                    <Button variant='ghost' size='sm' className='ml-auto h-5 w-5 shrink-0 p-0'
                      onClick={() => copyToClipboard(rec)}>
                      <Copy className='h-3 w-3' />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center'>
              <Globe className='h-6 w-6 text-muted-foreground/40' />
              <p className='text-xs text-muted-foreground'>No {result.record_type} records found</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SSL Inspector tool ─────────────────────────────────────────────────────────

function SslTool() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('443')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SslInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!host.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await sslInfo(host.trim(), Number(port) || 443)
      setResult(r)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [host, port])

  const expiryAccent = result
    ? result.days_remaining < 0 ? 'bg-red-500'
    : result.days_remaining < 14 ? 'bg-red-500'
    : result.days_remaining < 30 ? 'bg-amber-500'
    : 'bg-emerald-500'
    : 'bg-zinc-500'

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-end gap-2'>
        <div className='flex-1'>
          <Label className='text-xs text-muted-foreground'>Domain</Label>
          <Input
            value={host}
            onChange={e => setHost(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder='example.com'
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <div className='w-20'>
          <Label className='text-xs text-muted-foreground'>Port</Label>
          <Input
            value={port}
            onChange={e => setPort(e.target.value)}
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <Button size='sm' className='h-8' onClick={run} disabled={loading || !host}>
          {loading ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Inspect'}
        </Button>
      </div>

      {error && <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>{error}</p>}

      {result && (
        <div className='flex flex-col gap-3'>
          <div className='grid grid-cols-2 gap-2'>
            <KpiCard label='Days remaining' value={result.days_remaining < 0 ? 'Expired' : result.days_remaining} accent={expiryAccent} />
            <KpiCard label='Valid until' value={result.not_after.split(' ')[0] ?? result.not_after} accent='bg-indigo-500' />
          </div>

          <div className='rounded-lg border border-border/50 bg-card overflow-hidden'>
            <div className='border-b border-border/50 px-3 py-2'>
              <span className='text-xs font-semibold'>Certificate details</span>
            </div>
            <div className='divide-y divide-border/30'>
              {[
                { label: 'Subject', value: result.subject },
                { label: 'Issuer', value: result.issuer },
                { label: 'Valid from', value: result.not_before },
                { label: 'Valid until', value: result.not_after },
                { label: 'Serial', value: result.serial },
              ].map(({ label, value }) => (
                <div key={label} className='flex items-start gap-3 px-3 py-2'>
                  <span className='w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-0.5'>{label}</span>
                  <span className='min-w-0 break-all font-mono text-xs'>{value}</span>
                  <Button variant='ghost' size='sm' className='ml-auto h-5 w-5 shrink-0 p-0'
                    onClick={() => copyToClipboard(value)}>
                    <Copy className='h-3 w-3' />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {result.san.length > 0 && (
            <div className='rounded-lg border border-border/50 bg-card overflow-hidden'>
              <div className='border-b border-border/50 px-3 py-2'>
                <span className='text-xs font-semibold'>Subject Alternative Names ({result.san.length})</span>
              </div>
              <div className='flex flex-wrap gap-1.5 p-3'>
                {result.san.map((name, i) => (
                  <Badge key={i} variant='outline' className='font-mono text-[10px]'>{name}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Wake-on-LAN tool ───────────────────────────────────────────────────────────

function WolTool() {
  const [mac, setMac] = useState('')
  const [broadcast, setBroadcast] = useState('255.255.255.255')
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    if (!mac.trim()) return
    setLoading(true)
    try {
      await wakeOnLan(mac.trim(), broadcast || undefined)
      toast.success('Magic packet sent!', {
        description: `Sent to ${mac} via ${broadcast || '255.255.255.255'}`,
      })
    } catch (e) {
      toast.error('Failed to send magic packet', { description: String(e) })
    } finally {
      setLoading(false)
    }
  }, [mac, broadcast])

  return (
    <div className='flex flex-col gap-4 max-w-md'>
      <div>
        <Label className='text-xs text-muted-foreground'>MAC Address</Label>
        <Input
          value={mac}
          onChange={e => setMac(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder='AA:BB:CC:DD:EE:FF'
          className='mt-1 h-8 font-mono text-sm'
        />
        <p className='mt-1 text-[10px] text-muted-foreground'>Accepts both : and - separators</p>
      </div>

      <div>
        <Label className='text-xs text-muted-foreground'>Broadcast address</Label>
        <Input
          value={broadcast}
          onChange={e => setBroadcast(e.target.value)}
          placeholder='255.255.255.255'
          className='mt-1 h-8 font-mono text-sm'
        />
        <p className='mt-1 text-[10px] text-muted-foreground'>
          Use subnet broadcast (e.g. 192.168.1.255) to reach same-subnet devices
        </p>
      </div>

      <Button
        size='sm'
        className='h-8 w-fit bg-amber-600 hover:bg-amber-500'
        onClick={run}
        disabled={loading || !mac}
      >
        {loading
          ? <><Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />Sending…</>
          : <><Zap className='mr-1.5 h-3.5 w-3.5' />Send magic packet</>}
      </Button>

      <div className='rounded-lg border border-border/50 bg-card px-4 py-3'>
        <div className='absolute left-0 top-0 h-full w-[3px] bg-amber-500 rounded-l-lg' />
        <p className='text-xs font-medium'>How it works</p>
        <p className='mt-1 text-[11px] text-muted-foreground leading-relaxed'>
          Sends a UDP broadcast with a magic packet (102 bytes: 6× 0xFF + target MAC × 16) to port 9.
          The target machine must have Wake-on-LAN enabled in BIOS and the network adapter must support it.
        </p>
      </div>
    </div>
  )
}

// ── HTTP Headers tool ──────────────────────────────────────────────────────────

interface HeaderResult {
  status: number
  statusText: string
  headers: [string, string][]
  durationMs: number
}

function HttpHeadersTool() {
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState('GET')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HeaderResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    const target = url.trim().startsWith('http') ? url.trim() : `http://${url.trim()}`
    if (!target) return
    setLoading(true); setError(null); setResult(null)
    const t0 = performance.now()
    try {
      const resp = await fetch(target, { method, redirect: 'follow' })
      const durationMs = Math.round(performance.now() - t0)
      const headers: [string, string][] = []
      resp.headers.forEach((value, key) => headers.push([key, value]))
      setResult({ status: resp.status, statusText: resp.statusText, headers, durationMs })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [url, method])

  const statusColor = result
    ? result.status < 300 ? 'bg-emerald-500'
    : result.status < 400 ? 'bg-amber-500'
    : 'bg-red-500'
    : 'bg-zinc-500'

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-end gap-2'>
        <div className='flex-1'>
          <Label className='text-xs text-muted-foreground'>URL</Label>
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder='http://192.168.1.1 or https://example.com'
            className='mt-1 h-8 font-mono text-sm'
          />
        </div>
        <div className='w-24'>
          <Label className='text-xs text-muted-foreground'>Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className='mt-1 h-8 text-sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'].map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size='sm' className='h-8' onClick={run} disabled={loading || !url}>
          {loading ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Send'}
        </Button>
      </div>

      {error && <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>{error}</p>}

      {result && (
        <div className='flex flex-col gap-3'>
          <div className='grid grid-cols-3 gap-2'>
            <KpiCard label='Status' value={`${result.status} ${result.statusText}`} accent={statusColor} />
            <KpiCard label='Headers' value={result.headers.length} accent='bg-indigo-500' />
            <KpiCard label='Response time' value={`${result.durationMs}ms`} accent='bg-violet-500' />
          </div>

          <div className='rounded-lg border border-border/50 bg-card overflow-hidden'>
            <div className='flex items-center justify-between border-b border-border/50 px-3 py-2'>
              <span className='text-xs font-semibold'>Response headers</span>
              <Button variant='ghost' size='sm' className='h-5 px-1.5 text-[10px]'
                onClick={() => copyToClipboard(result.headers.map(([k, v]) => `${k}: ${v}`).join('\n'))}>
                <Copy className='mr-1 h-3 w-3' />Copy all
              </Button>
            </div>
            <div className='divide-y divide-border/30 max-h-80 overflow-y-auto'>
              {result.headers.map(([key, value]) => (
                <div key={key} className='flex items-start gap-3 px-3 py-2 group'>
                  <span className='w-40 shrink-0 font-mono text-[10px] font-semibold text-indigo-400 pt-0.5 truncate'>{key}</span>
                  <span className='min-w-0 break-all font-mono text-xs text-muted-foreground flex-1'>{value}</span>
                  <Button variant='ghost' size='sm' className='ml-auto h-5 w-5 shrink-0 p-0 opacity-0 group-hover:opacity-100'
                    onClick={() => copyToClipboard(value)}>
                    <Copy className='h-3 w-3' />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subnet Calculator ──────────────────────────────────────────────────────────

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

function calcSubnet(cidr: string) {
  const [ip, prefix] = cidr.split('/')
  const prefixNum = parseInt(prefix ?? '24')
  if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) throw new Error('Invalid prefix length')
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) throw new Error('Invalid IP address')
  const ipInt = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  const mask = prefixNum === 0 ? 0 : (~0 << (32 - prefixNum)) >>> 0
  const network = (ipInt & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const totalHosts = Math.pow(2, 32 - prefixNum)
  const usableHosts = prefixNum < 31 ? Math.max(0, totalHosts - 2) : prefixNum === 31 ? 2 : 1
  return {
    network: intToIp(network),
    broadcast: prefixNum < 31 ? intToIp(broadcast) : '—',
    mask: intToIp(mask),
    firstHost: prefixNum < 31 ? intToIp(network + 1) : intToIp(network),
    lastHost: prefixNum < 31 ? intToIp(broadcast - 1) : intToIp(broadcast),
    totalHosts,
    usableHosts,
    prefix: prefixNum,
    cidr: `${intToIp(network)}/${prefixNum}`,
  }
}

function SubnetTool() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ReturnType<typeof calcSubnet> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(() => {
    setError(null); setResult(null)
    const val = input.trim()
    if (!val) return
    const cidr = val.includes('/') ? val : `${val}/24`
    try {
      setResult(calcSubnet(cidr))
    } catch (e) {
      setError(String(e))
    }
  }, [input])

  return (
    <div className='flex flex-col gap-4 max-w-lg'>
      <div className='flex items-end gap-2'>
        <div className='flex-1'>
          <Label className='text-xs text-muted-foreground'>IP / CIDR</Label>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder='192.168.1.0/24 or 10.0.0.1/16'
            className='mt-1 h-8 font-mono text-sm'
          />
          <p className='mt-1 text-[10px] text-muted-foreground'>If no prefix is given, /24 is assumed</p>
        </div>
        <Button size='sm' className='h-8' onClick={run} disabled={!input}>
          Calculate
        </Button>
      </div>

      {error && <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>{error}</p>}

      {result && (
        <div className='flex flex-col gap-3'>
          <div className='grid grid-cols-2 gap-2'>
            <KpiCard label='Total addresses' value={result.totalHosts.toLocaleString()} accent='bg-indigo-500' />
            <KpiCard label='Usable hosts' value={result.usableHosts.toLocaleString()} accent='bg-emerald-500' />
          </div>

          <div className='rounded-lg border border-border/50 bg-card overflow-hidden'>
            <div className='border-b border-border/50 px-3 py-2 flex items-center justify-between'>
              <span className='text-xs font-semibold'>Network details</span>
              <Button variant='ghost' size='sm' className='h-5 px-1.5 text-[10px]'
                onClick={() => copyToClipboard(result.cidr)}>
                <Copy className='mr-1 h-3 w-3' />Copy CIDR
              </Button>
            </div>
            <div className='divide-y divide-border/30'>
              {[
                { label: 'Network address', value: result.network },
                { label: 'Subnet mask', value: result.mask },
                { label: 'Broadcast address', value: result.broadcast },
                { label: 'First usable host', value: result.firstHost },
                { label: 'Last usable host', value: result.lastHost },
                { label: 'CIDR notation', value: result.cidr },
              ].map(({ label, value }) => (
                <div key={label} className='flex items-center gap-3 px-3 py-2 group'>
                  <span className='w-40 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>{label}</span>
                  <span className='font-mono text-xs flex-1'>{value}</span>
                  {value !== '—' && (
                    <Button variant='ghost' size='sm' className='ml-auto h-5 w-5 shrink-0 p-0 opacity-0 group-hover:opacity-100'
                      onClick={() => copyToClipboard(value)}>
                      <Copy className='h-3 w-3' />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

function ProWall() {
  return (
    <div className='flex flex-col items-center justify-center gap-4 py-20 text-center'>
      <div className='flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10'>
        <Lock className='h-5 w-5 text-violet-400' />
      </div>
      <div>
        <p className='font-semibold'>Pro feature</p>
        <p className='text-sm text-muted-foreground mt-1'>Upgrade to unlock this tool.</p>
      </div>
      <Link to='/upgrade'>
        <button className='rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition-colors'>
          Upgrade to Pro
        </button>
      </Link>
    </div>
  )
}

export function NetworkToolkit() {
  const [activeTab, setActiveTab] = useState<TabId>('ping')
  const pro = isPlanPro()

  const tools: Record<TabId, React.ReactNode> = {
    ping: <PingTool />,
    ports: pro ? <PortScanTool /> : <ProWall />,
    dns: pro ? <DnsTool /> : <ProWall />,
    ssl: pro ? <SslTool /> : <ProWall />,
    wol: pro ? <WolTool /> : <ProWall />,
    headers: pro ? <HttpHeadersTool /> : <ProWall />,
    subnet: pro ? <SubnetTool /> : <ProWall />,
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <Network className='h-4 w-4 text-muted-foreground' />
          <span className='font-semibold'>Network Toolkit</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div>
          <h2 className='text-lg font-semibold tracking-tight'>Network Toolkit</h2>
          <p className='text-xs text-muted-foreground'>Ping · Port Scanner · DNS · SSL · Wake-on-LAN · HTTP Headers · Subnet Calculator</p>
        </div>

        {/* Tool tabs */}
        <div className='flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-1'>
          {TABS.map(({ id, label, icon: Icon, pro: tabPro }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className='h-3.5 w-3.5' />
              {label}
              {tabPro && !pro && (
                <span className='rounded px-1 py-0.5 text-[8px] font-bold leading-none tracking-wide bg-violet-600/20 text-violet-400 border border-violet-500/30'>
                  PRO
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active tool */}
        <div className='flex-1'>
          {tools[activeTab]}
        </div>
      </Main>
    </>
  )
}
