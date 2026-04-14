import { useRef, useState } from 'react'
import { X, Copy, Check, RotateCw, Sparkles } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { cn } from '~/lib/utils'

type Tone = 'professional' | 'casual' | 'funny' | 'persuasive' | 'inspirational'
type Length = 'short' | 'medium' | 'long'
type ImproveAction =
  | 'shorten'
  | 'more_engaging'
  | 'fix_grammar'
  | 'add_hashtags'
  | 'change_tone'
  | 'rewrite'

type GenerationRow = {
  id: string
  label: string
  text: string
  streaming: boolean
}

export function AIAssistPanel({
  open,
  onClose,
  workspaceSlug,
  platforms,
  existingContent,
  onUseText,
}: {
  open: boolean
  onClose: () => void
  workspaceSlug: string
  platforms: PlatformKey[]
  existingContent: string
  onUseText: (text: string) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [tone, setTone] = useState<Tone>('casual')
  const [length, setLength] = useState<Length>('medium')
  const [rows, setRows] = useState<GenerationRow[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [toneMenuOpen, setToneMenuOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  if (!open) return null

  const run = async (
    mode: 'generate' | 'improve' | 'hashtags',
    label: string,
    improveAction: ImproveAction | null = null,
    overrideTone?: Tone,
  ) => {
    setError(null)
    setStreaming(true)
    const id = Math.random().toString(36).slice(2, 10)
    setRows((prev) => [{ id, label, text: '', streaming: true }, ...prev])
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          workspaceSlug,
          mode,
          platforms,
          tone: overrideTone ?? tone,
          length,
          prompt: mode === 'generate' ? prompt : null,
          existingContent: mode === 'improve' || mode === 'hashtags' ? existingContent : null,
          improveAction,
        }),
      })
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Generation failed (${res.status}): ${txt.slice(0, 200)}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, text: accumulated } : r)),
        )
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, streaming: false } : r)))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Generation failed')
      setRows((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setStreaming(false)
    }
  }

  const copyRow = async (row: GenerationRow) => {
    await navigator.clipboard.writeText(row.text)
    setCopiedId(row.id)
    setTimeout(() => setCopiedId((c) => (c === row.id ? null : c)), 1500)
  }

  const platformLabel = platforms.length
    ? `Optimising for: ${platforms.map((p) => PLATFORMS[p].label).join(', ')}`
    : 'Select platforms in the composer first'

  const canGenerate = platforms.length > 0 && !streaming

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[min(480px,100%)] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <div className="text-lg font-semibold">AI Assist</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 hover:bg-neutral-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-4">
          <div className="space-y-3">
            <div className="text-xs text-neutral-500">{platformLabel}</div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Generate from scratch
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to post about…"
                className="min-h-[80px] w-full resize-y rounded-md border border-neutral-200 p-2 text-sm"
              />
              <ChipRow label="Tone">
                {(['professional', 'casual', 'funny', 'persuasive', 'inspirational'] as Tone[]).map(
                  (t) => (
                    <Chip key={t} active={tone === t} onClick={() => setTone(t)}>
                      {t}
                    </Chip>
                  ),
                )}
              </ChipRow>
              <ChipRow label="Length">
                {(['short', 'medium', 'long'] as Length[]).map((l) => (
                  <Chip key={l} active={length === l} onClick={() => setLength(l)}>
                    {l}
                  </Chip>
                ))}
              </ChipRow>
              <Button
                type="button"
                onClick={() => run('generate', prompt.slice(0, 40) || 'Generate')}
                disabled={!canGenerate || !prompt.trim()}
                className="w-full"
              >
                {streaming ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                Generate
              </Button>
            </div>
          </div>

          {existingContent.trim() ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Improve existing text
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ImproveBtn onClick={() => run('improve', 'Shorter', 'shorten')}>
                  Make it shorter
                </ImproveBtn>
                <ImproveBtn onClick={() => run('improve', 'More engaging', 'more_engaging')}>
                  Make it more engaging
                </ImproveBtn>
                <ImproveBtn onClick={() => run('improve', 'Grammar', 'fix_grammar')}>
                  Fix grammar & spelling
                </ImproveBtn>
                <ImproveBtn onClick={() => run('improve', 'Hashtags', 'add_hashtags')}>
                  Add relevant hashtags
                </ImproveBtn>
                <div className="relative">
                  <ImproveBtn onClick={() => setToneMenuOpen((o) => !o)}>
                    Change tone →
                  </ImproveBtn>
                  {toneMenuOpen ? (
                    <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border border-neutral-200 bg-white p-1 text-sm shadow-lg">
                      {(
                        ['professional', 'casual', 'funny', 'persuasive', 'inspirational'] as Tone[]
                      ).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100"
                          onClick={() => {
                            setToneMenuOpen(false)
                            run('improve', `Tone: ${t}`, 'change_tone', t)
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <ImproveBtn onClick={() => run('improve', 'Rewrite', 'rewrite')}>
                  Rewrite completely
                </ImproveBtn>
              </div>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Results
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => run('hashtags', 'Hashtags')}
                  disabled={streaming || (!existingContent.trim() && !rows[0])}
                >
                  Suggest hashtags
                </Button>
              </div>
              {rows.map((row) => (
                <div key={row.id} className="space-y-1.5 rounded-md border border-neutral-200 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                    {row.label}
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-neutral-900">
                    {row.text}
                    {row.streaming ? (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-500 align-middle" />
                    ) : null}
                  </div>
                  {!row.streaming && row.text ? (
                    <div className="flex gap-1.5 pt-1">
                      <Button
                        size="sm"
                        onClick={() => {
                          onUseText(row.text)
                          onClose()
                        }}
                      >
                        Use this
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copyRow(row)}>
                        {copiedId === row.id ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run('generate', row.label)}
                      >
                        <RotateCw className="h-3 w-3" /> Try again
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs capitalize',
        active
          ? 'bg-indigo-500 text-white'
          : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50',
      )}
    >
      {children}
    </button>
  )
}

function ImproveBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-neutral-200 bg-white p-2 text-left text-xs hover:border-indigo-300 hover:bg-indigo-50"
    >
      {children}
    </button>
  )
}
