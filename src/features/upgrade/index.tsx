import { Check, Zap, Shield, Server, GitBranch, Cpu, Wifi, Building2, Users } from 'lucide-react'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ENABLE_ENTERPRISE } from '@/config/features'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Build the Lemon Squeezy hosted checkout URL for the Pro variant.
 *
 * The store slug and variant UUID come from env (public values). The signed-in
 * Supabase user id is passed as `checkout[custom][user_id]` so the
 * `lemon-webhook` function can map the purchase back to the account — the key
 * MUST stay exactly `user_id` under `checkout[custom]`. Email is prefilled when
 * available. Returns null if config or the user id is missing.
 */
function buildProCheckoutUrl(userId: string, email?: string | null): string | null {
  const store = import.meta.env.VITE_LEMON_STORE as string | undefined
  const variant = import.meta.env.VITE_LEMON_PRO_VARIANT_ID as string | undefined
  if (!store || !variant || !userId) return null

  const params = new URLSearchParams()
  params.set('checkout[custom][user_id]', userId)
  if (email) params.set('checkout[email]', email)

  return `https://${store}.lemonsqueezy.com/checkout/buy/${variant}?${params.toString()}`
}

const FREE_FEATURES = [
  'Up to 5 monitors',
  '1 SSH connection',
  'Basic network tools',
  'Local status page',
  '5-minute check intervals',
]

const PRO_FEATURES = [
  'Unlimited monitors',
  'Unlimited SSH connections',
  'Unlimited Docker hosts',
  'Full agent metrics dashboard',
  'SFTP file manager & log viewer',
  '30-second check intervals',
  'Alert webhooks & email',
  'Priority support',
]

const ENTERPRISE_FEATURES = [
  'Everything in Pro',
  'Team workspaces',
  'Per-seat user management',
  'Role-based access control',
  'Shared connections & monitors',
  'Workspace audit logs',
  'SSO / SAML support',
  'Dedicated support SLA',
]

const HIGHLIGHTS = [
  { icon: Server,    label: 'Unlimited Hosts',    desc: 'Monitor every server in your homelab' },
  { icon: Cpu,       label: 'Live Agent Metrics', desc: 'CPU, memory, disk and network in real time' },
  { icon: GitBranch, label: 'Docker Management',  desc: 'Manage containers and images over SSH' },
  { icon: Wifi,      label: 'Faster Polling',     desc: 'Down to 30-second check intervals' },
  { icon: Shield,    label: 'Alert Routing',      desc: 'Webhooks, email, and custom integrations' },
  { icon: Users,     label: 'Team Workspaces',    desc: 'Invite teammates with per-seat licensing' },
]

type Tier = {
  name: string
  price: string
  sub: string
  badge?: string
  badgeColor?: string
  features: string[]
  cta: string
  ctaClass?: string
  cardClass?: string
  highlight?: boolean
  disabled?: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    sub: 'forever',
    features: FREE_FEATURES,
    cta: 'Current plan',
    disabled: true,
  },
  {
    name: 'Pro',
    price: '$9',
    sub: '/month',
    badge: 'MOST POPULAR',
    features: PRO_FEATURES,
    cta: 'Upgrade to Pro',
    ctaClass: 'bg-violet-600 hover:bg-violet-700 text-white',
    cardClass: 'border-violet-500/40 bg-violet-950/20',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '$6',
    sub: '/seat/month',
    badge: 'TEAMS',
    features: ENTERPRISE_FEATURES,
    cta: 'Contact Sales',
    ctaClass: 'border-blue-500/40 text-blue-300 hover:bg-blue-600/10',
    cardClass: 'border-blue-500/20 bg-blue-950/10',
  },
]

function TierCard({ tier, onCta }: { tier: Tier; onCta?: () => void }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-6 flex flex-col relative overflow-hidden',
        tier.cardClass
      )}
    >
      {tier.highlight && (
        <div className='absolute inset-0 bg-gradient-to-br from-violet-600/5 to-transparent pointer-events-none' />
      )}

      <div className='mb-6'>
        <div className='flex items-center gap-2 mb-2'>
          <p className={cn('text-sm font-medium', tier.highlight ? 'text-violet-400' : tier.name === 'Enterprise' ? 'text-blue-400' : 'text-muted-foreground')}>
            {tier.name}
          </p>
          {tier.badge && (
            <Badge
              className={cn(
                'text-[10px] px-1.5 py-0 border-0',
                tier.highlight
                  ? 'bg-violet-600 text-white'
                  : 'bg-blue-600/80 text-white'
              )}
            >
              {tier.badge}
            </Badge>
          )}
        </div>
        <div className='flex items-end gap-1'>
          <p className='text-3xl font-bold'>{tier.price}</p>
          <p className='text-muted-foreground mb-1 text-sm'>{tier.sub}</p>
        </div>
        {tier.name === 'Enterprise' && (
          <p className='text-xs text-muted-foreground mt-1'>Minimum 3 seats</p>
        )}
      </div>

      <ul className='space-y-3 flex-1'>
        {tier.features.map((f) => (
          <li key={f} className='flex items-start gap-2 text-sm'>
            <Check
              className={cn(
                'h-4 w-4 mt-0.5 shrink-0',
                tier.highlight
                  ? 'text-violet-400'
                  : tier.name === 'Enterprise'
                  ? 'text-blue-400'
                  : 'text-muted-foreground/60'
              )}
            />
            <span className={tier.name === 'Free' ? 'text-muted-foreground' : ''}>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={tier.name === 'Enterprise' ? 'outline' : 'default'}
        className={cn('mt-8 w-full', tier.ctaClass)}
        disabled={tier.disabled}
        onClick={onCta}
      >
        {tier.highlight && <Zap className='mr-2 h-4 w-4' />}
        {tier.name === 'Enterprise' && <Building2 className='mr-2 h-4 w-4' />}
        {tier.cta}
      </Button>

      {tier.highlight && (
        <p className='text-center text-xs text-muted-foreground mt-3'>
          Cancel anytime · Instant access
        </p>
      )}
      {tier.name === 'Enterprise' && (
        <p className='text-center text-xs text-muted-foreground mt-3'>
          Per-seat · Billed monthly or annually
        </p>
      )}
    </div>
  )
}

export function UpgradePage() {
  const user = useAuthStore((s) => s.auth.user)

  const handleProUpgrade = () => {
    if (!user?.id) {
      toast.error('Please sign in before upgrading to Pro.')
      return
    }
    const url = buildProCheckoutUrl(user.id, user.email)
    if (!url) {
      toast.error('Checkout is not configured. Missing Lemon Squeezy store settings.')
      return
    }
    shellOpen(url).catch(() => {
      toast.error('Could not open the checkout page. Please try again.')
    })
  }

  // Enterprise is hidden from purchase surfaces unless the feature flag is on.
  // All Enterprise code (plan type, route guards, webhook mapping) stays intact.
  const visibleTiers = ENABLE_ENTERPRISE
    ? TIERS
    : TIERS.filter((t) => t.name !== 'Enterprise')
  const visibleHighlights = ENABLE_ENTERPRISE
    ? HIGHLIGHTS
    : HIGHLIGHTS.filter((h) => h.label !== 'Team Workspaces')

  return (
    <div className='min-h-screen bg-background px-6 py-12'>
      {/* Header */}
      <div className='mx-auto max-w-4xl text-center mb-14'>
        <Badge className='mb-4 bg-violet-600/20 text-violet-400 border-violet-500/30 hover:bg-violet-600/20'>
          <Zap className='mr-1 h-3 w-3' />
          MavisX Plans
        </Badge>
        <h1 className='text-4xl font-bold tracking-tight mb-4'>
          Upgrade your homelab command center
        </h1>
        <p className='text-muted-foreground text-lg'>
          Solo homelabber or running a team — there's a plan for you.
        </p>
      </div>

      {/* Pricing cards */}
      <div
        className={cn(
          'mx-auto max-w-4xl grid grid-cols-1 gap-5 mb-16',
          ENABLE_ENTERPRISE ? 'md:grid-cols-3' : 'md:grid-cols-2'
        )}
      >
        {visibleTiers.map((tier) => (
          <TierCard
            key={tier.name}
            tier={tier}
            onCta={tier.name === 'Pro' ? handleProUpgrade : undefined}
          />
        ))}
      </div>

      {/* Enterprise callout */}
      {ENABLE_ENTERPRISE && (
        <div className='mx-auto max-w-4xl mb-16'>
          <div className='rounded-xl border border-blue-500/20 bg-blue-950/10 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4'>
            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/15'>
              <Building2 className='h-5 w-5 text-blue-400' />
            </div>
            <div className='flex-1'>
              <p className='font-semibold text-sm'>How Enterprise workspaces work</p>
              <p className='text-sm text-muted-foreground mt-0.5'>
                Create a workspace and invite your team. Each seat gets full Pro access scoped to that workspace — shared monitors, connections, Docker hosts, and alert rules. Billing is per active seat per month.
              </p>
            </div>
            <Button variant='outline' className='shrink-0 border-blue-500/40 text-blue-300 hover:bg-blue-600/10'>
              <Users className='mr-2 h-4 w-4' />
              Learn more
            </Button>
          </div>
        </div>
      )}

      {/* Highlights grid */}
      <div className='mx-auto max-w-4xl'>
        <h2 className='text-xl font-semibold mb-6 text-center'>
          {ENABLE_ENTERPRISE ? 'What you unlock on Pro & Enterprise' : 'What you unlock on Pro'}
        </h2>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {visibleHighlights.map(({ icon: Icon, label, desc }) => (
            <div key={label} className='rounded-lg border border-border bg-card p-4 flex gap-3'>
              <div className='mt-0.5 shrink-0 rounded-md bg-violet-600/10 p-2'>
                <Icon className='h-4 w-4 text-violet-400' />
              </div>
              <div>
                <p className='text-sm font-medium'>{label}</p>
                <p className='text-xs text-muted-foreground mt-0.5'>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
