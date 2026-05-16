import { useEffect, useState } from 'react'
import { vault, VAULT_ITEM_TYPE_LABELS, type VaultItemMeta, type VaultItemType } from '@/lib/vault'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  item?: VaultItemMeta | null
}

const TYPES = Object.entries(VAULT_ITEM_TYPE_LABELS) as [VaultItemType, string][]

const MULTILINE_TYPES: VaultItemType[] = ['ssh_key', 'tls_cert', 'smtp']

export function VaultItemDialog({ open, onClose, onSaved, item }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<VaultItemType>('api_token')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isEdit = !!item

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      setName(item?.name ?? '')
      setType((item?.type as VaultItemType) ?? 'api_token')
      setValue('')
      setError('')
    }, 0)
    return () => clearTimeout(timer)
  }, [open, item])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required.')
      return
    }
    if (!isEdit && !value.trim()) {
      setError('Value is required.')
      return
    }

    setLoading(true)
    try {
      if (isEdit) {
        await vault.updateItem(
          item!.id,
          trimmedName,
          type,
          value.trim() || undefined,
        )
      } else {
        await vault.createItem(trimmedName, type, value.trim())
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const isMultiline = MULTILINE_TYPES.includes(type)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit credential' : 'Add credential'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='vi-name'>Name</Label>
            <Input
              id='vi-name'
              placeholder='e.g. Team Telegram Bot'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className='flex flex-col gap-2'>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as VaultItemType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex flex-col gap-2'>
            <Label htmlFor='vi-value'>
              {isEdit ? 'New value (leave blank to keep existing)' : 'Value'}
            </Label>
            {isMultiline ? (
              <Textarea
                id='vi-value'
                placeholder={isEdit ? '(unchanged)' : 'Paste the secret here…'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={5}
                className='font-mono text-xs'
              />
            ) : (
              <Input
                id='vi-value'
                type='password'
                placeholder={isEdit ? '(unchanged)' : 'Paste the secret here…'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete='off'
              />
            )}
          </div>

          {error && <p className='text-xs text-destructive'>{error}</p>}

          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>
              Cancel
            </Button>
            <Button type='submit' size='sm' disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
