import { useState, useEffect, useRef, useCallback } from 'react'
import {
  dockerListContainers,
  dockerListImages,
  dockerStart,
  dockerStop,
  dockerRestart,
  dockerRemove,
  dockerLogs,
  dockerRemoveImage,
  formatBytes,
  formatCreated,
  type ContainerInfo,
  type ImageInfo,
} from '@/lib/docker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Container,
  Image as ImageIcon,
  Play,
  Square,
  RotateCcw,
  Trash2,
  RefreshCw,
  ScrollText,
  X,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function stateColor(state: string) {
  switch (state) {
    case 'running': return 'text-emerald-400'
    case 'exited': return 'text-zinc-500'
    case 'paused': return 'text-yellow-400'
    default: return 'text-zinc-400'
  }
}

function stateBadgeVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'running': return 'default'
    case 'exited': return 'secondary'
    default: return 'outline'
  }
}

// ── Logs modal ────────────────────────────────────────────────────────────────

function LogsModal({
  container,
  onClose,
}: {
  container: ContainerInfo
  onClose: () => void
}) {
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setLines([])
    dockerLogs(container.id, 200, (line) => {
      setLines((prev) => [...prev, line])
    })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [container.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4'>
      <div className='flex h-[70vh] w-full max-w-4xl flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl'>
        {/* header */}
        <div className='flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-3'>
          <ScrollText className='h-4 w-4 text-blue-400' />
          <span className='font-mono text-sm font-medium text-zinc-100'>{container.name}</span>
          <span className='text-xs text-zinc-500'>— last 200 lines</span>
          <Button
            variant='ghost'
            size='icon'
            className='ml-auto h-7 w-7 text-zinc-500 hover:text-zinc-200'
            onClick={onClose}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
        {/* body */}
        <div className='min-h-0 flex-1 overflow-y-auto p-4 font-mono text-xs'>
          {loading && lines.length === 0 && (
            <p className='text-zinc-500'>Loading logs…</p>
          )}
          {error && (
            <p className='text-red-400'>[error] {error}</p>
          )}
          {lines.map((line, i) => (
            <div key={i} className='whitespace-pre-wrap break-all text-zinc-300 leading-relaxed'>
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}

// ── Containers tab ────────────────────────────────────────────────────────────

function ContainersTab() {
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [logsTarget, setLogsTarget] = useState<ContainerInfo | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setContainers(await dockerListContainers(showAll))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [showAll])

  useEffect(() => { refresh() }, [refresh])

  async function act(id: string, fn: () => Promise<void>) {
    setBusy((s) => new Set(s).add(id))
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  return (
    <>
      {logsTarget && (
        <LogsModal container={logsTarget} onClose={() => setLogsTarget(null)} />
      )}

      {/* toolbar */}
      <div className='flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-2'>
        <label className='flex cursor-pointer items-center gap-1.5 text-xs text-zinc-400 select-none'>
          <input
            type='checkbox'
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className='h-3 w-3 rounded'
          />
          Show stopped
        </label>
        <Button
          variant='ghost'
          size='sm'
          className='ml-auto h-7 px-2 text-xs text-zinc-400'
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* error */}
      {error && (
        <div className='flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400'>
          <AlertCircle className='h-3.5 w-3.5 shrink-0' />
          {error}
        </div>
      )}

      {/* table */}
      <div className='min-h-0 flex-1 overflow-y-auto'>
        {!loading && containers.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center gap-2 text-center'>
            <Container className='h-8 w-8 text-zinc-700' />
            <p className='text-sm text-zinc-500'>No containers found</p>
            {!showAll && (
              <p className='text-xs text-zinc-600'>Enable "Show stopped" to include exited containers</p>
            )}
          </div>
        ) : (
          <table className='w-full text-xs'>
            <thead className='sticky top-0 bg-zinc-950'>
              <tr className='border-b border-zinc-800 text-left text-zinc-500'>
                <th className='px-4 py-2 font-medium'>Name</th>
                <th className='px-4 py-2 font-medium'>Image</th>
                <th className='px-4 py-2 font-medium'>Status</th>
                <th className='px-4 py-2 font-medium'>Ports</th>
                <th className='px-4 py-2 font-medium'>Created</th>
                <th className='px-4 py-2 font-medium'></th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr
                  key={c.id}
                  className='group border-b border-zinc-800/60 hover:bg-zinc-900/50'
                >
                  <td className='px-4 py-2.5'>
                    <div className='flex items-center gap-1.5'>
                      <ChevronRight className={`h-3 w-3 ${stateColor(c.state)}`} />
                      <span className='font-medium text-zinc-200'>{c.name}</span>
                    </div>
                    <span className='font-mono text-[10px] text-zinc-600'>{c.id.slice(0, 12)}</span>
                  </td>
                  <td className='max-w-[200px] truncate px-4 py-2.5 font-mono text-zinc-400'>
                    {c.image}
                  </td>
                  <td className='px-4 py-2.5'>
                    <Badge variant={stateBadgeVariant(c.state)} className='text-[10px]'>
                      {c.state}
                    </Badge>
                    <div className='mt-0.5 text-[10px] text-zinc-500'>{c.status}</div>
                  </td>
                  <td className='px-4 py-2.5 font-mono text-zinc-500'>
                    {c.ports.length > 0 ? (
                      <div className='flex flex-col gap-0.5'>
                        {c.ports.slice(0, 3).map((p) => (
                          <span key={p}>{p}</span>
                        ))}
                        {c.ports.length > 3 && (
                          <span className='text-zinc-600'>+{c.ports.length - 3} more</span>
                        )}
                      </div>
                    ) : (
                      <span className='text-zinc-700'>—</span>
                    )}
                  </td>
                  <td className='px-4 py-2.5 text-zinc-500'>{formatCreated(c.created)}</td>
                  <td className='px-4 py-2.5'>
                    <div className='flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                      {c.state === 'running' ? (
                        <>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-6 w-6 text-zinc-500 hover:text-yellow-400'
                            title='Stop'
                            disabled={busy.has(c.id)}
                            onClick={() => act(c.id, () => dockerStop(c.id))}
                          >
                            <Square className='h-3 w-3' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-6 w-6 text-zinc-500 hover:text-blue-400'
                            title='Restart'
                            disabled={busy.has(c.id)}
                            onClick={() => act(c.id, () => dockerRestart(c.id))}
                          >
                            <RotateCcw className='h-3 w-3' />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-6 w-6 text-zinc-500 hover:text-emerald-400'
                          title='Start'
                          disabled={busy.has(c.id)}
                          onClick={() => act(c.id, () => dockerStart(c.id))}
                        >
                          <Play className='h-3 w-3' />
                        </Button>
                      )}
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-6 w-6 text-zinc-500 hover:text-zinc-200'
                        title='Logs'
                        onClick={() => setLogsTarget(c)}
                      >
                        <ScrollText className='h-3 w-3' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-6 w-6 text-zinc-500 hover:text-red-400'
                        title='Remove'
                        disabled={busy.has(c.id)}
                        onClick={() => act(c.id, () => dockerRemove(c.id, c.state === 'running'))}
                      >
                        <Trash2 className='h-3 w-3' />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* footer */}
      <div className='shrink-0 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-600'>
        {containers.length} container{containers.length !== 1 ? 's' : ''}
      </div>
    </>
  )
}

// ── Images tab ────────────────────────────────────────────────────────────────

function ImagesTab() {
  const [images, setImages] = useState<ImageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setImages(await dockerListImages())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function removeImage(id: string) {
    setBusy((s) => new Set(s).add(id))
    try {
      await dockerRemoveImage(id, false)
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  return (
    <>
      {/* toolbar */}
      <div className='flex shrink-0 items-center border-b border-zinc-800 px-4 py-2'>
        <Button
          variant='ghost'
          size='sm'
          className='ml-auto h-7 px-2 text-xs text-zinc-400'
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className='flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400'>
          <AlertCircle className='h-3.5 w-3.5 shrink-0' />
          {error}
        </div>
      )}

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {!loading && images.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center gap-2'>
            <ImageIcon className='h-8 w-8 text-zinc-700' />
            <p className='text-sm text-zinc-500'>No images found</p>
          </div>
        ) : (
          <table className='w-full text-xs'>
            <thead className='sticky top-0 bg-zinc-950'>
              <tr className='border-b border-zinc-800 text-left text-zinc-500'>
                <th className='px-4 py-2 font-medium'>Tag</th>
                <th className='px-4 py-2 font-medium'>ID</th>
                <th className='px-4 py-2 font-medium'>Size</th>
                <th className='px-4 py-2 font-medium'>Created</th>
                <th className='px-4 py-2 font-medium'></th>
              </tr>
            </thead>
            <tbody>
              {images.map((img) => (
                <tr
                  key={img.id}
                  className='group border-b border-zinc-800/60 hover:bg-zinc-900/50'
                >
                  <td className='px-4 py-2.5'>
                    {img.tags.length > 0 ? (
                      img.tags.map((t) => (
                        <div key={t} className='font-mono text-zinc-200'>{t}</div>
                      ))
                    ) : (
                      <span className='text-zinc-600'>&lt;none&gt;</span>
                    )}
                  </td>
                  <td className='px-4 py-2.5 font-mono text-zinc-500'>
                    {img.id.replace('sha256:', '').slice(0, 12)}
                  </td>
                  <td className='px-4 py-2.5 text-zinc-400'>{formatBytes(img.size)}</td>
                  <td className='px-4 py-2.5 text-zinc-500'>{formatCreated(img.created)}</td>
                  <td className='px-4 py-2.5'>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-6 w-6 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400'
                      title='Remove image'
                      disabled={busy.has(img.id)}
                      onClick={() => removeImage(img.id)}
                    >
                      <Trash2 className='h-3 w-3' />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className='shrink-0 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-600'>
        {images.length} image{images.length !== 1 ? 's' : ''}
      </div>
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

type Tab = 'containers' | 'images'

export function DockerManager() {
  const [tab, setTab] = useState<Tab>('containers')

  return (
    <div className='flex h-full flex-col bg-zinc-950 text-zinc-100'>
      {/* page header */}
      <div className='shrink-0 border-b border-zinc-800 px-6 py-4'>
        <div className='flex items-center gap-2'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10'>
            <Container className='h-4 w-4 text-blue-400' />
          </div>
          <div>
            <h1 className='text-sm font-semibold text-zinc-100'>Docker Manager</h1>
            <p className='text-xs text-zinc-500'>Containers · Images · Logs</p>
          </div>
        </div>

        {/* tabs */}
        <div className='mt-3 flex gap-1'>
          {(['containers', 'images'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* tab content */}
      <div className='flex min-h-0 flex-1 flex-col'>
        {tab === 'containers' ? <ContainersTab /> : <ImagesTab />}
      </div>
    </div>
  )
}
