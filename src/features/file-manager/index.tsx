import { useRef, useState } from 'react'
import {
  sftpConnect,
  sftpListDir,
  sftpReadFile,
  sftpWriteFile,
  sftpDelete,
  sftpMkdir,
  sftpRename,
  sftpDisconnect,
  triggerDownload,
  formatBytes,
  type FileEntry,
} from '@/lib/sftp'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { VaultCredentialPicker } from '@/components/vault-credential-picker'
import {
  Folder,
  FileText,
  ChevronRight,
  Download,
  Upload,
  FolderPlus,
  Pencil,
  Trash2,
  Loader2,
  LogIn,
  LogOut,
} from 'lucide-react'

// ── Connect form ──────────────────────────────────────────────────────────────

interface ConnectFormState {
  host: string
  port: string
  username: string
  password: string
}

function ConnectForm({
  onConnect,
  connecting,
  error,
}: {
  onConnect: (f: ConnectFormState) => void
  connecting: boolean
  error: string | null
}) {
  const [form, setForm] = useState<ConnectFormState>({
    host: '',
    port: '22',
    username: '',
    password: '',
  })

  function set(k: keyof ConnectFormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConnect(form)
  }

  return (
    <form onSubmit={handleSubmit} className='flex flex-col gap-3'>
      <div className='grid grid-cols-[1fr_80px] gap-2'>
        <div className='flex flex-col gap-1.5'>
          <Label className='text-xs text-muted-foreground'>Host</Label>
          <Input
            value={form.host}
            onChange={set('host')}
            placeholder='192.168.1.1'
            className='h-8 text-xs font-mono'
            autoFocus
            required
          />
        </div>
        <div className='flex flex-col gap-1.5'>
          <Label className='text-xs text-muted-foreground'>Port</Label>
          <Input
            value={form.port}
            onChange={set('port')}
            type='number'
            className='h-8 text-xs font-mono'
            required
          />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-2'>
        <div className='flex flex-col gap-1.5'>
          <Label className='text-xs text-muted-foreground'>Username</Label>
          <Input
            value={form.username}
            onChange={set('username')}
            placeholder='root'
            className='h-8 text-xs'
            required
          />
        </div>
        <div className='flex flex-col gap-1.5'>
          <div className='flex items-center justify-between'>
            <Label className='text-xs text-muted-foreground'>Password</Label>
            <VaultCredentialPicker
              types={['password', 'username_password']}
              onSelect={(secret) => setForm((f) => ({ ...f, password: secret }))}
              className='border-border/60 bg-muted text-muted-foreground'
            />
          </div>
          <Input
            value={form.password}
            onChange={set('password')}
            type='password'
            placeholder='••••••••'
            className='h-8 text-xs'
            autoComplete='off'
          />
        </div>
      </div>

      {error && <p className='text-xs text-destructive'>{error}</p>}

      <Button type='submit' size='sm' disabled={connecting} className='self-start'>
        {connecting ? (
          <>
            <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' />
            Connecting…
          </>
        ) : (
          <>
            <LogIn className='mr-2 h-3.5 w-3.5' />
            Connect
          </>
        )}
      </Button>
    </form>
  )
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function Breadcrumb({
  path,
  onNavigate,
}: {
  path: string
  onNavigate: (p: string) => void
}) {
  const segments = path.split('/').filter(Boolean)
  return (
    <div className='flex items-center gap-1 text-xs font-mono text-muted-foreground overflow-x-auto'>
      <button
        className='hover:text-foreground transition-colors shrink-0'
        onClick={() => onNavigate('/')}
      >
        /
      </button>
      {segments.map((seg, i) => {
        const target = '/' + segments.slice(0, i + 1).join('/')
        return (
          <span key={target} className='flex items-center gap-1 shrink-0'>
            <ChevronRight className='h-3 w-3' />
            <button
              className='hover:text-foreground transition-colors'
              onClick={() => onNavigate(target)}
            >
              {seg}
            </button>
          </span>
        )
      })}
    </div>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({
  entry,
  selected,
  onSelect,
  onNavigate,
}: {
  entry: FileEntry
  selected: boolean
  onSelect: () => void
  onNavigate: () => void
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 cursor-pointer select-none transition-colors ${
        selected ? 'bg-accent' : 'hover:bg-accent/50'
      }`}
      onClick={onSelect}
      onDoubleClick={() => entry.is_dir && onNavigate()}
    >
      <div className='shrink-0'>
        {entry.is_dir ? (
          <Folder className='h-4 w-4 text-sky-400' />
        ) : (
          <FileText className='h-4 w-4 text-muted-foreground' />
        )}
      </div>
      <span className='flex-1 text-xs truncate font-medium'>{entry.name}</span>
      <span className='w-20 text-right text-[10px] text-muted-foreground tabular-nums shrink-0'>
        {entry.is_dir ? '—' : formatBytes(entry.size)}
      </span>
      <span className='w-36 text-right text-[10px] text-muted-foreground shrink-0'>
        {entry.modified ?? '—'}
      </span>
      <span className='w-20 text-right text-[10px] font-mono text-muted-foreground shrink-0'>
        {entry.permissions ?? '—'}
      </span>
    </div>
  )
}

// ── Main FileManager component ────────────────────────────────────────────────

export function FileManager() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selected, setSelected] = useState<FileEntry | null>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null)

  // Rename dialog
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null)
  const [renameTo, setRenameTo] = useState('')

  // Mkdir dialog
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [mkdirName, setMkdirName] = useState('')

  // Upload ref
  const uploadRef = useRef<HTMLInputElement>(null)

  async function loadDir(sid: string, path: string) {
    setLoading(true)
    setListError(null)
    setSelected(null)
    try {
      const list = await sftpListDir(sid, path)
      setEntries(list)
      setCurrentPath(path)
    } catch (e) {
      setListError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect(form: ConnectFormState) {
    setConnecting(true)
    setConnectError(null)
    try {
      const sid = await sftpConnect({
        host: form.host,
        port: Number(form.port),
        username: form.username,
        auth: { method: 'password', password: form.password },
      })
      setSessionId(sid)
      setConnected(true)
      await loadDir(sid, '/')
    } catch (e) {
      setConnectError(String(e))
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (sessionId) {
      await sftpDisconnect(sessionId).catch(() => {})
    }
    setSessionId(null)
    setConnected(false)
    setEntries([])
    setCurrentPath('/')
    setSelected(null)
  }

  function navigate(path: string) {
    if (!sessionId) return
    loadDir(sessionId, path)
  }

  function navigateUp() {
    if (currentPath === '/') return
    const p = currentPath.trim().replace(/\/$/, '')
    const idx = p.lastIndexOf('/')
    navigate(idx <= 0 ? '/' : p.slice(0, idx))
  }

  async function handleDownload() {
    if (!selected || !sessionId || selected.is_dir) return
    try {
      const bytes = await sftpReadFile(sessionId, selected.path)
      triggerDownload(bytes, selected.name)
    } catch (e) {
      setListError(String(e))
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !sessionId) return
    try {
      const buf = await file.arrayBuffer()
      const data = Array.from(new Uint8Array(buf))
      const remotePath =
        currentPath.endsWith('/') ? `${currentPath}${file.name}` : `${currentPath}/${file.name}`
      await sftpWriteFile(sessionId, remotePath, data)
      await loadDir(sessionId, currentPath)
    } catch (e) {
      setListError(String(e))
    } finally {
      // reset file input so same file can be uploaded again
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !sessionId) return
    try {
      await sftpDelete(sessionId, deleteTarget.path, deleteTarget.is_dir)
      setDeleteTarget(null)
      setSelected(null)
      await loadDir(sessionId, currentPath)
    } catch (e) {
      setListError(String(e))
    }
  }

  async function handleRename() {
    if (!renameTarget || !sessionId || !renameTo.trim()) return
    const dir = renameTarget.path.replace(/\/[^/]+$/, '') || '/'
    const newPath = dir.endsWith('/') ? `${dir}${renameTo.trim()}` : `${dir}/${renameTo.trim()}`
    try {
      await sftpRename(sessionId, renameTarget.path, newPath)
      setRenameTarget(null)
      setRenameTo('')
      await loadDir(sessionId, currentPath)
    } catch (e) {
      setListError(String(e))
    }
  }

  async function handleMkdir() {
    if (!sessionId || !mkdirName.trim()) return
    const newPath =
      currentPath.endsWith('/') ? `${currentPath}${mkdirName.trim()}` : `${currentPath}/${mkdirName.trim()}`
    try {
      await sftpMkdir(sessionId, newPath)
      setMkdirOpen(false)
      setMkdirName('')
      await loadDir(sessionId, currentPath)
    } catch (e) {
      setListError(String(e))
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-3'>
          <div>
            <h1 className='text-lg font-semibold tracking-tight'>File Manager</h1>
            <p className='text-xs text-muted-foreground'>SFTP remote file browser</p>
          </div>
          {connected && (
            <Badge variant='outline' className='text-emerald-500 border-emerald-500/30 text-[10px]'>
              Connected
            </Badge>
          )}
        </div>
        {connected && (
          <Button variant='ghost' size='sm' onClick={handleDisconnect}>
            <LogOut className='mr-1.5 h-3.5 w-3.5' />
            Disconnect
          </Button>
        )}
      </Header>

      <Main className='flex flex-col gap-3 px-4 py-4'>
        {/* Connection panel */}
        {!connected && (
          <div className='rounded-lg border border-border/50 bg-card p-4 max-w-xl'>
            <p className='text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3'>
              SFTP Connection
            </p>
            <ConnectForm
              onConnect={handleConnect}
              connecting={connecting}
              error={connectError}
            />
          </div>
        )}

        {/* File browser */}
        {connected && (
          <div className='flex flex-col gap-0 rounded-lg border border-border/50 bg-card flex-1 min-h-0 overflow-hidden'>
            {/* Toolbar */}
            <div className='flex items-center gap-2 px-4 py-2 border-b border-border/50'>
              <Breadcrumb path={currentPath} onNavigate={navigate} />
              <div className='flex-1' />
              <Button
                variant='ghost'
                size='sm'
                className='h-7 text-xs'
                onClick={() => uploadRef.current?.click()}
              >
                <Upload className='mr-1.5 h-3.5 w-3.5' />
                Upload
              </Button>
              <input
                ref={uploadRef}
                type='file'
                className='hidden'
                onChange={handleUpload}
              />
              <Button
                variant='ghost'
                size='sm'
                className='h-7 text-xs'
                onClick={() => { setMkdirName(''); setMkdirOpen(true) }}
              >
                <FolderPlus className='mr-1.5 h-3.5 w-3.5' />
                New folder
              </Button>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 text-xs'
                disabled={!selected || selected.is_dir}
                onClick={handleDownload}
              >
                <Download className='mr-1.5 h-3.5 w-3.5' />
                Download
              </Button>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 text-xs'
                disabled={!selected}
                onClick={() => {
                  if (!selected) return
                  setRenameTo(selected.name)
                  setRenameTarget(selected)
                }}
              >
                <Pencil className='mr-1.5 h-3.5 w-3.5' />
                Rename
              </Button>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 text-xs text-destructive hover:text-destructive'
                disabled={!selected}
                onClick={() => selected && setDeleteTarget(selected)}
              >
                <Trash2 className='mr-1.5 h-3.5 w-3.5' />
                Delete
              </Button>
            </div>

            {/* Column headers */}
            <div className='flex items-center gap-3 px-4 py-1.5 border-b border-border/30 bg-muted/30'>
              <div className='w-4 shrink-0' />
              <span className='flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'>
                Name
              </span>
              <span className='w-20 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0'>
                Size
              </span>
              <span className='w-36 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0'>
                Modified
              </span>
              <span className='w-20 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0'>
                Perms
              </span>
            </div>

            {/* File list */}
            <div className='flex-1 overflow-y-auto'>
              {loading && (
                <div className='flex items-center justify-center py-16'>
                  <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
                </div>
              )}

              {!loading && listError && (
                <div className='px-4 py-4'>
                  <p className='text-xs text-destructive'>{listError}</p>
                </div>
              )}

              {!loading && !listError && (
                <>
                  {/* Parent dir shortcut */}
                  {currentPath !== '/' && (
                    <div
                      className='flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-accent/50 transition-colors'
                      onDoubleClick={navigateUp}
                      onClick={() => setSelected(null)}
                    >
                      <Folder className='h-4 w-4 text-muted-foreground shrink-0' />
                      <span className='text-xs text-muted-foreground'>..</span>
                    </div>
                  )}

                  {entries.length === 0 && (
                    <div className='flex items-center justify-center py-16'>
                      <p className='text-xs text-muted-foreground'>Directory is empty</p>
                    </div>
                  )}

                  {entries.map((entry) => (
                    <FileRow
                      key={entry.path}
                      entry={entry}
                      selected={selected?.path === entry.path}
                      onSelect={() => setSelected(entry)}
                      onNavigate={() => navigate(entry.path)}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Status bar */}
            <div className='flex items-center gap-3 px-4 py-1.5 border-t border-border/30 bg-muted/20'>
              <span className='text-[10px] text-muted-foreground'>
                {entries.length} {entries.length === 1 ? 'item' : 'items'}
              </span>
              {selected && (
                <>
                  <span className='text-[10px] text-muted-foreground'>·</span>
                  <span className='text-[10px] text-muted-foreground truncate'>
                    {selected.name}
                    {!selected.is_dir && ` · ${formatBytes(selected.size)}`}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </Main>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.is_dir
                ? 'The directory and all its contents will be permanently deleted on the remote server.'
                : 'The file will be permanently deleted on the remote server.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <AlertDialog open={!!renameTarget} onOpenChange={(v) => !v && setRenameTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename "{renameTarget?.name}"</AlertDialogTitle>
          </AlertDialogHeader>
          <div className='px-6 pb-2'>
            <Input
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              className='text-xs'
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename} disabled={!renameTo.trim()}>
              Rename
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New folder dialog */}
      <AlertDialog open={mkdirOpen} onOpenChange={(v) => !v && setMkdirOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New folder</AlertDialogTitle>
          </AlertDialogHeader>
          <div className='px-6 pb-2'>
            <Input
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              placeholder='folder-name'
              className='text-xs font-mono'
              onKeyDown={(e) => e.key === 'Enter' && handleMkdir()}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMkdir} disabled={!mkdirName.trim()}>
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
