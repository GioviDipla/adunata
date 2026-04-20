'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { X, Printer, CheckSquare, Square, Mail } from 'lucide-react'
import { generateProxyPdf } from '@/lib/proxyPdf'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface CardEntry {
  card: CardRow
  quantity: number
  board: string
}

interface ProxyPrintModalProps {
  deckName: string
  cards: CardEntry[]
  onClose: () => void
}

type Paper = 'a4' | 'letter'
type GapOption = 0 | 0.2 | 0.5 | 1.0
type ScaleOption = 100 | 95 | 90

const SECTIONS: { key: string; label: string }[] = [
  { key: 'main', label: 'Maindeck' },
  { key: 'sideboard', label: 'Sideboard' },
  { key: 'maybeboard', label: 'Maybeboard' },
  { key: 'tokens', label: 'Tokens' },
]

function isBasicLand(card: CardRow): boolean {
  return (card.type_line ?? '').includes('Basic Land')
}

function cardKey(entry: CardEntry): string {
  return `${entry.card.id}-${entry.board}`
}

export default function ProxyPrintModal({ deckName, cards, onClose }: ProxyPrintModalProps) {
  const [skipBasicLands, setSkipBasicLands] = useState(true)
  const [paper, setPaper] = useState<Paper>('a4')
  const [gap, setGap] = useState<GapOption>(0)
  const [scale, setScale] = useState<ScaleOption>(100)
  const [deselected, setDeselected] = useState<Set<string>>(() => {
    const set = new Set<string>()
    for (const entry of cards) {
      if (isBasicLand(entry.card)) set.add(cardKey(entry))
    }
    return set
  })
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [canShareFiles, setCanShareFiles] = useState(false)

  useEffect(() => {
    // Feature-detect Web Share Level 2 with a probe file. Hidden on desktop
    // browsers that don't accept file sharing (Chrome Win/Linux, Firefox).
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return
    try {
      const probe = new File([new Uint8Array()], 'probe.pdf', { type: 'application/pdf' })
      setCanShareFiles(navigator.canShare({ files: [probe] }))
    } catch {
      setCanShareFiles(false)
    }
  }, [])

  // Group and sort cards by section, alphabetically
  const sections = useMemo(() => {
    return SECTIONS.map((s) => ({
      ...s,
      cards: cards
        .filter((e) => e.board === s.key || (s.key === 'main' && e.board === 'commander'))
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    })).filter((s) => s.cards.length > 0)
  }, [cards])

  const toggleCard = useCallback((key: string) => {
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleSkipBasicLands = useCallback((checked: boolean) => {
    setSkipBasicLands(checked)
    setDeselected((prev) => {
      const next = new Set(prev)
      for (const entry of cards) {
        if (isBasicLand(entry.card)) {
          if (checked) next.add(cardKey(entry))
          else next.delete(cardKey(entry))
        }
      }
      return next
    })
  }, [cards])

  const selectSection = useCallback((sectionKey: string) => {
    setDeselected((prev) => {
      const next = new Set(prev)
      for (const entry of cards) {
        if (entry.board === sectionKey || (sectionKey === 'main' && entry.board === 'commander')) {
          if (skipBasicLands && isBasicLand(entry.card)) continue
          next.delete(cardKey(entry))
        }
      }
      return next
    })
  }, [cards, skipBasicLands])

  const deselectSection = useCallback((sectionKey: string) => {
    setDeselected((prev) => {
      const next = new Set(prev)
      for (const entry of cards) {
        if (entry.board === sectionKey || (sectionKey === 'main' && entry.board === 'commander')) {
          next.add(cardKey(entry))
        }
      }
      return next
    })
  }, [cards])

  const selectedCards = useMemo(() => {
    return cards.filter((e) => !deselected.has(cardKey(e)))
  }, [cards, deselected])

  const totalCards = useMemo(() => {
    return selectedCards.reduce((sum, e) => sum + e.quantity, 0)
  }, [selectedCards])

  const buildPdfBlob = useCallback(async (): Promise<Blob | null> => {
    const cardsWithImages = selectedCards
      .filter((e) => e.card.image_normal)
      .map((e) => ({ imageUrl: e.card.image_normal!, quantity: e.quantity }))
    if (cardsWithImages.length === 0) return null

    return generateProxyPdf({
      paper,
      gap,
      scale: scale / 100,
      cards: cardsWithImages,
      onProgress: (done, total) => setProgress({ done, total }),
    })
  }, [selectedCards, paper, gap, scale])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setProgress({ done: 0, total: 0 })
    try {
      const blob = await buildPdfBlob()
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${deckName}-proxies.pdf`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch {
      // silently fail
    } finally {
      setGenerating(false)
    }
  }, [buildPdfBlob, deckName, onClose])

  const handleShare = useCallback(async () => {
    setGenerating(true)
    setProgress({ done: 0, total: 0 })
    try {
      const blob = await buildPdfBlob()
      if (!blob) return
      const file = new File([blob], `${deckName}-proxies.pdf`, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${deckName} — proxies`,
          text: `Proxies for ${deckName}`,
        })
        onClose()
      } else {
        // Share API disappeared between detection and click — fall back to download.
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${deckName}-proxies.pdf`
        a.click()
        URL.revokeObjectURL(url)
        onClose()
      }
    } catch (err) {
      // AbortError = user cancelled the share sheet. Don't surface it.
      if ((err as Error | undefined)?.name && (err as Error).name !== 'AbortError') {
        console.error('[proxy-share]', err)
      }
    } finally {
      setGenerating(false)
    }
  }, [buildPdfBlob, deckName, onClose])

  const pages = Math.ceil(totalCards / 9)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bg-dark/80" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl sm:rounded-xl border border-border bg-bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-font-accent" />
            <h2 className="text-sm font-bold text-font-primary">Print Proxies</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-font-muted">
              {totalCards} card{totalCards !== 1 ? 's' : ''} · {pages} page{pages !== 1 ? 's' : ''}
            </span>
            <button onClick={onClose} className="rounded p-1 text-font-muted hover:bg-bg-hover hover:text-font-primary">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Card sections */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {sections.map((section) => {
            const sectionSelected = section.cards.filter((e) => !deselected.has(cardKey(e))).length
            const sectionTotal = section.cards.length
            return (
              <div key={section.key} className="mb-4 last:mb-0">
                {/* Section header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-font-secondary tracking-wide uppercase">
                    {section.label} ({sectionSelected}/{sectionTotal})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => selectSection(section.key)}
                      className="text-[10px] font-medium text-font-accent hover:underline"
                    >
                      All
                    </button>
                    <span className="text-font-muted text-[10px]">·</span>
                    <button
                      onClick={() => deselectSection(section.key)}
                      className="text-[10px] font-medium text-font-accent hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* Cards grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {section.cards.map((entry) => {
                    const key = cardKey(entry)
                    const selected = !deselected.has(key)
                    return (
                      <button
                        key={key}
                        onClick={() => toggleCard(key)}
                        className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                          selected
                            ? 'border-bg-accent ring-1 ring-bg-accent/30'
                            : 'border-border opacity-40'
                        }`}
                        style={{ touchAction: 'manipulation' }}
                      >
                        {entry.card.image_small ? (
                          <img
                            src={entry.card.image_small}
                            alt={entry.card.name}
                            className="w-full h-auto"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="flex aspect-[488/680] items-center justify-center bg-bg-cell p-2">
                            <span className="text-center text-[9px] text-font-muted">{entry.card.name}</span>
                          </div>
                        )}
                        {/* Quantity badge */}
                        <div className="absolute top-1 left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bg-dark/80 px-1 text-[10px] font-bold text-font-primary backdrop-blur-sm">
                          {entry.quantity}x
                        </div>
                        {/* Checkbox icon */}
                        <div className="absolute top-1 right-1">
                          {selected ? (
                            <CheckSquare size={14} className="text-bg-accent" />
                          ) : (
                            <Square size={14} className="text-font-muted" />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {sections.length === 0 && (
            <p className="text-sm text-font-muted text-center py-8">No cards in this deck.</p>
          )}
        </div>

        {/* Options bar */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Skip basic lands toggle */}
            <label className="flex items-center gap-2 text-xs text-font-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={skipBasicLands}
                onChange={(e) => handleSkipBasicLands(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-bg-accent"
              />
              Skip basic lands
            </label>

            {/* Paper */}
            <label className="flex items-center gap-1.5 text-xs text-font-secondary">
              Paper
              <select
                value={paper}
                onChange={(e) => setPaper(e.target.value as Paper)}
                className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
              >
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
              </select>
            </label>

            {/* Gap */}
            <label className="flex items-center gap-1.5 text-xs text-font-secondary">
              Gap
              <select
                value={gap}
                onChange={(e) => setGap(Number(e.target.value) as GapOption)}
                className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
              >
                <option value={0}>0.0mm</option>
                <option value={0.2}>0.2mm</option>
                <option value={0.5}>0.5mm</option>
                <option value={1.0}>1.0mm</option>
              </select>
            </label>

            {/* Scale */}
            <label className="flex items-center gap-1.5 text-xs text-font-secondary">
              Scale
              <select
                value={scale}
                onChange={(e) => setScale(Number(e.target.value) as ScaleOption)}
                className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
              >
                <option value={100}>100%</option>
                <option value={95}>95%</option>
                <option value={90}>90%</option>
              </select>
            </label>
          </div>

          {/* Generate / Share buttons */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleGenerate}
              disabled={generating || totalCards === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-bg-accent px-4 py-2.5 text-sm font-bold text-font-white transition-colors hover:bg-bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-font-white/30 border-t-font-white" />
                  {progress.total > 0
                    ? `${progress.done}/${progress.total}`
                    : 'Generating…'}
                </>
              ) : (
                <>
                  <Printer size={16} />
                  Generate PDF
                </>
              )}
            </button>
            {canShareFiles && (
              <button
                onClick={handleShare}
                disabled={generating || totalCards === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-bg-accent/60 bg-bg-card px-4 py-2.5 text-sm font-bold text-font-accent transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mail size={16} />
                Send via email
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
