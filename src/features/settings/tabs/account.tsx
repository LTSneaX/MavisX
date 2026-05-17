import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/auth-store'
import { usePlanStore } from '@/stores/plan-store'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export function AccountTab() {
  const { auth } = useAuthStore()
  const plan = usePlanStore((s) => s.plan)
  const [username, setUsername] = useState(auth.username ?? '')
  const [saving, setSaving] = useState(false)

  async function saveUsername() {
    if (!username.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username: username.trim() })
        .eq('id', auth.user!.id)
      if (error) throw error
      auth.setUsername(username.trim())
      toast.success('Username updated')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unique')) {
        toast.error('That username is already taken')
      } else {
        toast.error('Failed to save username')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='flex flex-col gap-6 max-w-2xl'>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your public identity in MavisX.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='email'>Email</Label>
            <Input id='email' value={auth.user?.email ?? ''} disabled className='max-w-sm' />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='username'>Username</Label>
            <Input
              id='username'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveUsername()}
              className='max-w-sm'
              placeholder='Pick a username'
            />
          </div>
          <Button
            size='sm'
            className='w-fit'
            onClick={saveUsername}
            disabled={saving || !username.trim() || username.trim() === (auth.username ?? '')}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardDescription>Your current subscription tier.</CardDescription>
        </CardHeader>
        <CardContent className='flex items-center gap-3'>
          <Badge variant='outline' className='capitalize'>{PLAN_LABEL[plan] ?? 'Free'} plan</Badge>
          {plan === 'free' && (
            <span className='text-xs text-muted-foreground'>
              <a href='/upgrade' className='text-violet-400 hover:underline'>Upgrade</a> to unlock Pro features.
            </span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Your current authenticated session.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex items-center justify-between max-w-sm'>
            <div>
              <p className='text-sm font-medium'>Status</p>
              <p className='text-xs text-muted-foreground'>Signed in via Supabase Auth</p>
            </div>
            <Badge variant='outline' className='text-emerald-500 border-emerald-500/30'>Active</Badge>
          </div>
          <Separator />
          <Button variant='destructive' size='sm' className='w-fit' onClick={() => auth.signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
