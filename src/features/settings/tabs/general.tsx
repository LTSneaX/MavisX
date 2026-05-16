import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

export function GeneralTab() {
  const qc = useQueryClient()
  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: () => db.getWorkspace(),
  })

  const config = workspace?.config ? (() => { try { return JSON.parse(workspace.config) } catch { return {} } })() : {}

  const [workspaceName, setWorkspaceName] = useState('')
  const [defaultInterval, setDefaultInterval] = useState(300)
  const [defaultTimeout, setDefaultTimeout] = useState(10)
  const [savingName, setSavingName] = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  useEffect(() => {
    if (!workspace) return
    const timer = setTimeout(() => {
      setWorkspaceName(workspace.name)
      setDefaultInterval(config.defaultInterval ?? 300)
      setDefaultTimeout(config.defaultTimeout ?? 10)
    }, 0)
    return () => clearTimeout(timer)
  }, [workspace, config.defaultInterval, config.defaultTimeout])

  async function saveWorkspaceName() {
    setSavingName(true)
    await db.saveWorkspaceName(workspaceName.trim() || 'My Workspace')
    await qc.invalidateQueries({ queryKey: ['workspace'] })
    await qc.invalidateQueries({ queryKey: ['workspace-plan'] })
    setSavingName(false)
  }

  async function saveDefaults() {
    setSavingDefaults(true)
    await db.saveWorkspaceConfig({ defaultInterval, defaultTimeout })
    await qc.invalidateQueries({ queryKey: ['workspace'] })
    setSavingDefaults(false)
  }

  async function clearHistory() {
    await db.clearCheckHistory()
    await qc.invalidateQueries({ queryKey: ['monitors'] })
    await qc.invalidateQueries({ queryKey: ['incidents'] })
    setClearDialogOpen(false)
  }

  return (
    <div className='flex flex-col gap-6 max-w-2xl'>
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Configure your local workspace settings.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='workspace-name'>Workspace name</Label>
            <Input
              id='workspace-name'
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className='max-w-sm'
              onKeyDown={(e) => e.key === 'Enter' && saveWorkspaceName()}
            />
          </div>
          <Button size='sm' className='w-fit' onClick={saveWorkspaceName} disabled={savingName}>
            {savingName ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check Defaults</CardTitle>
          <CardDescription>Default values applied when creating new monitors.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='grid grid-cols-2 gap-4 max-w-sm'>
            <div className='flex flex-col gap-2'>
              <Label>Default interval (s)</Label>
              <Input
                type='number'
                value={defaultInterval}
                onChange={(e) => setDefaultInterval(Number(e.target.value))}
                min={30}
                max={86400}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>Default timeout (s)</Label>
              <Input
                type='number'
                value={defaultTimeout}
                onChange={(e) => setDefaultTimeout(Number(e.target.value))}
                min={1}
                max={60}
              />
            </div>
          </div>
          <Button size='sm' className='w-fit' onClick={saveDefaults} disabled={savingDefaults}>
            {savingDefaults ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card className='border-destructive/40'>
        <CardHeader>
          <CardTitle className='text-destructive'>Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for this workspace.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-medium'>Clear all check history</p>
              <p className='text-muted-foreground text-xs'>Deletes all check results and incidents. Monitors are kept.</p>
            </div>
            <Button variant='destructive' size='sm' onClick={() => setClearDialogOpen(true)}>
              Clear history
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all check history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all check results and incidents. Your monitors will be kept but their history and uptime data will be gone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={clearHistory}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Clear history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
