import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AlertRule, Monitor } from '@/lib/db'

export type AlertRuleRow = AlertRule & { monitor_name: string | null }

const CHANNEL_LABELS: Record<string, string> = {
  discord: 'Discord', slack: 'Slack', teams: 'Teams', telegram: 'Telegram',
  pushover: 'Pushover', ntfy: 'ntfy', gotify: 'Gotify',
  whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', webhook: 'Webhook',
  pagerduty: 'PagerDuty', opsgenie: 'OpsGenie', signal: 'Signal',
  matrix: 'Matrix', rocketchat: 'Rocket.Chat',
}

function ChannelBadge({ channel }: { channel: string }) {
  const label = CHANNEL_LABELS[channel] ?? channel
  return <Badge variant='outline' className='font-normal'>{label}</Badge>
}

function ConditionBadge({ condition }: { condition: string }) {
  if (condition === 'down') return <Badge className='bg-red-500/15 text-red-600 border-0'>DOWN</Badge>
  if (condition === 'degraded') return <Badge className='bg-yellow-400/15 text-yellow-600 border-0'>DEGRADED</Badge>
  return <Badge variant='outline'>{condition}</Badge>
}

function configSummary(rule: AlertRule): string {
  try {
    const c = JSON.parse(rule.config)
    // Prefer the most human-readable field in order
    const dest = c.to ?? c.chat_id ?? c.recipient ?? c.topic_url ?? c.server_url
      ?? c.webhook_url ?? c.url
    if (typeof dest === 'string') return dest.length > 48 ? dest.slice(0, 48) + '…' : dest
  } catch { /* ignore */ }
  return '—'
}

type Actions = {
  onEdit: (rule: AlertRule) => void
  onDelete: (rule: AlertRule) => void
}

export function buildColumns(actions: Actions): ColumnDef<AlertRuleRow>[] {
  return [
    {
      accessorKey: 'monitor_name',
      header: 'Monitor',
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.monitor_name ?? 'All monitors'}</span>
      ),
    },
    {
      accessorKey: 'condition',
      header: 'Condition',
      cell: ({ row }) => <ConditionBadge condition={row.original.condition} />,
    },
    {
      accessorKey: 'channel',
      header: 'Channel',
      cell: ({ row }) => <ChannelBadge channel={row.original.channel} />,
    },
    {
      id: 'config',
      header: 'Destination',
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm font-mono'>{configSummary(row.original)}</span>
      ),
    },
    {
      accessorKey: 'enabled',
      header: 'Status',
      cell: ({ row }) =>
        row.original.enabled === 1 ? (
          <Badge className='bg-green-500/15 text-green-600 border-0'>Active</Badge>
        ) : (
          <Badge variant='outline' className='text-muted-foreground'>Disabled</Badge>
        ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' className='h-8 w-8'>
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => actions.onEdit(row.original)}>
              <Pencil className='mr-2 h-4 w-4' />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className='text-destructive focus:text-destructive'
              onClick={() => actions.onDelete(row.original)}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
}

export type { Monitor }
