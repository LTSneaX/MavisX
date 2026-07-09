import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

// Env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   LEMON_SIGNING_SECRET      — from Lemon Squeezy webhook settings (must match exactly)
//   SUPABASE_URL              — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// Deploy note: this function MUST run with "Enforce JWT Verification = OFF".
// Lemon Squeezy is an unauthenticated caller; auth is the HMAC signature below,
// NOT a Supabase JWT. Verify with an unauthenticated curl after deploy.

// Variant → plan map. Any paid variant NOT listed here falls through to 'pro'
// via the `?? 'pro'` fallback below (single Pro tier is the historical default).
//
// Enterprise ($29/mo recurring) — real Lemon Squeezy variant_id, live in the LS
// dashboard. A subscription on this variant maps the owner's profile to
// 'enterprise', which is the server-side trust anchor for workspace entitlement
// (see migration 015). Any other paid variant still falls through to 'pro'.
const ENTERPRISE_VARIANT_ID = 1888046
const PLAN_MAP: Record<number, 'pro' | 'enterprise'> = {
  [ENTERPRISE_VARIANT_ID]: 'enterprise',
}

// Statuses Lemon Squeezy reports on a subscription. Deriving plan from status
// (rather than the event name) makes replays / out-of-order deliveries converge
// to the truth: whatever the subscription's current status is wins.
const ACTIVE_STATUSES = new Set(['active', 'on_trial', 'paid'])
const INACTIVE_STATUSES = new Set(['cancelled', 'expired', 'past_due', 'unpaid'])

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request) => {
  // 10 — non-POST short-circuit
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // 1 — CRITICAL: fail closed on empty/missing secret. Never HMAC over an empty key.
  const secret = Deno.env.get('LEMON_SIGNING_SECRET')
  if (!secret) {
    console.error('[lemon-webhook] LEMON_SIGNING_SECRET is not set — refusing to verify')
    return new Response('Server misconfiguration', { status: 500 })
  }

  // 3 — read the raw body ONCE and verify HMAC over the raw bytes BEFORE any parse.
  const rawBody = await req.text()
  const signature = req.headers.get('X-Signature') ?? ''

  // 2 — HIGH: length-guarded, timing-safe compare inside try/catch so a malformed
  // hex signature can never throw a RangeError and crash the handler.
  try {
    const digest = Buffer.from(
      createHmac('sha256', secret).update(rawBody).digest('hex'),
      'utf8'
    )
    const sigBuf = Buffer.from(signature, 'utf8')

    if (sigBuf.length !== digest.length || !timingSafeEqual(digest, sigBuf)) {
      // 9 — log auth failures without ever logging the secret or the body.
      console.warn('[lemon-webhook] signature verification failed — rejecting')
      return new Response('Unauthorized', { status: 401 })
    }
  } catch (err) {
    console.warn('[lemon-webhook] signature verification error — rejecting', err)
    return new Response('Unauthorized', { status: 401 })
  }

  // 3 — only now, after a verified signature, do we trust and parse the body.
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.warn('[lemon-webhook] malformed JSON body after valid signature')
    return new Response('Bad request', { status: 400 })
  }

  // 4 — event name comes from the SIGNED body, not the unsigned X-Event-Name header.
  const eventName: string = payload?.meta?.event_name ?? ''
  const status: string = payload?.data?.attributes?.status ?? ''
  const variantId: number = payload?.data?.attributes?.variant_id ?? 0
  const userEmail: string = payload?.data?.attributes?.user_email ?? ''
  const lemonCustomerId: number = payload?.data?.attributes?.customer_id ?? 0
  const lemonSubscriptionId: string = String(payload?.data?.id ?? '')

  // 5 — validate user_id from custom_data; reject anything that isn't a real UUID.
  const userId: string = payload?.meta?.custom_data?.user_id ?? ''
  if (!UUID_RE.test(userId)) {
    console.warn('[lemon-webhook] missing or malformed user_id in custom_data')
    return new Response('Invalid user_id', { status: 400 })
  }

  const paidPlan = PLAN_MAP[variantId] ?? 'pro'

  // 6 — derive the target plan from subscription status where present (idempotent,
  // replay-safe); fall back to the event-name switch when no status is provided
  // (e.g. one-shot order_created events).
  let targetPlan: 'pro' | 'enterprise' | 'free' | null = null
  if (status && ACTIVE_STATUSES.has(status)) {
    targetPlan = paidPlan
  } else if (status && INACTIVE_STATUSES.has(status)) {
    targetPlan = 'free'
  } else {
    switch (eventName) {
      case 'order_created':
      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_resumed':
      case 'subscription_unpaused':
        targetPlan = paidPlan
        break
      case 'subscription_cancelled':
      case 'subscription_expired':
      case 'subscription_paused':
        targetPlan = 'free'
        break
      default:
        targetPlan = null // unrecognized event — acknowledge and ignore
    }
  }

  // Nothing actionable — ack with 200 so Lemon Squeezy stops retrying.
  if (targetPlan === null) {
    console.log(`[lemon-webhook] ignoring event=${eventName} status=${status} user=${userId}`)
    return new Response('ok', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const profilePatch =
      targetPlan === 'free'
        ? {
            plan: 'free' as const,
            lemon_subscription_id: null,
            lemon_variant_id: null,
            updated_at: new Date().toISOString(),
          }
        : {
            plan: targetPlan,
            lemon_customer_id: String(lemonCustomerId),
            lemon_subscription_id: lemonSubscriptionId,
            lemon_variant_id: variantId,
            updated_at: new Date().toISOString(),
          }

    // 8 — request the affected rows back so we can detect a no-op update.
    const { data, error } = await supabase
      .from('profiles')
      .update(profilePatch)
      .eq('id', userId)
      .select('id')

    // 7 — on DB error, log server-side only and return a generic 500.
    if (error) {
      console.error('[lemon-webhook] profile update failed', error)
      return new Response('Internal error', { status: 500 })
    }

    // 8 — 0 rows means no such profile; warn but still 200 to stop LS retries.
    if (!data || data.length === 0) {
      console.warn(`[lemon-webhook] no profile matched user=${userId} — acking anyway`)
      return new Response('ok', { status: 200 })
    }

    // 11 — keep the app_metadata write so the next JWT refresh carries the plan.
    const { error: adminError } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { plan: targetPlan },
    })
    if (adminError) {
      console.error('[lemon-webhook] app_metadata update failed', adminError)
      return new Response('Internal error', { status: 500 })
    }

    // 12 — Enterprise grace-window maintenance on the owner's workspaces.
    // Entitlement is enforced server-side by RLS off the workspace OWNER's plan
    // (migration 015). `grace_until` is writable ONLY here (service_role) — never
    // by any authenticated policy. Both branches are idempotent and replay-safe:
    //   • TO enterprise (subscribe/resume/upgrade) → clear grace on the owner's
    //     workspaces (only the ones currently in grace) → back to ACTIVE.
    //   • AWAY from enterprise (downgrade/cancel/expire) → stamp a 14-day
    //     read-only grace window on the owner's workspaces that are not already
    //     in grace. The `grace_until IS NULL` guard means a replayed/duplicate
    //     lapse event never resets or extends an in-flight window.
    // A former-Enterprise owner is the only user who can hold workspaces (creation
    // requires enterprise), so for Pro/Free events this simply affects 0 rows.
    const GRACE_DAYS = 14
    if (targetPlan === 'enterprise') {
      const { error: graceError } = await supabase
        .from('workspaces')
        .update({ grace_until: null })
        .eq('owner_id', userId)
        .not('grace_until', 'is', null)
      if (graceError) {
        console.error('[lemon-webhook] clearing grace_until failed', graceError)
        return new Response('Internal error', { status: 500 })
      }
    } else {
      const graceUntil = new Date(
        Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000
      ).toISOString()
      const { error: graceError } = await supabase
        .from('workspaces')
        .update({ grace_until: graceUntil })
        .eq('owner_id', userId)
        .is('grace_until', null)
      if (graceError) {
        console.error('[lemon-webhook] stamping grace_until failed', graceError)
        return new Response('Internal error', { status: 500 })
      }
    }
  } catch (err) {
    // 7 — never leak internals; log detail server-side, generic message to the wire.
    console.error('[lemon-webhook] unexpected error handling webhook', err)
    return new Response('Internal error', { status: 500 })
  }

  console.log(
    `[lemon-webhook] applied plan=${targetPlan} event=${eventName} status=${status} user=${userId} (${userEmail})`
  )
  return new Response('ok', { status: 200 })
})
