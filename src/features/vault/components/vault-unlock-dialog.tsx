import { useState } from 'react'
import { useVaultStore } from '@/stores/vault-store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onSuccess: () => void
}

export function VaultUnlockDialog({ open, onSuccess }: Props) {
  const { isSetup, unlock, setup } = useVaultStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!isSetup) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match.')
        return
      }
      setLoading(true)
      try {
        await setup(password)
        setPassword('')
        setConfirm('')
        onSuccess()
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    } else {
      setLoading(true)
      try {
        const ok = await unlock(password)
        if (ok) {
          setPassword('')
          onSuccess()
        } else {
          setError('Incorrect password.')
        }
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent className='sm:max-w-sm' onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isSetup ? 'Unlock Vault' : 'Set Up Vault'}</DialogTitle>
          <DialogDescription>
            {isSetup
              ? 'Enter your master password to access encrypted credentials.'
              : 'Create a master password to encrypt your credentials. This cannot be recovered if lost.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='vault-password'>Master password</Label>
            <Input
              id='vault-password'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete='current-password'
            />
          </div>

          {!isSetup && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='vault-confirm'>Confirm password</Label>
              <Input
                id='vault-confirm'
                type='password'
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete='new-password'
              />
            </div>
          )}

          {error && <p className='text-xs text-destructive'>{error}</p>}

          <DialogFooter>
            <Button type='submit' size='sm' disabled={loading || !password}>
              {loading ? (isSetup ? 'Unlocking…' : 'Setting up…') : isSetup ? 'Unlock' : 'Create vault'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
