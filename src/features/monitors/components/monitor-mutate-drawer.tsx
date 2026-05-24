import { useEffect, useState } from 'react'
import { isPlanPro } from '@/stores/plan-store'
import { useForm, Controller, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { type CheckSummary, type MonitorWithStatus, db } from '@/lib/db'

// ─── Protocol definitions ─────────────────────────────────────────────────────

type MonitorType = 'http' | 'port' | 'ping' | 'dns' | 'ssl' | 'cron'

interface ProtoConfig {
  label: string
  targetLabel: string
  targetPlaceholder: string
  targetHint?: string
}

const PROTO_CONFIG: Record<MonitorType, ProtoConfig> = {
  http: {
    label: 'HTTP / HTTPS',
    targetLabel: 'URL',
    targetPlaceholder: 'https://example.com',
  },
  port: {
    label: 'Port',
    targetLabel: 'Host:Port',
    targetPlaceholder: 'host:443',
    targetHint: 'TCP connection check — enter hostname and port separated by colon.',
  },
  ping: {
    label: 'Ping (ICMP)',
    targetLabel: 'Host',
    targetPlaceholder: '192.168.1.1',
  },
  dns: {
    label: 'DNS',
    targetLabel: 'Domain',
    targetPlaceholder: 'example.com',
  },
  ssl: {
    label: 'SSL Expiry',
    targetLabel: 'Domain',
    targetPlaceholder: 'example.com',
    targetHint: 'Checks TLS handshake and certificate expiry date.',
  },
  cron: {
    label: 'Cron Job / Heartbeat',
    targetLabel: 'Job name',
    targetPlaceholder: 'my-backup-job',
    targetHint: 'Unique identifier for this cron job. The heartbeat URL is shown below.',
  },
}

// ─── Form schema ──────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['http', 'port', 'ping', 'dns', 'ssl', 'cron']),
  target: z.string().min(1, 'Target is required'),
  interval_seconds: z.coerce.number().int().min(30).max(86400)
    .refine((v) => isPlanPro() || v >= 150, { message: 'Free plan minimum is 150 seconds (2.5 min). Upgrade to Pro for 30s intervals.' }),
  timeout_seconds: z.coerce.number().int().min(1).max(60),
  degraded_threshold_ms: z.coerce.number().int().min(1).optional().or(z.literal('').transform(() => undefined)),
  // HTTP-specific
  http_method: z.enum(['GET', 'HEAD', 'POST']).optional(),
  http_expected_status: z.coerce.number().int().min(100).max(599).optional(),
  http_keyword: z.string().optional(),
  http_follow_redirects: z.boolean().optional(),
  // DNS-specific
  dns_record_type: z.enum(['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS']).optional(),
  dns_expected_value: z.string().optional(),
  // SSL-specific
  ssl_warn_days: z.coerce.number().int().min(1).max(365).optional(),
  // Ping-specific
  ping_count: z.coerce.number().int().min(1).max(10).optional(),
})

type FormValues = z.infer<typeof schema>

// ─── Config serialization ─────────────────────────────────────────────────────

function buildConfig(values: FormValues): string | null {
  switch (values.type) {
    case 'http': {
      const cfg: Record<string, unknown> = {}
      if (values.http_method && values.http_method !== 'GET') cfg.method = values.http_method
      if (values.http_expected_status) cfg.expected_status = values.http_expected_status
      if (values.http_keyword?.trim()) cfg.keyword = values.http_keyword.trim()
      if (values.http_follow_redirects === false) cfg.follow_redirects = false
      return Object.keys(cfg).length > 0 ? JSON.stringify(cfg) : null
    }
    case 'dns': {
      const cfg: Record<string, unknown> = {}
      if (values.dns_record_type && values.dns_record_type !== 'A') cfg.record_type = values.dns_record_type
      if (values.dns_expected_value?.trim()) cfg.expected_value = values.dns_expected_value.trim()
      return Object.keys(cfg).length > 0 ? JSON.stringify(cfg) : null
    }
    case 'ssl':
      return values.ssl_warn_days && values.ssl_warn_days !== 30
        ? JSON.stringify({ warn_days: values.ssl_warn_days })
        : null
    case 'ping':
      return values.ping_count && values.ping_count !== 3
        ? JSON.stringify({ count: values.ping_count })
        : null
    default:
      return null
  }
}

function parseConfig(type: string, configJson: string | null): Partial<FormValues> {
  if (!configJson) return {}
  try {
    const c = JSON.parse(configJson)
    if (type === 'http') return {
      http_method: c.method ?? 'GET',
      http_expected_status: c.expected_status,
      http_keyword: c.keyword ?? '',
      http_follow_redirects: c.follow_redirects ?? true,
    }
    if (type === 'dns') return {
      dns_record_type: c.record_type ?? 'A',
      dns_expected_value: c.expected_value ?? '',
    }
    if (type === 'ssl') return { ssl_warn_days: c.warn_days ?? 30 }
    if (type === 'ping') return { ping_count: c.count ?? 3 }
  } catch { /* ignore */ }
  return {}
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function TestResultBadge({ result }: { result: CheckSummary }) {
  if (result.status === 'up') {
    return (
      <Badge className='bg-green-500/15 text-green-600 border-0'>
        UP {result.response_ms != null ? `— ${result.response_ms}ms` : ''}
      </Badge>
    )
  }
  if (result.status === 'degraded') {
    return (
      <Badge className='bg-yellow-500/15 text-yellow-600 border-0'>
        DEGRADED {result.response_ms != null ? `— ${result.response_ms}ms` : ''}
      </Badge>
    )
  }
  return (
    <Badge className='bg-red-500/15 text-red-600 border-0'>
      DOWN {result.detail ? `— ${result.detail}` : ''}
    </Badge>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: MonitorWithStatus | null
  onSubmit: (values: { name: string; type: string; target: string; interval_seconds: number; timeout_seconds: number; config: string | null; degraded_threshold_ms?: number | null }, id?: string) => Promise<void>
}

export function MonitorMutateDrawer({ open, onOpenChange, currentRow, onSubmit }: Props) {
  const isUpdate = !!currentRow
  const [testResult, setTestResult] = useState<CheckSummary | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      name: '',
      type: 'http',
      target: '',
      interval_seconds: 300,
      timeout_seconds: 10,
      http_method: 'GET',
      http_follow_redirects: true,
      dns_record_type: 'A',
      ssl_warn_days: 30,
      ping_count: 3,
    },
  })

  const selectedType = useWatch({ control: form.control, name: 'type' })
  const proto = PROTO_CONFIG[selectedType as MonitorType] ?? PROTO_CONFIG.http

  useEffect(() => {
    if (!open) return
    if (currentRow) {
      form.reset({
        name: currentRow.name,
        type: currentRow.type as MonitorType,
        target: currentRow.target,
        interval_seconds: currentRow.interval_seconds,
        timeout_seconds: currentRow.timeout_seconds,
        degraded_threshold_ms: currentRow.degraded_threshold_ms ?? undefined,
        http_method: 'GET',
        http_follow_redirects: true,
        dns_record_type: 'A',
        ssl_warn_days: 30,
        ping_count: 3,
        ...parseConfig(currentRow.type, currentRow.config),
      })
    } else {
      form.reset({
        name: '',
        type: 'http',
        target: '',
        interval_seconds: 300,
        timeout_seconds: 10,
        http_method: 'GET',
        http_follow_redirects: true,
        dns_record_type: 'A',
        ssl_warn_days: 30,
        ping_count: 3,
      })
    }
    const timer = setTimeout(() => setTestResult(null), 0)
    return () => clearTimeout(timer)
  }, [currentRow, open])

  async function handleTest() {
    const values = form.getValues()
    if (!values.target) { toast.error('Enter a target first'); return }
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await db.testMonitor(values.type, values.target, values.timeout_seconds, buildConfig(values))
      setTestResult(result)
    } catch {
      toast.error('Test failed')
    } finally {
      setIsTesting(false)
    }
  }

  async function handleSubmit(values: FormValues) {
    try {
      await onSubmit(
        {
          name: values.name,
          type: values.type,
          target: values.target,
          interval_seconds: values.interval_seconds,
          timeout_seconds: values.timeout_seconds,
          config: buildConfig(values),
          degraded_threshold_ms: values.degraded_threshold_ms ?? null,
        },
        currentRow?.id,
      )
      onOpenChange(false)
      toast.success(isUpdate ? 'Monitor updated' : 'Monitor created')
    } catch {
      toast.error('Something went wrong')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='sm:max-w-md overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{isUpdate ? 'Edit Monitor' : 'Add Monitor'}</SheetTitle>
          <SheetDescription>
            {isUpdate ? 'Update the monitor configuration.' : 'Configure a new monitor to start tracking.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className='flex flex-col gap-4 px-4 pb-6'>
          {/* Name */}
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='m-name'>Name</Label>
            <Input id='m-name' placeholder='My API' {...form.register('name')} />
            {form.formState.errors.name && (
              <p className='text-destructive text-xs'>{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Type */}
          <div className='flex flex-col gap-1.5'>
            <Label>Type</Label>
            <Controller
              control={form.control}
              name='type'
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => { field.onChange(v); setTestResult(null) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PROTO_CONFIG) as [MonitorType, ProtoConfig][]).map(([val, cfg]) => (
                      <SelectItem key={val} value={val}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Target */}
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='m-target'>{proto.targetLabel}</Label>
            <Input id='m-target' placeholder={proto.targetPlaceholder} {...form.register('target')} />
            {proto.targetHint && <p className='text-muted-foreground text-xs'>{proto.targetHint}</p>}
            {form.formState.errors.target && (
              <p className='text-destructive text-xs'>{form.formState.errors.target.message}</p>
            )}
          </div>

          {/* ── HTTP options ── */}
          {selectedType === 'http' && (
            <div className='flex flex-col gap-3 rounded-md border border-border/50 p-3'>
              <div className='flex flex-col gap-1.5'>
                <Label>Method</Label>
                <Controller
                  control={form.control}
                  name='http_method'
                  render={({ field }) => (
                    <Select value={field.value ?? 'GET'} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='GET'>GET</SelectItem>
                        <SelectItem value='HEAD'>HEAD</SelectItem>
                        <SelectItem value='POST'>POST</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='http-status'>Expected status code</Label>
                <Input
                  id='http-status'
                  type='number'
                  placeholder='200 (any 2xx if blank)'
                  min={100}
                  max={599}
                  {...form.register('http_expected_status')}
                />
                <p className='text-muted-foreground text-xs'>Leave blank to accept any 2xx response.</p>
              </div>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='http-keyword'>Keyword match</Label>
                <Input
                  id='http-keyword'
                  placeholder='Expected text in response body'
                  {...form.register('http_keyword')}
                />
                <p className='text-muted-foreground text-xs'>If set, the check fails if this string is not found in the response body.</p>
              </div>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm'>Follow redirects</p>
                </div>
                <Controller
                  control={form.control}
                  name='http_follow_redirects'
                  render={({ field }) => (
                    <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            </div>
          )}

          {/* ── DNS options ── */}
          {selectedType === 'dns' && (
            <div className='flex flex-col gap-3 rounded-md border border-border/50 p-3'>
              <div className='flex flex-col gap-1.5'>
                <Label>Record type</Label>
                <Controller
                  control={form.control}
                  name='dns_record_type'
                  render={({ field }) => (
                    <Select value={field.value ?? 'A'} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'].map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='dns-expected'>Expected value (optional)</Label>
                <Input
                  id='dns-expected'
                  placeholder='1.2.3.4'
                  {...form.register('dns_expected_value')}
                />
                <p className='text-muted-foreground text-xs'>If set, the check fails if the DNS record does not contain this value.</p>
              </div>
            </div>
          )}

          {/* ── SSL options ── */}
          {selectedType === 'ssl' && (
            <div className='flex flex-col gap-3 rounded-md border border-border/50 p-3'>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='ssl-warn'>Warn days before expiry</Label>
                <Input
                  id='ssl-warn'
                  type='number'
                  min={1}
                  max={365}
                  className='max-w-[100px]'
                  {...form.register('ssl_warn_days')}
                />
                <p className='text-muted-foreground text-xs'>Go DEGRADED this many days before the certificate expires.</p>
              </div>
            </div>
          )}

          {/* ── Ping options ── */}
          {selectedType === 'ping' && (
            <div className='flex flex-col gap-3 rounded-md border border-border/50 p-3'>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='ping-count'>Packet count</Label>
                <Input
                  id='ping-count'
                  type='number'
                  min={1}
                  max={10}
                  className='max-w-[100px]'
                  {...form.register('ping_count')}
                />
              </div>
            </div>
          )}

          {/* Interval + Timeout */}
          <div className='grid grid-cols-2 gap-3'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='m-interval'>
                Interval (s)
                {!isPlanPro() && (
                  <span className='ml-2 text-[10px] text-muted-foreground font-normal'>min 150s on Free</span>
                )}
              </Label>
              <Input
                id='m-interval'
                type='number'
                min={isPlanPro() ? 30 : 150}
                max={86400}
                {...form.register('interval_seconds')}
              />
              {form.formState.errors.interval_seconds && (
                <p className='text-destructive text-xs'>{form.formState.errors.interval_seconds.message}</p>
              )}
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='m-timeout'>Timeout (s)</Label>
              <Input id='m-timeout' type='number' min={1} max={60} {...form.register('timeout_seconds')} />
            </div>
          </div>

          {/* Degraded threshold — only for types that return response_ms */}
          {(selectedType === 'http' || selectedType === 'port' || selectedType === 'ping') && (
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='m-degraded'>Degraded above (ms) <span className='text-muted-foreground font-normal text-xs'>optional</span></Label>
              <Input
                id='m-degraded'
                type='number'
                min={1}
                placeholder='e.g. 500'
                className='max-w-[140px]'
                {...form.register('degraded_threshold_ms')}
              />
              <p className='text-muted-foreground text-xs'>If response time exceeds this, the check is marked DEGRADED instead of UP.</p>
            </div>
          )}

          {/* Cron heartbeat URL */}
          {selectedType === 'cron' && currentRow && (
            <div className='rounded-md bg-muted p-3 flex flex-col gap-1'>
              <p className='text-xs font-medium'>Heartbeat URL</p>
              <code className='text-xs text-muted-foreground break-all'>
                {`http://localhost:5758/heartbeat/${currentRow.id}`}
              </code>
              <p className='text-xs text-muted-foreground mt-1'>
                Hit this URL from your cron job. If no ping arrives within the interval, the monitor goes DOWN.
              </p>
            </div>
          )}

          {/* Test + submit */}
          {selectedType !== 'cron' && (
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleTest}
                disabled={isTesting}
              >
                {isTesting && <Loader2 className='mr-2 h-3 w-3 animate-spin' />}
                {isTesting ? 'Testing…' : 'Test connection'}
              </Button>
              {testResult && <TestResultBadge result={testResult} />}
            </div>
          )}

          <div className='flex gap-2 pt-2'>
            <SheetClose asChild>
              <Button variant='outline' className='flex-1'>Cancel</Button>
            </SheetClose>
            <Button type='submit' className='flex-1' disabled={form.formState.isSubmitting}>
              {isUpdate ? 'Save changes' : 'Add monitor'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
