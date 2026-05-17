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
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  vaultId: string
  open: boolean
  onClose: () => void
  onSaved: () => void
  item?: VaultItemMeta | null
}

const TYPES = Object.entries(VAULT_ITEM_TYPE_LABELS) as [VaultItemType, string][]

// Types that use a monospace textarea for raw input
const MULTILINE_TYPES: VaultItemType[] = ['ssh_key', 'tls_cert']

// Types that use structured multi-field forms
const STRUCTURED_TYPES: VaultItemType[] = ['username_password', 'smtp']

type SmtpFields = { host: string; port: string; username: string; password: string }
type UpFields    = { username: string; password: string }

function serializeUP(f: UpFields) {
  return JSON.stringify({ u: f.username, p: f.password })
}
function serializeSMTP(f: SmtpFields) {
  return JSON.stringify({ host: f.host, port: f.port, u: f.username, p: f.password })
}
function parseUP(raw: string): UpFields {
  try { const j = JSON.parse(raw); return { username: j.u ?? '', password: j.p ?? '' } }
  catch { return { username: '', password: '' } }
}
function parseSMTP(raw: string): SmtpFields {
  try { const j = JSON.parse(raw); return { host: j.host ?? '', port: j.port ?? '587', username: j.u ?? '', password: j.p ?? '' } }
  catch { return { host: '', port: '587', username: '', password: '' } }
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className='relative'>
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete='off'
        className='pr-9'
      />
      <button
        type='button'
        onClick={() => setShow((s) => !s)}
        className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
        tabIndex={-1}
      >
        {show ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
      </button>
    </div>
  )
}

export function VaultItemDialog({ vaultId, open, onClose, onSaved, item }: Props) {
  const [name, setName]   = useState('')
  const [type, setType]   = useState<VaultItemType>('api_token')
  const [value, setValue] = useState('')          // for single-value types
  const [up, setUp]       = useState<UpFields>({ username: '', password: '' })
  const [smtp, setSmtp]   = useState<SmtpFields>({ host: '', port: '587', username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isEdit = !!item

  useEffect(() => {
    if (!open) return

    setName(item?.name ?? '')
    setType((item?.type as VaultItemType) ?? 'api_token')
    setValue('')
    setUp({ username: '', password: '' })
    setSmtp({ host: '', port: '587', username: '', password: '' })
    setError('')

    // Prefill structured fields from existing secret
    if (item && STRUCTURED_TYPES.includes(item.type as VaultItemType)) {
      vault.getSecret(vaultId, item.id).then((raw) => {
        if (item.type === 'username_password') setUp(parseUP(raw))
        if (item.type === 'smtp')              setSmtp(parseSMTP(raw))
      }).catch(() => {})
    }
  }, [open, item])

  function buildValue(): string {
    if (type === 'username_password') return serializeUP(up)
    if (type === 'smtp')              return serializeSMTP(smtp)
    return value.trim()
  }

  function validate(): string | null {
    if (!name.trim()) return 'Name is required.'
    if (type === 'username_password') {
      if (!isEdit && !up.username.trim()) return 'Username is required.'
      if (!isEdit && !up.password.trim()) return 'Password is required.'
    } else if (type === 'smtp') {
      if (!isEdit && !smtp.host.trim()) return 'SMTP host is required.'
      if (!isEdit && !smtp.username.trim()) return 'Username is required.'
      if (!isEdit && !smtp.password.trim()) return 'Password is required.'
    } else {
      if (!isEdit && !value.trim()) return 'Value is required.'
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setLoading(true)
    try {
      const built = buildValue()
      if (isEdit) {
        const sendValue = STRUCTURED_TYPES.includes(type) ? built : (built || undefined)
        await vault.updateItem(vaultId, item!.id, name.trim(), type, sendValue)
      } else {
        await vault.createItem(vaultId, name.trim(), type, built)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit credential' : 'Add credential'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
          {/* Name */}
          <div className='flex flex-col gap-2'>
            <Label htmlFor='vi-name'>Name</Label>
            <Input
              id='vi-name'
              placeholder='e.g. Homelab Grafana'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Type */}
          <div className='flex flex-col gap-2'>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as VaultItemType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Username & Password */}
          {type === 'username_password' && (
            <>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='vi-username'>Username</Label>
                <Input
                  id='vi-username'
                  placeholder='admin'
                  value={up.username}
                  onChange={(e) => setUp((p) => ({ ...p, username: e.target.value }))}
                  autoComplete='off'
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='vi-password'>Password</Label>
                <PasswordInput
                  value={up.password}
                  onChange={(v) => setUp((p) => ({ ...p, password: v }))}
                  placeholder={isEdit ? '(leave blank to keep existing)' : 'Enter password'}
                />
              </div>
            </>
          )}

          {/* SMTP */}
          {type === 'smtp' && (
            <>
              <div className='grid grid-cols-3 gap-2'>
                <div className='col-span-2 flex flex-col gap-2'>
                  <Label htmlFor='vi-smtp-host'>SMTP Host</Label>
                  <Input
                    id='vi-smtp-host'
                    placeholder='smtp.gmail.com'
                    value={smtp.host}
                    onChange={(e) => setSmtp((p) => ({ ...p, host: e.target.value }))}
                  />
                </div>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='vi-smtp-port'>Port</Label>
                  <Input
                    id='vi-smtp-port'
                    placeholder='587'
                    value={smtp.port}
                    onChange={(e) => setSmtp((p) => ({ ...p, port: e.target.value }))}
                  />
                </div>
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='vi-smtp-user'>Username</Label>
                <Input
                  id='vi-smtp-user'
                  placeholder='you@example.com'
                  value={smtp.username}
                  onChange={(e) => setSmtp((p) => ({ ...p, username: e.target.value }))}
                  autoComplete='off'
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label>Password / App password</Label>
                <PasswordInput
                  value={smtp.password}
                  onChange={(v) => setSmtp((p) => ({ ...p, password: v }))}
                  placeholder={isEdit ? '(leave blank to keep existing)' : 'Enter password'}
                />
              </div>
            </>
          )}

          {/* Password (single) */}
          {type === 'password' && (
            <div className='flex flex-col gap-2'>
              <Label>{isEdit ? 'New password (leave blank to keep existing)' : 'Password'}</Label>
              <PasswordInput
                value={value}
                onChange={setValue}
                placeholder={isEdit ? '(unchanged)' : 'Enter password'}
              />
            </div>
          )}

          {/* Multiline (ssh_key, tls_cert) */}
          {MULTILINE_TYPES.includes(type) && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='vi-value'>
                {isEdit ? 'New value (leave blank to keep existing)' : 'Value'}
              </Label>
              <Textarea
                id='vi-value'
                placeholder={isEdit ? '(unchanged)' : 'Paste here…'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={6}
                className='font-mono text-xs'
              />
            </div>
          )}

          {/* Single-value types (api_token, webhook_url) */}
          {!MULTILINE_TYPES.includes(type) && !STRUCTURED_TYPES.includes(type) && type !== 'password' && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='vi-value'>
                {isEdit ? 'New value (leave blank to keep existing)' : 'Value'}
              </Label>
              <Input
                id='vi-value'
                type='text'
                placeholder={isEdit ? '(unchanged)' : 'Paste the secret here…'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete='off'
                className='font-mono text-sm'
              />
            </div>
          )}

          {error && <p className='text-xs text-destructive'>{error}</p>}

          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={onClose}>Cancel</Button>
            <Button type='submit' size='sm' disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
