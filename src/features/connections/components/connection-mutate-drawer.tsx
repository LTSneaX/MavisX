import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Container, FolderOpen, Globe, Monitor, Terminal } from 'lucide-react'
import { type Connection, type ConnectionType, type SaveConnectionInput } from '@/lib/db'

// ─── Protocol metadata ───────────────────────────────────────────────────────

const ALL_PROTOCOLS: {
  value: ConnectionType
  label: string
  icon: React.ElementType
  defaultPort: number | null
  color: string
}[] = [
  { value: 'ssh',    label: 'SSH',    icon: Terminal,   defaultPort: 22,   color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
  { value: 'sftp',   label: 'SFTP',   icon: FolderOpen, defaultPort: 22,   color: 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10' },
  { value: 'ftp',    label: 'FTP',    icon: FolderOpen, defaultPort: 21,   color: 'border-blue-500/40 text-blue-400 bg-blue-500/10' },
  { value: 'rdp',    label: 'RDP',    icon: Monitor,    defaultPort: 3389, color: 'border-violet-500/40 text-violet-400 bg-violet-500/10' },
  { value: 'vnc',    label: 'VNC',    icon: Monitor,    defaultPort: 5900, color: 'border-purple-500/40 text-purple-400 bg-purple-500/10' },
  { value: 'telnet', label: 'Telnet', icon: Terminal,   defaultPort: 23,   color: 'border-amber-500/40 text-amber-400 bg-amber-500/10' },
  { value: 'docker', label: 'Docker', icon: Container,  defaultPort: 2376, color: 'border-sky-500/40 text-sky-400 bg-sky-500/10' },
  { value: 'web',    label: 'Web',    icon: Globe,      defaultPort: null, color: 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10' },
]

// ─── Per-protocol settings props ─────────────────────────────────────────────

type ProtoSettingsProps = {
  prefix: string
  register: (name: string) => object
  setValue: (name: string, value: unknown) => void
  watch: (name: string) => unknown
}

// ─── Per-protocol settings components ────────────────────────────────────────

function SettingsSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border ${color} p-3`}>
      <p className='mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>{title} Settings</p>
      <div className='flex flex-col gap-3'>{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className='grid grid-cols-2 gap-2'>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label className='text-xs text-muted-foreground'>{label}</Label>
      {children}
    </div>
  )
}

function SshSettings({ prefix, register, setValue, watch }: ProtoSettingsProps) {
  return (
    <SettingsSection title='SSH' color='border-emerald-500/20'>
      <Row>
        <Field label='Port'>
          <Input {...register(`${prefix}.port`)} type='number' defaultValue={22} className='h-7 text-xs font-mono' />
        </Field>
        <Field label='Username'>
          <Input {...register(`${prefix}.username`)} placeholder='root' className='h-7 text-xs' />
        </Field>
      </Row>
      <Field label='Authentication'>
        <Select
          defaultValue='password'
          onValueChange={v => setValue(`${prefix}.auth`, v)}
        >
          <SelectTrigger className='h-7 text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='password' className='text-xs'>Password</SelectItem>
            <SelectItem value='key' className='text-xs'>SSH Key</SelectItem>
            <SelectItem value='agent' className='text-xs'>SSH Agent</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {watch(`${prefix}.auth`) === 'key' && (
        <Field label='Private key path'>
          <Input {...register(`${prefix}.key_path`)} placeholder='~/.ssh/id_rsa' className='h-7 text-xs font-mono' />
        </Field>
      )}
    </SettingsSection>
  )
}

function SftpSettings({ prefix, register }: Pick<ProtoSettingsProps, 'prefix' | 'register'>) {
  return (
    <SettingsSection title='SFTP' color='border-cyan-500/20'>
      <Row>
        <Field label='Port'>
          <Input {...register(`${prefix}.port`)} type='number' defaultValue={22} className='h-7 text-xs font-mono' />
        </Field>
        <Field label='Username'>
          <Input {...register(`${prefix}.username`)} placeholder='root' className='h-7 text-xs' />
        </Field>
      </Row>
    </SettingsSection>
  )
}

function FtpSettings({ prefix, register, setValue }: Omit<ProtoSettingsProps, 'watch'>) {
  return (
    <SettingsSection title='FTP' color='border-blue-500/20'>
      <Row>
        <Field label='Port'>
          <Input {...register(`${prefix}.port`)} type='number' defaultValue={21} className='h-7 text-xs font-mono' />
        </Field>
        <Field label='Username'>
          <Input {...register(`${prefix}.username`)} placeholder='anonymous' className='h-7 text-xs' />
        </Field>
      </Row>
      <div className='flex items-center justify-between'>
        <Label className='text-xs text-muted-foreground'>Passive mode</Label>
        <Switch defaultChecked onCheckedChange={v => setValue(`${prefix}.passive`, v)} />
      </div>
      <div className='flex items-center justify-between'>
        <Label className='text-xs text-muted-foreground'>Use TLS (FTPS)</Label>
        <Switch onCheckedChange={v => setValue(`${prefix}.tls`, v)} />
      </div>
    </SettingsSection>
  )
}

function RdpSettings({ prefix, register, setValue }: Omit<ProtoSettingsProps, 'watch'>) {
  return (
    <SettingsSection title='RDP' color='border-violet-500/20'>
      <Row>
        <Field label='Port'>
          <Input {...register(`${prefix}.port`)} type='number' defaultValue={3389} className='h-7 text-xs font-mono' />
        </Field>
        <Field label='Username'>
          <Input {...register(`${prefix}.username`)} placeholder='Administrator' className='h-7 text-xs' />
        </Field>
      </Row>
      <Field label='Domain'>
        <Input {...register(`${prefix}.domain`)} placeholder='WORKGROUP' className='h-7 text-xs' />
      </Field>
      <Field label='Resolution'>
        <Select defaultValue='1920x1080' onValueChange={v => setValue(`${prefix}.resolution`, v)}>
          <SelectTrigger className='h-7 text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='1920x1080' className='text-xs'>1920 × 1080</SelectItem>
            <SelectItem value='1280x720' className='text-xs'>1280 × 720</SelectItem>
            <SelectItem value='2560x1440' className='text-xs'>2560 × 1440</SelectItem>
            <SelectItem value='fit' className='text-xs'>Fit window</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </SettingsSection>
  )
}

function VncSettings({ prefix, register }: Pick<ProtoSettingsProps, 'prefix' | 'register'>) {
  return (
    <SettingsSection title='VNC' color='border-purple-500/20'>
      <Row>
        <Field label='Port'>
          <Input {...register(`${prefix}.port`)} type='number' defaultValue={5900} className='h-7 text-xs font-mono' />
        </Field>
        <Field label='Password'>
          <Input {...register(`${prefix}.password`)} type='password' placeholder='••••••••' className='h-7 text-xs' />
        </Field>
      </Row>
    </SettingsSection>
  )
}

function TelnetSettings({ prefix, register }: Pick<ProtoSettingsProps, 'prefix' | 'register'>) {
  return (
    <SettingsSection title='Telnet' color='border-amber-500/20'>
      <Row>
        <Field label='Port'>
          <Input {...register(`${prefix}.port`)} type='number' defaultValue={23} className='h-7 text-xs font-mono' />
        </Field>
        <Field label='Username'>
          <Input {...register(`${prefix}.username`)} placeholder='admin' className='h-7 text-xs' />
        </Field>
      </Row>
    </SettingsSection>
  )
}

function DockerSettings({ prefix, register, setValue }: Omit<ProtoSettingsProps, 'watch'>) {
  return (
    <SettingsSection title='Docker' color='border-sky-500/20'>
      <Row>
        <Field label='Port'>
          <Input {...register(`${prefix}.port`)} type='number' defaultValue={2376} className='h-7 text-xs font-mono' />
        </Field>
        <Field label='API version'>
          <Input {...register(`${prefix}.api_version`)} placeholder='v1.44' className='h-7 text-xs font-mono' />
        </Field>
      </Row>
      <div className='flex items-center justify-between'>
        <Label className='text-xs text-muted-foreground'>Use TLS</Label>
        <Switch onCheckedChange={v => setValue(`${prefix}.tls`, v)} />
      </div>
    </SettingsSection>
  )
}

function WebSettings({ prefix, register, setValue }: Omit<ProtoSettingsProps, 'watch'>) {
  return (
    <SettingsSection title='Web' color='border-indigo-500/20'>
      <Field label='URL'>
        <Input {...register(`${prefix}.url`)} placeholder='https://grafana.internal' className='h-7 text-xs font-mono' />
      </Field>
      <Field label='Open in'>
        <Select defaultValue='browser' onValueChange={v => setValue(`${prefix}.open_in`, v)}>
          <SelectTrigger className='h-7 text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='browser' className='text-xs'>System browser</SelectItem>
            <SelectItem value='viewer' className='text-xs'>Web Viewer panel</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </SettingsSection>
  )
}

const PROTOCOL_SETTINGS: Record<ConnectionType, React.ComponentType<ProtoSettingsProps>> = {
  ssh:    SshSettings,
  sftp:   SftpSettings,
  ftp:    FtpSettings,
  rdp:    RdpSettings,
  vnc:    VncSettings,
  telnet: TelnetSettings,
  docker: DockerSettings,
  web:    WebSettings,
}

// ─── Schema & form ────────────────────────────────────────────────────────────

const schema = z.object({
  name:       z.string().min(1, 'Name is required'),
  protocols:  z.array(z.string()).min(1, 'Select at least one protocol'),
  host:       z.string().min(1, 'Host is required'),
  group_name: z.string().optional(),
  proto:      z.record(z.string(), z.any()).optional(),
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  currentRow: Connection | null
  onSubmit: (inputs: SaveConnectionInput[]) => Promise<void>
}

export function ConnectionMutateDrawer({ open, onOpenChange, currentRow, onSubmit }: Props) {
  const isEdit = !!currentRow

  const { register, handleSubmit, watch, setValue, reset, control, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { protocols: ['ssh'], host: '', name: '', group_name: '', proto: {} },
    })

  const selectedProtocols = (useWatch({ control, name: 'protocols' }) ?? ['ssh']) as ConnectionType[]

  useEffect(() => {
    if (!open) return
    if (currentRow) {
      const cfg = currentRow.config ? JSON.parse(currentRow.config) : {}
      reset({
        name:       currentRow.name,
        protocols:  [currentRow.type],
        host:       currentRow.host ?? '',
        group_name: currentRow.group_name ?? '',
        proto:      { [currentRow.type]: { port: currentRow.port, username: currentRow.username, ...cfg } },
      })
    } else {
      reset({ name: '', protocols: ['ssh'], host: '', group_name: '', proto: { ssh: { port: 22 } } })
    }
  }, [open, currentRow, reset])

  function toggleProtocol(p: ConnectionType) {
    const cur = selectedProtocols
    if (cur.includes(p)) {
      if (cur.length === 1) return
      setValue('protocols', cur.filter(x => x !== p), { shouldValidate: true })
    } else {
      setValue('protocols', [...cur, p], { shouldValidate: true })
      const def = ALL_PROTOCOLS.find(x => x.value === p)?.defaultPort
      if (def) setValue(`proto.${p}.port` as Parameters<typeof setValue>[0], def as never)
    }
  }

  async function onValid(values: FormValues) {
    const inputs: SaveConnectionInput[] = values.protocols.map(proto => {
      const cfg = (values.proto?.[proto] ?? {}) as Record<string, unknown>
      const { port, username, ...rest } = cfg
      return {
        id:         isEdit && currentRow?.type === proto ? currentRow.id : undefined,
        name:       values.name,
        type:       proto as ConnectionType,
        host:       proto !== 'web' ? values.host : (String(cfg.url ?? '') || values.host),
        port:       port ? Number(port) : undefined,
        username:   username ? String(username) : undefined,
        config:     Object.keys(rest).length ? JSON.stringify(rest) : undefined,
        group_name: values.group_name || undefined,
      }
    })
    await onSubmit(inputs)
    onOpenChange(false)
  }

  const isWebOnly = selectedProtocols.length === 1 && selectedProtocols[0] === 'web'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col gap-0 p-0 sm:max-w-md'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle className='text-base'>{isEdit ? 'Edit Connection' : 'Add Connection'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onValid)} className='flex flex-1 flex-col overflow-y-auto'>
          <div className='flex flex-col gap-4 px-5 py-5'>

            {/* Name */}
            <div className='flex flex-col gap-1.5'>
              <Label className='text-xs'>Display name</Label>
              <Input {...register('name')} placeholder='My Server' className='h-8 text-sm' />
              {errors.name && <p className='text-xs text-destructive'>{errors.name.message}</p>}
            </div>

            {/* Protocol picker */}
            <div className='flex flex-col gap-1.5'>
              <Label className='text-xs'>Protocols</Label>
              <div className='flex flex-wrap gap-2'>
                {ALL_PROTOCOLS.map(p => {
                  const Icon = p.icon
                  const active = selectedProtocols.includes(p.value)
                  return (
                    <button
                      key={p.value}
                      type='button'
                      onClick={() => toggleProtocol(p.value)}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all ${
                        active ? p.color : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                      }`}
                    >
                      <Icon className='h-3 w-3' />
                      {p.label}
                    </button>
                  )
                })}
              </div>
              {errors.protocols && <p className='text-xs text-destructive'>{String(errors.protocols.message)}</p>}
            </div>

            {/* Shared host — hidden for web-only (web has its own URL field) */}
            {!isWebOnly && (
              <div className='flex flex-col gap-1.5'>
                <Label className='text-xs'>Host</Label>
                <Input {...register('host')} placeholder='192.168.1.10' className='h-8 text-sm font-mono' />
                {errors.host && <p className='text-xs text-destructive'>{errors.host.message}</p>}
              </div>
            )}

            {/* Per-protocol settings */}
            {selectedProtocols.map(proto => {
              const SettingsComp = PROTOCOL_SETTINGS[proto]
              return (
                <SettingsComp
                  key={proto}
                  prefix={`proto.${proto}`}
                  register={register as ProtoSettingsProps['register']}
                  setValue={setValue as ProtoSettingsProps['setValue']}
                  watch={watch}
                />
              )
            })}

            {/* Group */}
            <div className='flex flex-col gap-1.5'>
              <Label className='text-xs'>Group <span className='text-muted-foreground'>(optional)</span></Label>
              <Input {...register('group_name')} placeholder='Production' className='h-8 text-sm' />
            </div>

            <p className='text-xs text-muted-foreground'>
              Credentials are stored in the vault — you'll be prompted when connecting.
            </p>
          </div>

          <SheetFooter className='mt-auto border-t px-5 py-4'>
            <Button type='button' variant='outline' size='sm' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' size='sm' disabled={isSubmitting}>
              {isEdit ? 'Save changes' : `Add connection${selectedProtocols.length > 1 ? ` (${selectedProtocols.length})` : ''}`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
