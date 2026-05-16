import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { db } from '@/lib/db'

const APP_VERSION = '0.1.0'

export function AboutTab() {
  const qc = useQueryClient()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    setResetting(true)
    await db.clearCheckHistory()
    await qc.invalidateQueries({ queryKey: ['monitors'] })
    await qc.invalidateQueries({ queryKey: ['incidents'] })
    await qc.invalidateQueries({ queryKey: ['dashboard'] })
    setResetting(false)
    setResetOpen(false)
  }

  return (
    <div className='flex flex-col gap-6 max-w-2xl'>
      <Card>
        <CardHeader>
          <CardTitle>MavisX</CardTitle>
          <CardDescription>Infrastructure monitoring for homelabbers and small teams.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <div className='grid grid-cols-2 gap-y-2 text-sm'>
            <span className='text-muted-foreground'>Version</span>
            <span className='font-mono'>{APP_VERSION}</span>

            <span className='text-muted-foreground'>License</span>
            <span>MIT</span>

            <span className='text-muted-foreground'>Runtime</span>
            <span>Tauri v2 · Rust · React 19</span>

            <span className='text-muted-foreground'>Storage</span>
            <span>SQLite (local)</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card className='border-destructive/40'>
        <CardHeader>
          <CardTitle className='text-destructive'>Danger Zone</CardTitle>
          <CardDescription>Irreversible workspace actions.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-medium'>Clear all check history</p>
              <p className='text-muted-foreground text-xs'>
                Deletes all check results and incidents. Monitors are kept.
              </p>
            </div>
            <Button variant='destructive' size='sm' onClick={() => setResetOpen(true)}>
              Clear history
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all check history?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all check results and incidents. Your monitors and alert rules are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? 'Clearing…' : 'Clear history'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
