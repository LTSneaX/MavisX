import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'

export function StorageTab() {
  const [appDataDir, setAppDataDir] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    invoke<string>('get_app_data_dir')
      .then(setAppDataDir)
      .catch(() => setAppDataDir(null))
  }, [])

  async function copyPath() {
    if (!appDataDir) return
    await navigator.clipboard.writeText(appDataDir + '\\mavisx.db')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className='flex flex-col gap-6 max-w-2xl'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            Backend
            <Badge variant='outline' className='text-[10px]'>SQLite</Badge>
          </CardTitle>
          <CardDescription>
            All monitoring data is stored locally in a SQLite database. No data leaves your machine.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <p className='text-sm font-medium'>Database file</p>
            <div className='bg-muted flex items-center gap-2 rounded-md px-3 py-2'>
              <code className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
                {appDataDir ? `${appDataDir}\\mavisx.db` : 'Loading…'}
              </code>
              <Button variant='ghost' size='icon' className='h-6 w-6 shrink-0' onClick={copyPath} disabled={!appDataDir}>
                {copied
                  ? <Check className='h-3.5 w-3.5 text-green-500' />
                  : <Copy className='h-3.5 w-3.5' />}
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              Copy this path to open or back up the database with any SQLite browser (e.g. DB Browser for SQLite).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional backends</CardTitle>
          <CardDescription>PostgreSQL, MySQL, and remote storage backends are on the roadmap.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-3 gap-3'>
            {['PostgreSQL', 'MySQL / MariaDB', 'Remote SQLite'].map((b) => (
              <div key={b} className='flex items-center justify-between rounded-md border border-border/50 px-3 py-2.5'>
                <span className='text-sm text-muted-foreground'>{b}</span>
                <Badge variant='outline' className='text-[9px] px-1.5'>Soon</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
