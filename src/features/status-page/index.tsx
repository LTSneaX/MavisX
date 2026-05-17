import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { open } from '@tauri-apps/plugin-shell'
import { Globe, Copy, ExternalLink, Sparkles, Check, RefreshCw, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { db } from '@/lib/db'

function ProGateCard() {
  return (
    <Card className='border-primary/30 bg-primary/5'>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Sparkles className='text-primary h-5 w-5' />
          <CardTitle>Pro Feature</CardTitle>
          <Badge className='ml-1'>PRO</Badge>
        </div>
        <CardDescription>
          Generate a public status page that you can host anywhere — share it with your team
          or embed it on your site.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='grid grid-cols-1 gap-2 text-sm'>
          {[
            'Beautiful, dark-themed HTML file — no dependencies',
            'Shows live status for all your monitors',
            'Host it on GitHub Pages, Nginx, Cloudflare Pages, anywhere',
            'One-click regenerate whenever you need a fresh snapshot',
          ].map((f) => (
            <div key={f} className='flex items-start gap-2'>
              <Check className='text-primary mt-0.5 h-4 w-4 shrink-0' />
              <span className='text-muted-foreground'>{f}</span>
            </div>
          ))}
        </div>
        <Separator />
        <div className='rounded-lg border bg-muted/40 p-4'>
          <p className='text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide'>Preview</p>
          <StatusPagePreview />
        </div>
        <Button className='w-fit' disabled>
          <Sparkles className='mr-2 h-4 w-4' />
          Upgrade to Pro
        </Button>
        <p className='text-muted-foreground text-xs'>
          Pro plan coming soon. For now, generation works in dev mode — see the generator below.
        </p>
      </CardContent>
    </Card>
  )
}

function StatusPagePreview() {
  return (
    <div className='rounded-md bg-[#0f0f11] p-4 text-xs font-mono space-y-2'>
      <div className='text-[#a1a1aa]'>My Workspace</div>
      <div className='flex items-center gap-2'>
        <span className='inline-block h-2.5 w-2.5 rounded-full bg-green-500' />
        <span className='font-bold text-white text-sm'>All systems operational</span>
      </div>
      <div className='mt-3 space-y-1.5'>
        {[
          { name: 'api.example.com', type: 'HTTP', status: 'up' },
          { name: 'db.example.com', type: 'PORT', status: 'up' },
          { name: 'cdn.example.com', type: 'DNS', status: 'degraded' },
        ].map((m) => (
          <div key={m.name} className='flex items-center justify-between rounded bg-[#18181b] px-3 py-2'>
            <div className='flex items-center gap-2'>
              <span
                className='inline-block h-2 w-2 rounded-full'
                style={{
                  background: m.status === 'up' ? '#22c55e' : m.status === 'down' ? '#ef4444' : '#eab308',
                }}
              />
              <span className='text-zinc-200'>{m.name}</span>
              <span className='text-zinc-500'>{m.type}</span>
            </div>
            <span
              className='text-[10px] font-semibold uppercase'
              style={{ color: m.status === 'up' ? '#22c55e' : m.status === 'degraded' ? '#eab308' : '#ef4444' }}
            >
              {m.status === 'up' ? 'Operational' : m.status === 'degraded' ? 'Degraded' : 'Down'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusPageGenerator() {
  const [generating, setGenerating] = useState(false)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const path = await db.generateStatusPage()
      setOutputPath(path)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  async function copyPath() {
    if (!outputPath) return
    await navigator.clipboard.writeText(outputPath)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function openInBrowser() {
    if (!outputPath) return
    // Convert Windows backslashes to forward slashes for file:// URL
    const fileUrl = outputPath.startsWith('/')
      ? `file://${outputPath}`
      : `file:///${outputPath.replace(/\\/g, '/')}`
    await open(fileUrl)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Status Page</CardTitle>
        <CardDescription>
          Creates a static <code className='text-xs'>index.html</code> file from your current
          monitor data. Host it anywhere.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <Button onClick={generate} disabled={generating} className='w-fit'>
          {generating ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <RefreshCw className='mr-2 h-4 w-4' />
          )}
          {outputPath ? 'Regenerate' : 'Generate now'}
        </Button>

        {error && (
          <p className='text-destructive text-sm'>{error}</p>
        )}

        {outputPath && (
          <div className='flex flex-col gap-3'>
            <Separator />
            <div className='flex flex-col gap-1.5'>
              <p className='text-sm font-medium'>Output file</p>
              <div className='bg-muted flex items-center gap-2 rounded-md px-3 py-2'>
                <code className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
                  {outputPath}
                </code>
                <Button variant='ghost' size='icon' className='h-6 w-6 shrink-0' onClick={copyPath}>
                  {copied ? (
                    <Check className='h-3.5 w-3.5 text-green-500' />
                  ) : (
                    <Copy className='h-3.5 w-3.5' />
                  )}
                </Button>
              </div>
            </div>
            <div className='flex gap-2'>
              <Button variant='outline' size='sm' onClick={openInBrowser}>
                <ExternalLink className='mr-2 h-4 w-4' />
                Open in browser
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              Tip: serve this file with any static host — Nginx, Caddy, GitHub Pages, Cloudflare Pages.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function StatusPageFeature() {
  const { data: _plan } = useQuery({
    queryKey: ['workspace-plan'],
    queryFn: () => db.getWorkspacePlan(),
  })

  return (
    <>
      <Header fixed>
        <div className='flex items-center gap-2 me-auto'>
          <Globe className='h-5 w-5' />
          <span className='font-semibold'>Status Page</span>
          <Badge variant='outline' className='text-muted-foreground text-xs'>Pro</Badge>
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Status Page</h2>
          <p className='text-muted-foreground text-sm'>
            Publish a public status page for your services.
          </p>
        </div>

        <ProGateCard />

        {/* Generator available in dev regardless of plan */}
        <StatusPageGenerator />
      </Main>
    </>
  )
}
