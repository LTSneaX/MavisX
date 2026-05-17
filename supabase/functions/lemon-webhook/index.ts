import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Env vars (set in Supabase Dashboard → Settings → Edge Functions → Secrets):
//   LEMON_SIGNING_SECRET  — from Lemon Squeezy webhook settings
//   SUPABASE_URL          — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected

const PLAN_MAP: Record<number, 'pro' | 'enterprise'> = {
  // Fill in your Lemon Squeezy variant IDs once created:
  // 123456: 'pro',
  // 789012: 'enterprise',
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('X-Signature') ?? ''
  const secret = Deno.env.get('LEMON_SIGNING_SECRET') ?? ''

  // Verify Lemon Squeezy webhook signature
  const digest = Buffer.from(
    createHmac('sha256', secret).update(rawBody).digest('hex'),
    'utf8'
  )
  if (!timingSafeEqual(digest, Buffer.from(signature, 'utf8'))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const eventName: string = payload.meta?.event_name ?? ''
  const userId: string = payload.meta?.custom_data?.user_id ?? ''
  const variantId: number = payload.data?.attributes?.variant_id ?? 0
  const userEmail: string = payload.data?.attributes?.user_email ?? ''
  const lemonCustomerId: number = payload.data?.attributes?.customer_id ?? 0
  const lemonSubscriptionId: string = String(payload.data?.id ?? '')

  if (!userId) {
    return new Response('Missing user_id in custom_data', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  if (eventName === 'order_created' || eventName === 'subscription_created') {
    const plan = PLAN_MAP[variantId] ?? 'pro'

    const { error } = await supabase
      .from('profiles')
      .update({
        plan,
        lemon_customer_id: String(lemonCustomerId),
        lemon_subscription_id: lemonSubscriptionId,
        lemon_variant_id: variantId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) return new Response(error.message, { status: 500 })

    // Embed plan in JWT app_metadata so next token refresh picks it up
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { plan },
    })
  }

  if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
    await supabase.from('profiles').update({
      plan: 'free',
      lemon_subscription_id: null,
      lemon_variant_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', userId)

    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { plan: 'free' },
    })
  }

  console.log(`[lemon-webhook] ${eventName} for user ${userId} (${userEmail})`)
  return new Response('ok', { status: 200 })
})
