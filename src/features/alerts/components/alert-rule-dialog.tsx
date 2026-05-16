import { useEffect } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { db, AlertRule, Monitor } from '@/lib/db'
import { useQueryClient } from '@tanstack/react-query'

// ─── Channel registry ─────────────────────────────────────────────────────────

type FieldType = 'text' | 'password' | 'url' | 'number'

interface FieldDef {
  key: string
  label: string
  placeholder?: string
  type?: FieldType
  hint?: string
}

interface ChannelDef {
  id: string
  label: string
  tier: 'free' | 'pro'
  fields: FieldDef[]
  buildConfig: (vals: Record<string, string>) => object
  parseConfig: (cfg: Record<string, string>) => Record<string, string>
}

const CHANNELS: ChannelDef[] = [
  {
    id: 'discord',
    label: 'Discord',
    tier: 'free',
    fields: [{ key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://discord.com/api/webhooks/…' }],
    buildConfig: (v) => ({ webhook_url: v.webhook_url }),
    parseConfig: (c) => ({ webhook_url: c.webhook_url ?? '' }),
  },
  {
    id: 'slack',
    label: 'Slack',
    tier: 'free',
    fields: [{ key: 'webhook_url', label: 'Incoming webhook URL', type: 'url', placeholder: 'https://hooks.slack.com/services/…' }],
    buildConfig: (v) => ({ webhook_url: v.webhook_url }),
    parseConfig: (c) => ({ webhook_url: c.webhook_url ?? '' }),
  },
  {
    id: 'teams',
    label: 'Microsoft Teams',
    tier: 'free',
    fields: [{ key: 'webhook_url', label: 'Incoming webhook URL', type: 'url', placeholder: 'https://…webhook.office.com/…' }],
    buildConfig: (v) => ({ webhook_url: v.webhook_url }),
    parseConfig: (c) => ({ webhook_url: c.webhook_url ?? '' }),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    tier: 'free',
    fields: [
      { key: 'bot_token', label: 'Bot token', type: 'password', placeholder: '123456:ABC-DEF…' },
      { key: 'chat_id', label: 'Chat ID', placeholder: '-1001234567890' },
    ],
    buildConfig: (v) => ({ bot_token: v.bot_token, chat_id: v.chat_id }),
    parseConfig: (c) => ({ bot_token: c.bot_token ?? '', chat_id: c.chat_id ?? '' }),
  },
  {
    id: 'pushover',
    label: 'Pushover',
    tier: 'free',
    fields: [
      { key: 'app_token', label: 'App token', type: 'password', placeholder: 'azGDORePK8gMaC0Q…' },
      { key: 'user_key', label: 'User key', type: 'password', placeholder: 'uQiRzpo4DXghDmr9…' },
    ],
    buildConfig: (v) => ({ app_token: v.app_token, user_key: v.user_key }),
    parseConfig: (c) => ({ app_token: c.app_token ?? '', user_key: c.user_key ?? '' }),
  },
  {
    id: 'ntfy',
    label: 'ntfy',
    tier: 'free',
    fields: [{ key: 'topic_url', label: 'Topic URL', type: 'url', placeholder: 'https://ntfy.sh/my-topic', hint: 'Self-hosted or ntfy.sh' }],
    buildConfig: (v) => ({ topic_url: v.topic_url }),
    parseConfig: (c) => ({ topic_url: c.topic_url ?? '' }),
  },
  {
    id: 'gotify',
    label: 'Gotify',
    tier: 'free',
    fields: [
      { key: 'server_url', label: 'Server URL', type: 'url', placeholder: 'https://gotify.example.com' },
      { key: 'app_token', label: 'App token', type: 'password', placeholder: 'XXXXXXXXXXXXXXXX' },
    ],
    buildConfig: (v) => ({ server_url: v.server_url, app_token: v.app_token }),
    parseConfig: (c) => ({ server_url: c.server_url ?? '', app_token: c.app_token ?? '' }),
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp (Twilio)',
    tier: 'free',
    fields: [
      { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxx' },
      { key: 'auth_token', label: 'Auth token', type: 'password' },
      { key: 'from_number', label: 'From (Twilio number)', placeholder: '+14155238886', hint: 'Without whatsapp: prefix' },
      { key: 'to_number', label: 'To (recipient)', placeholder: '+14155238886' },
    ],
    buildConfig: (v) => ({ account_sid: v.account_sid, auth_token: v.auth_token, from_number: v.from_number, to_number: v.to_number }),
    parseConfig: (c) => ({ account_sid: c.account_sid ?? '', auth_token: c.auth_token ?? '', from_number: c.from_number ?? '', to_number: c.to_number ?? '' }),
  },
  {
    id: 'sms',
    label: 'SMS (Twilio)',
    tier: 'free',
    fields: [
      { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxx' },
      { key: 'auth_token', label: 'Auth token', type: 'password' },
      { key: 'from_number', label: 'From (Twilio number)', placeholder: '+14155238886' },
      { key: 'to_number', label: 'To (recipient)', placeholder: '+14155238886' },
    ],
    buildConfig: (v) => ({ account_sid: v.account_sid, auth_token: v.auth_token, from_number: v.from_number, to_number: v.to_number }),
    parseConfig: (c) => ({ account_sid: c.account_sid ?? '', auth_token: c.auth_token ?? '', from_number: c.from_number ?? '', to_number: c.to_number ?? '' }),
  },
  {
    id: 'email',
    label: 'Email (SMTP)',
    tier: 'free',
    fields: [
      { key: 'to', label: 'Send to', placeholder: 'you@example.com' },
      { key: 'smtp_host', label: 'SMTP host', placeholder: 'smtp.gmail.com' },
      { key: 'smtp_port', label: 'Port', type: 'number', placeholder: '587' },
      { key: 'smtp_user', label: 'Username', placeholder: 'you@gmail.com' },
      { key: 'smtp_pass', label: 'Password / App password', type: 'password' },
    ],
    buildConfig: (v) => ({ to: v.to, smtp_host: v.smtp_host, smtp_port: Number(v.smtp_port), smtp_user: v.smtp_user, smtp_pass: v.smtp_pass }),
    parseConfig: (c) => ({ to: c.to ?? '', smtp_host: c.smtp_host ?? '', smtp_port: String(c.smtp_port ?? 587), smtp_user: c.smtp_user ?? '', smtp_pass: c.smtp_pass ?? '' }),
  },
  {
    id: 'webhook',
    label: 'Generic webhook',
    tier: 'free',
    fields: [{ key: 'url', label: 'Webhook URL', type: 'url', placeholder: 'https://your-service.com/hook' }],
    buildConfig: (v) => ({ url: v.url }),
    parseConfig: (c) => ({ url: c.url ?? '' }),
  },
  // ── Pro channels ───────────────────────────────────────────────────────────
  {
    id: 'pagerduty',
    label: 'PagerDuty',
    tier: 'pro',
    fields: [{ key: 'routing_key', label: 'Integration routing key', type: 'password', hint: 'Events API v2 key from your service integration' }],
    buildConfig: (v) => ({ routing_key: v.routing_key }),
    parseConfig: (c) => ({ routing_key: c.routing_key ?? '' }),
  },
  {
    id: 'opsgenie',
    label: 'OpsGenie',
    tier: 'pro',
    fields: [{ key: 'api_key', label: 'API key', type: 'password' }],
    buildConfig: (v) => ({ api_key: v.api_key }),
    parseConfig: (c) => ({ api_key: c.api_key ?? '' }),
  },
  {
    id: 'signal',
    label: 'Signal',
    tier: 'pro',
    fields: [
      { key: 'server_url', label: 'signal-cli REST API URL', type: 'url', placeholder: 'http://localhost:8080', hint: 'Self-hosted signal-cli REST API' },
      { key: 'sender', label: 'Sender number', placeholder: '+14155238886' },
      { key: 'recipient', label: 'Recipient number or group', placeholder: '+14155238886' },
    ],
    buildConfig: (v) => ({ server_url: v.server_url, sender: v.sender, recipient: v.recipient }),
    parseConfig: (c) => ({ server_url: c.server_url ?? '', sender: c.sender ?? '', recipient: c.recipient ?? '' }),
  },
  {
    id: 'matrix',
    label: 'Matrix',
    tier: 'pro',
    fields: [
      { key: 'homeserver', label: 'Homeserver URL', type: 'url', placeholder: 'https://matrix.example.com' },
      { key: 'access_token', label: 'Access token', type: 'password' },
      { key: 'room_id', label: 'Room ID', placeholder: '!roomId:example.com' },
    ],
    buildConfig: (v) => ({ homeserver: v.homeserver, access_token: v.access_token, room_id: v.room_id }),
    parseConfig: (c) => ({ homeserver: c.homeserver ?? '', access_token: c.access_token ?? '', room_id: c.room_id ?? '' }),
  },
  {
    id: 'rocketchat',
    label: 'Rocket.Chat',
    tier: 'pro',
    fields: [{ key: 'webhook_url', label: 'Incoming webhook URL', type: 'url', placeholder: 'https://rocket.example.com/hooks/…' }],
    buildConfig: (v) => ({ webhook_url: v.webhook_url }),
    parseConfig: (c) => ({ webhook_url: c.webhook_url ?? '' }),
  },
]

const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.id, c]))
const CHANNEL_IDS = CHANNELS.map((c) => c.id) as [string, ...string[]]

// ─── Form schema ──────────────────────────────────────────────────────────────

const formSchema = z.object({
  monitor_id: z.string().nullable(),
  condition: z.enum(['down', 'degraded']),
  threshold: z.coerce.number().int().min(1).max(10),
  channel: z.enum(CHANNEL_IDS),
  enabled: z.boolean(),
  cfg: z.record(z.string()),
})

type FormValues = z.infer<typeof formSchema>

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  rule?: AlertRule | null
  monitors: Monitor[]
  plan?: string
}

export function AlertRuleDialog({ open, onOpenChange, rule, monitors, plan = 'free' }: Props) {
  const qc = useQueryClient()
  const isEdit = !!rule

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      monitor_id: null,
      condition: 'down',
      threshold: 1,
      channel: 'discord',
      enabled: true,
      cfg: {},
    },
  })

  const channel = useWatch({ control: form.control, name: 'channel' })
  const channelDef = CHANNEL_MAP[channel]

  useEffect(() => {
    if (!open) return
    if (rule) {
      let cfg: Record<string, string> = {}
      try {
        const parsed = JSON.parse(rule.config)
        cfg = CHANNEL_MAP[rule.channel]?.parseConfig(parsed) ?? {}
      } catch { /* ignore */ }
      form.reset({
        monitor_id: rule.monitor_id,
        condition: rule.condition as 'down' | 'degraded',
        threshold: rule.threshold ?? 1,
        channel: rule.channel,
        enabled: rule.enabled === 1,
        cfg,
      })
    } else {
      form.reset({ monitor_id: null, condition: 'down', threshold: 1, channel: 'discord', enabled: true, cfg: {} })
    }
  }, [open, rule])

  // Clear cfg when channel changes
  useEffect(() => {
    form.setValue('cfg', {})
  }, [channel])

  async function onSubmit(values: FormValues) {
    const def = CHANNEL_MAP[values.channel]
    if (!def) {
      form.setError('root', { message: 'Unknown channel' })
      return
    }

    // Validate required fields
    for (const field of def.fields) {
      const val = values.cfg[field.key]
      if (!val || !val.trim()) {
        form.setError(`cfg.${field.key}` as never, { message: `${field.label} is required` })
        return
      }
    }

    const config = JSON.stringify(def.buildConfig(values.cfg))
    const payload = {
      monitor_id: values.monitor_id,
      condition: values.condition,
      channel: values.channel,
      config,
      enabled: values.enabled ? 1 : 0,
      threshold: values.threshold,
    }

    if (isEdit && rule) {
      await db.updateAlertRule(rule.id, payload)
    } else {
      await db.createAlertRule(payload)
    }
    await qc.invalidateQueries({ queryKey: ['alert-rules'] })
    onOpenChange(false)
  }

  const rootError = form.formState.errors.root?.message

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Alert Rule' : 'New Alert Rule'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className='flex flex-col gap-4'>
          {/* Monitor */}
          <div className='flex flex-col gap-1.5'>
            <Label>Monitor</Label>
            <Controller
              control={form.control}
              name='monitor_id'
              render={({ field }) => (
                <Select value={field.value ?? '__all__'} onValueChange={(v) => field.onChange(v === '__all__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder='All monitors' /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__all__'>All monitors</SelectItem>
                    {monitors.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Condition */}
          <div className='flex flex-col gap-1.5'>
            <Label>Condition</Label>
            <Controller
              control={form.control}
              name='condition'
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='down'>Goes DOWN</SelectItem>
                    <SelectItem value='degraded'>Goes DEGRADED</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Threshold */}
          <div className='flex flex-col gap-1.5'>
            <Label>Alert after (consecutive failures)</Label>
            <Input type='number' min={1} max={10} className='max-w-[100px]' {...form.register('threshold')} />
            <p className='text-muted-foreground text-xs'>Fire only after this many consecutive failures.</p>
          </div>

          {/* Channel */}
          <div className='flex flex-col gap-1.5'>
            <Label>Channel</Label>
            <Controller
              control={form.control}
              name='channel'
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.filter((ch) => ch.tier === 'free' || plan !== 'free').map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        <span className='flex items-center gap-2'>
                          {ch.label}
                          {ch.tier === 'pro' && (
                            <Badge variant='outline' className='text-[9px] px-1 py-0 h-4'>Pro</Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Dynamic channel config fields */}
          {channelDef && (
            <div className='flex flex-col gap-3 border border-border/50 rounded-md p-3'>
              {channelDef.fields.map((field) => {
                const fieldKey = `cfg.${field.key}` as const
                return (
                  <div key={field.key} className='flex flex-col gap-1.5'>
                    <Label htmlFor={fieldKey}>{field.label}</Label>
                    <Input
                      id={fieldKey}
                      type={field.type ?? 'text'}
                      placeholder={field.placeholder}
                      {...form.register(fieldKey as never)}
                    />
                    {field.hint && (
                      <p className='text-muted-foreground text-xs'>{field.hint}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Enabled */}
          <div className='flex items-center justify-between'>
            <Label>Enabled</Label>
            <Controller
              control={form.control}
              name='enabled'
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          {rootError && <p className='text-destructive text-sm'>{rootError}</p>}

          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' size='sm' disabled={form.formState.isSubmitting}>
              {isEdit ? 'Save changes' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
