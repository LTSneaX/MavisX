import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/db'
import { sshExec, type SshAuth, type SshEvent } from '@/lib/ssh'
import { vault } from '@/lib/vault'
import { VaultCredentialPicker } from '@/components/vault-credential-picker'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Container, Server, Loader2, Plus, Wifi, WifiOff, RefreshCw,
  Play, Square, RotateCcw, Trash2, ScrollText, MoreHorizontal, X,
} from 'lucide-react'
import { toast } from 'sonner'

// ── SSH exec helper ───────────────────────────────────────────────────────────

function runSsh(host: string, port: number, username: string, auth: SshAuth, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '', done = false
    sshExec({
      host, port, username, auth, command,
      onOutput: (ev: SshEvent) => {
        if (ev.type === 'data') out += new TextDecoder().decode(new Uint8Array(ev.data))
        else if (ev.type === 'exit') { if (!done) { done = true; resolve(out) } }
        else if (ev.type === 'error') { if (!done) { done = true; reject(new Error(ev.message)) } }
      },
    }).catch(e => { if (!done) { done = true; reject(e) } })
  })
}

// ── Docker data types ─────────────────────────────────────────────────────────

interface ContainerInfo {
  id: string; name: string; image: string
  status: string; state: string; ports: string
}

interface ImageInfo {
  id: string; repo: string; tag: string; size: string; created: string
}

interface SshConn {
  host: string; port: number; username: string; auth: SshAuth
}

// ── Docker SSH commands ───────────────────────────────────────────────────────

const CONTAINER_FMT = `'{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}"}'`
const IMAGE_FMT = `'{"id":"{{.ID}}","repo":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}","created":"{{.CreatedAt}}"}'`

function parseJsonLines<T>(raw: string): T[] {
  const results: T[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { results.push(JSON.parse(t) as T) } catch { /* skip */ }
  }
  return results
}

async function listContainers(ssh: SshConn, all: boolean): Promise<ContainerInfo[]> {
  const raw = await runSsh(ssh.host, ssh.port, ssh.username, ssh.auth,
    `docker ps ${all ? '-a ' : ''}--format ${CONTAINER_FMT}`)
  return parseJsonLines<ContainerInfo>(raw)
}

async function listImages(ssh: SshConn): Promise<ImageInfo[]> {
  const raw = await runSsh(ssh.host, ssh.port, ssh.username, ssh.auth,
    `docker images --format ${IMAGE_FMT}`)
  return parseJsonLines<ImageInfo>(raw)
}

async function dockerCmd(ssh: SshConn, cmd: string): Promise<void> {
  await runSsh(ssh.host, ssh.port, ssh.username, ssh.auth, `docker ${cmd}`)
}

async function getLogs(ssh: SshConn, id: string): Promise<string> {
  return runSsh(ssh.host, ssh.port, ssh.username, ssh.auth, `docker logs --tail 200 --timestamps ${id} 2>&1`)
}

// ── Logs modal ────────────────────────────────────────────────────────────────

function LogsModal({ ssh, container, onClose }: {
  ssh: SshConn; container: ContainerInfo; onClose: () => void
}) {
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    getLogs(ssh, container.id)
      .then(raw => {
        if (!cancelled) {
          setLines(raw.split('\n').filter(Boolean))
          setLoading(false)
          setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
        }
      })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [ssh, container.id])

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className='max-w-4xl h-[80vh] flex flex-col gap-0 p-0'>
        <DialogHeader className='px-4 pt-4 pb-3 border-b border-border/50'>
          <div className='flex items-center justify-between'>
            <DialogTitle className='text-sm font-mono'>{container.name} — logs</DialogTitle>
            <Button variant='ghost' size='icon' className='h-7 w-7' onClick={onClose}>
              <X className='h-3.5 w-3.5' />
            </Button>
          </div>
        </DialogHeader>
        <div className='flex-1 overflow-y-auto bg-zinc-950 p-3'>
          {loading && <div className='flex items-center gap-2 text-zinc-500 text-xs'><Loader2 className='h-3 w-3 animate-spin' />Loading…</div>}
          {error && <p className='text-xs text-red-400'>{error}</p>}
          {lines.map((l, i) => (
            <div key={i} className='font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-all'>{l}</div>
          ))}
          <div ref={bottomRef} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Containers tab ────────────────────────────────────────────────────────────

function ContainersTab({ ssh }: { ssh: SshConn }) {
  const [showAll, setShowAll] = useState(true)
  const [tick, setTick] = useState(0)
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ContainerInfo | null>(null)
  const [logs, setLogs] = useState<ContainerInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listContainers(ssh, showAll)
      .then(data => { if (!cancelled) { setContainers(data); setError(null) } })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ssh, showAll, tick])

  async function act(cmd: string, label: string) {
    try {
      await dockerCmd(ssh, cmd)
      toast.success(label)
      setTimeout(() => setTick(t => t + 1), 800)
    } catch (e) { toast.error(String(e)) }
  }

  function stateColor(state: string) {
    if (state === 'running') return 'bg-emerald-500/15 text-emerald-400'
    if (state === 'exited') return 'bg-zinc-500/15 text-zinc-400'
    if (state === 'paused') return 'bg-amber-500/15 text-amber-400'
    return 'bg-zinc-500/15 text-zinc-400'
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center gap-2'>
        <Button variant='outline' size='sm' className='h-7 text-xs' onClick={() => setTick(t => t + 1)} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />Refresh
        </Button>
        <Button variant={showAll ? 'default' : 'outline'} size='sm' className='h-7 text-xs'
          onClick={() => setShowAll(a => !a)}>
          {showAll ? 'All containers' : 'Running only'}
        </Button>
      </div>

      {error && <p className='text-xs text-destructive rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2'>{error}</p>}

      {!loading && containers.length === 0 && !error && (
        <div className='flex flex-col items-center gap-2 py-16 text-center'>
          <Container className='h-8 w-8 text-muted-foreground/30' />
          <p className='text-xs text-muted-foreground'>No containers found</p>
        </div>
      )}

      {containers.length > 0 && (
        <div className='rounded-lg border border-border/50 bg-card overflow-hidden'>
          <div className='grid grid-cols-[1fr_160px_100px_40px] gap-0 px-4 py-2 border-b border-border/30 bg-muted/20'>
            <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>Container</span>
            <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>Image</span>
            <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>Status</span>
            <span />
          </div>
          <div className='divide-y divide-border/30'>
            {containers.map(c => (
              <div key={c.id} className='grid grid-cols-[1fr_160px_100px_40px] items-center gap-0 px-4 py-2.5 hover:bg-accent/30 transition-colors'>
                <div className='min-w-0'>
                  <p className='text-xs font-medium font-mono truncate'>{c.name}</p>
                  {c.ports && <p className='text-[10px] text-muted-foreground truncate'>{c.ports}</p>}
                </div>
                <p className='text-xs text-muted-foreground font-mono truncate pr-2'>{c.image}</p>
                <Badge className={`text-[10px] border-0 w-fit ${stateColor(c.state)}`}>{c.state}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='ghost' size='icon' className='h-7 w-7 ml-auto'>
                      <MoreHorizontal className='h-3.5 w-3.5' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    {c.state !== 'running' && (
                      <DropdownMenuItem onClick={() => act(`start ${c.id}`, `Started ${c.name}`)}>
                        <Play className='mr-2 h-3.5 w-3.5' />Start
                      </DropdownMenuItem>
                    )}
                    {c.state === 'running' && (
                      <DropdownMenuItem onClick={() => act(`stop ${c.id}`, `Stopped ${c.name}`)}>
                        <Square className='mr-2 h-3.5 w-3.5' />Stop
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => act(`restart ${c.id}`, `Restarted ${c.name}`)}>
                      <RotateCcw className='mr-2 h-3.5 w-3.5' />Restart
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLogs(c)}>
                      <ScrollText className='mr-2 h-3.5 w-3.5' />Logs
                    </DropdownMenuItem>
                    <DropdownMenuItem className='text-destructive focus:text-destructive' onClick={() => setRemoving(c)}>
                      <Trash2 className='mr-2 h-3.5 w-3.5' />Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={!!removing} onOpenChange={v => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{removing?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>The container will be force-removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={async () => {
                if (!removing) return
                await act(`rm -f ${removing.id}`, `Removed ${removing.name}`)
                setRemoving(null)
              }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {logs && <LogsModal ssh={ssh} container={logs} onClose={() => setLogs(null)} />}
    </div>
  )
}

// ── Images tab ────────────────────────────────────────────────────────────────

function ImagesTab({ ssh }: { ssh: SshConn }) {
  const [tick, setTick] = useState(0)
  const [images, setImages] = useState<ImageInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ImageInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listImages(ssh)
      .then(data => { if (!cancelled) { setImages(data); setError(null) } })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ssh, tick])

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center gap-2'>
        <Button variant='outline' size='sm' className='h-7 text-xs' onClick={() => setTick(t => t + 1)} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>

      {error && <p className='text-xs text-destructive rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2'>{error}</p>}

      {!loading && images.length === 0 && !error && (
        <div className='flex flex-col items-center gap-2 py-16 text-center'>
          <Container className='h-8 w-8 text-muted-foreground/30' />
          <p className='text-xs text-muted-foreground'>No images found</p>
        </div>
      )}

      {images.length > 0 && (
        <div className='rounded-lg border border-border/50 bg-card overflow-hidden'>
          <div className='grid grid-cols-[1fr_80px_120px_40px] gap-0 px-4 py-2 border-b border-border/30 bg-muted/20'>
            <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>Image</span>
            <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>Tag</span>
            <span className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>Size</span>
            <span />
          </div>
          <div className='divide-y divide-border/30'>
            {images.map((img, i) => (
              <div key={`${img.id}-${i}`} className='grid grid-cols-[1fr_80px_120px_40px] items-center gap-0 px-4 py-2.5 hover:bg-accent/30 transition-colors'>
                <p className='text-xs font-mono truncate'>{img.repo}</p>
                <Badge variant='outline' className='text-[10px] w-fit font-mono'>{img.tag}</Badge>
                <p className='text-xs text-muted-foreground'>{img.size}</p>
                <Button variant='ghost' size='icon' className='h-7 w-7 text-muted-foreground hover:text-destructive'
                  onClick={() => setRemoving(img)}>
                  <Trash2 className='h-3.5 w-3.5' />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={!!removing} onOpenChange={v => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{removing?.repo}:{removing?.tag}"?</AlertDialogTitle>
            <AlertDialogDescription>The image will be removed. Containers using it must be stopped first.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={async () => {
                if (!removing) return
                try {
                  await dockerCmd(ssh, `rmi -f ${removing.id}`)
                  toast.success(`Removed ${removing.repo}:${removing.tag}`)
                  setRemoving(null)
                  setTick(t => t + 1)
                } catch (e) { toast.error(String(e)) }
              }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Docker manager (post-connect) ─────────────────────────────────────────────

const DOCKER_TABS = ['Containers', 'Images'] as const
type DockerTab = (typeof DOCKER_TABS)[number]

function DockerHostManager({ ssh, label, onDisconnect }: {
  ssh: SshConn; label: string; onDisconnect: () => void
}) {
  const [activeTab, setActiveTab] = useState<DockerTab>('Containers')

  return (
    <div className='flex flex-col gap-4 p-6 min-h-full'>
      <div className='flex items-center gap-3'>
        <div className='flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10'>
          <Container className='h-4 w-4 text-blue-400' />
        </div>
        <div>
          <p className='text-sm font-semibold'>{label}</p>
          <p className='text-xs text-muted-foreground font-mono'>{ssh.username}@{ssh.host}:{ssh.port}</p>
        </div>
        <div className='ml-auto flex items-center gap-2'>
          <span className='flex items-center gap-1 text-[10px] text-emerald-400'>
            <span className='relative flex h-2 w-2'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
              <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
            </span>
            Connected
          </span>
          <Button variant='ghost' size='sm' className='h-7 text-xs text-muted-foreground hover:text-destructive' onClick={onDisconnect}>
            <WifiOff className='mr-1 h-3 w-3' />Disconnect
          </Button>
        </div>
      </div>

      <div className='flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-1 w-fit'>
        {DOCKER_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Containers' && <ContainersTab ssh={ssh} />}
      {activeTab === 'Images' && <ImagesTab ssh={ssh} />}
    </div>
  )
}

// ── Connection picker ─────────────────────────────────────────────────────────

interface DockerSession { label: string; ssh: SshConn }

function ConnectionPicker({ onConnect }: { onConnect: (s: DockerSession) => void }) {
  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => db.listConnections(),
  })
  const sshConns = connections.filter(c => c.type === 'ssh')

  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState({ host: '', port: '22', username: '', password: '' })
  const [connecting, setConnecting] = useState<string | null>(null)
  const [pwPrompt, setPwPrompt] = useState<{ connId: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function connectSaved(connId: string, overridePw?: string) {
    const conn = sshConns.find(c => c.id === connId)
    if (!conn) return
    setError(null)
    let pw = overridePw ?? ''
    if (!pw && conn.vault_item_id) {
      try { pw = await vault.getSecretByItemId(conn.vault_item_id) } catch { /* vault locked */ }
    }
    if (!pw && overridePw === undefined) { setPwPrompt({ connId, value: '' }); return }
    setConnecting(connId)
    const auth: SshAuth = { method: 'password', password: pw }
    try {
      await runSsh(conn.host ?? '', Number(conn.port ?? 22), conn.username ?? '', auth, 'docker --version')
      setPwPrompt(null)
      onConnect({ label: conn.name, ssh: { host: conn.host ?? '', port: Number(conn.port ?? 22), username: conn.username ?? '', auth } })
    } catch (e) {
      setError(String(e))
    } finally { setConnecting(null) }
  }

  async function connectManual() {
    setConnecting('manual')
    setError(null)
    const auth: SshAuth = { method: 'password', password: manualForm.password }
    try {
      await runSsh(manualForm.host, Number(manualForm.port) || 22, manualForm.username, auth, 'docker --version')
      onConnect({ label: `${manualForm.username}@${manualForm.host}`, ssh: { host: manualForm.host, port: Number(manualForm.port) || 22, username: manualForm.username, auth } })
    } catch (e) { setError(String(e)) }
    finally { setConnecting(null) }
  }

  return (
    <div className='flex flex-col gap-6 p-6'>
      <div>
        <h2 className='text-base font-semibold'>Connect to Docker host</h2>
        <p className='text-xs text-muted-foreground mt-0.5'>SSH into a remote machine — Docker CLI must be installed there</p>
      </div>

      {error && <p className='rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400'>{error}</p>}

      {sshConns.length > 0 && (
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {sshConns.map(conn => (
            <div key={conn.id} className='flex flex-col gap-3 rounded-lg border border-border/50 bg-card p-4 hover:border-border transition-colors'>
              <div className='flex items-center gap-3'>
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10'>
                  <Server className='h-4 w-4 text-blue-400' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-semibold truncate'>{conn.name}</p>
                  <p className='text-[11px] font-mono text-muted-foreground truncate'>
                    {conn.username ? `${conn.username}@` : ''}{conn.host}:{conn.port ?? 22}
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='outline' className='text-[10px]'>SSH</Badge>
                {conn.vault_item_id && <Badge variant='outline' className='text-[10px]'>Vault</Badge>}
              </div>

              {pwPrompt?.connId === conn.id ? (
                <div className='flex flex-col gap-2'>
                  <Label className='text-xs text-muted-foreground'>Password for {conn.username}@{conn.host}</Label>
                  <Input type='password' autoFocus placeholder='••••••••'
                    value={pwPrompt.value}
                    onChange={e => setPwPrompt(p => p ? { ...p, value: e.target.value } : p)}
                    onKeyDown={e => e.key === 'Enter' && connectSaved(conn.id, pwPrompt.value)}
                    className='h-8 text-xs' />
                  <div className='flex gap-2'>
                    <Button size='sm' className='h-7 flex-1 text-xs'
                      onClick={() => connectSaved(conn.id, pwPrompt.value)}
                      disabled={connecting === conn.id || !pwPrompt.value}>
                      {connecting === conn.id ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Connect'}
                    </Button>
                    <Button variant='ghost' size='sm' className='h-7 text-xs text-muted-foreground'
                      onClick={() => setPwPrompt(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button size='sm' className='h-7 w-full text-xs'
                  onClick={() => connectSaved(conn.id)} disabled={connecting !== null}>
                  {connecting === conn.id
                    ? <><Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />Connecting…</>
                    : <><Wifi className='mr-1.5 h-3.5 w-3.5' />Connect</>}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {!showManual ? (
        <button onClick={() => setShowManual(true)}
          className='flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit'>
          <Plus className='h-3.5 w-3.5' />Enter connection manually
        </button>
      ) : (
        <div className='rounded-lg border border-border/50 bg-card p-4 max-w-md flex flex-col gap-3'>
          <p className='text-xs font-semibold'>Manual connection</p>
          <div className='flex gap-2'>
            <div className='flex-1'>
              <Label className='text-xs text-muted-foreground'>Host</Label>
              <Input value={manualForm.host} onChange={e => setManualForm(f => ({ ...f, host: e.target.value }))}
                placeholder='192.168.1.10' className='mt-1 h-8 font-mono text-xs' />
            </div>
            <div className='w-20'>
              <Label className='text-xs text-muted-foreground'>Port</Label>
              <Input value={manualForm.port} onChange={e => setManualForm(f => ({ ...f, port: e.target.value }))}
                className='mt-1 h-8 font-mono text-xs' />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <div>
              <Label className='text-xs text-muted-foreground'>Username</Label>
              <Input value={manualForm.username} onChange={e => setManualForm(f => ({ ...f, username: e.target.value }))}
                placeholder='root' className='mt-1 h-8 text-xs' />
            </div>
            <div>
              <div className='flex items-center justify-between mb-1'>
                <Label className='text-xs text-muted-foreground'>Password</Label>
                <VaultCredentialPicker types={['password', 'username_password']}
                  onSelect={s => setManualForm(f => ({ ...f, password: s }))} />
              </div>
              <Input type='password' value={manualForm.password}
                onChange={e => setManualForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && manualForm.host && manualForm.username && connectManual()}
                placeholder='••••••••' className='h-8 text-xs' />
            </div>
          </div>
          <div className='flex gap-2'>
            <Button size='sm' className='h-7 text-xs' onClick={connectManual}
              disabled={connecting !== null || !manualForm.host || !manualForm.username}>
              {connecting === 'manual' ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : 'Connect'}
            </Button>
            <Button variant='ghost' size='sm' className='h-7 text-xs text-muted-foreground'
              onClick={() => setShowManual(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {sshConns.length === 0 && !showManual && (
        <div className='flex flex-col items-center gap-3 py-16 text-center'>
          <Container className='h-8 w-8 text-muted-foreground/30' />
          <div>
            <p className='text-sm font-medium'>No SSH connections saved</p>
            <p className='text-xs text-muted-foreground mt-1'>Add one in Connections, or connect manually above.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab system ────────────────────────────────────────────────────────────────

interface Tab { id: string; label: string; session: DockerSession | null }

let _counter = 1

export function DockerManager() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'tab-1', label: 'New host', session: null }])
  const [activeId, setActiveId] = useState('tab-1')

  function addTab() {
    _counter++
    const id = `tab-${_counter}`
    setTabs(prev => [...prev, { id, label: 'New host', session: null }])
    setActiveId(id)
  }

  function closeTab(id: string) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeId === id && next.length > 0) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  function connectTab(id: string, session: DockerSession) {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, label: session.label, session } : t))
  }

  function disconnectTab(id: string) {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, label: 'New host', session: null } : t))
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-1 me-auto overflow-x-auto'>
          {tabs.map(tab => {
            const isActive = tab.id === activeId
            return (
              <button key={tab.id} onClick={() => setActiveId(tab.id)}
                className={`flex items-center gap-1.5 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}>
                {tab.session && (
                  <span className='relative flex h-2 w-2 shrink-0'>
                    <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
                    <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
                  </span>
                )}
                <span className='max-w-[120px] truncate'>{tab.label}</span>
                {tabs.length > 1 && (
                  <X className='h-3 w-3 shrink-0 text-muted-foreground/60 hover:text-foreground'
                    onClick={e => { e.stopPropagation(); closeTab(tab.id) }} />
                )}
              </button>
            )
          })}
          <button onClick={addTab}
            className='flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0'>
            <Plus className='h-3.5 w-3.5' />
          </button>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='p-0 overflow-hidden'>
        {tabs.map(tab => (
          <div key={tab.id} className='h-full overflow-y-auto' style={{ display: tab.id === activeId ? 'block' : 'none' }}>
            {tab.session ? (
              <DockerHostManager ssh={tab.session.ssh} label={tab.session.label} onDisconnect={() => disconnectTab(tab.id)} />
            ) : (
              <ConnectionPicker onConnect={s => connectTab(tab.id, s)} />
            )}
          </div>
        ))}
      </Main>
    </>
  )
}
