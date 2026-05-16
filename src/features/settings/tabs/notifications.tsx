import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell } from 'lucide-react'

export function NotificationsTab() {
  return (
    <div className='flex flex-col gap-6 max-w-2xl'>
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>Alert Channels</CardTitle>
              <CardDescription>Configure where alerts are sent when a monitor goes down.</CardDescription>
            </div>
            <Badge variant='outline' className='text-muted-foreground'>Coming in Alert Rules</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col items-center justify-center gap-3 py-10 text-center'>
            <Bell className='text-muted-foreground h-10 w-10' />
            <p className='text-muted-foreground text-sm'>
              Alert channels (email, Discord, webhooks) are configured in{' '}
              <span className='font-medium text-foreground'>Alert Rules</span>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OS Notifications</CardTitle>
          <CardDescription>Desktop notifications for monitor state changes.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-medium'>Monitor down alerts</p>
              <p className='text-muted-foreground text-xs'>Show a notification when a monitor goes DOWN.</p>
            </div>
            <Badge className='bg-green-500/15 text-green-600 border-0'>Active</Badge>
          </div>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-medium'>Recovery alerts</p>
              <p className='text-muted-foreground text-xs'>Show a notification when a monitor comes back UP.</p>
            </div>
            <Badge className='bg-green-500/15 text-green-600 border-0'>Active</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
