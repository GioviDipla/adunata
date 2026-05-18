'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { X, Printer, CheckSquare, Square, Mail, AlertTriangle, Send } from 'lucide-react'
import { generateProxyPdfWithDetails } from '@/lib/proxyPdf'
import type { Database } from '@/types/supabase'
import type {
  BleedMode,
  DirectPokerRotation,
  DirectPrintRasterPreset,
  OutputMode,
  PaperOption,
  PaperPreset,
  PrintFitMode,
  PrintRasterPreset,
} from '@/lib/proxyPdf'

type CardRow = Database['public']['Tables']['cards']['Row']

interface CardEntry {
  card: CardRow
  quantity: number
  board: string
}

interface ProxyPrintModalProps {
  deckName: string
  cards: CardEntry[]
  userName: string
  onClose: () => void
}

type ScaleOption = 100 | 95 | 90
type Orientation = 'portrait' | 'landscape'
type GridPreset = '3x3' | '4x2' | '5x2' | 'custom'

const SECTIONS: { key: string; label: string }[] = [
  { key: 'main', label: 'Maindeck' },
  { key: 'sideboard', label: 'Sideboard' },
  { key: 'maybeboard', label: 'Maybeboard' },
  { key: 'tokens', label: 'Tokens' },
]

const PAPER_SIZES: Record<Exclude<PaperPreset, 'custom'>, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  a6: { width: 105, height: 148 },
  letter: { width: 215.9, height: 279.4 },
}

const GRID_PRESETS: Record<Exclude<GridPreset, 'custom'>, { cols: number; rows: number }> = {
  '3x3': { cols: 3, rows: 3 },
  '4x2': { cols: 4, rows: 2 },
  '5x2': { cols: 5, rows: 2 },
}

function isBasicLand(card: CardRow): boolean {
  return (card.type_line ?? '').includes('Basic Land')
}

function cardKey(entry: CardEntry): string {
  return `${entry.card.id}-${entry.board}`
}

function imageUriFromFaces(card: CardRow, key: 'png' | 'large' | 'normal'): string | null {
  if (!Array.isArray(card.card_faces)) return null
  const frontFace = card.card_faces[0]
  if (!frontFace || typeof frontFace !== 'object' || Array.isArray(frontFace)) return null
  const imageUris = frontFace.image_uris
  if (!imageUris || typeof imageUris !== 'object' || Array.isArray(imageUris)) return null
  const value = imageUris[key]
  return typeof value === 'string' ? value : null
}

function deriveScryfallImageUrls(card: CardRow): string[] {
  const urls: string[] = []
  const facePng = imageUriFromFaces(card, 'png')
  const faceLarge = imageUriFromFaces(card, 'large')
  const faceNormal = imageUriFromFaces(card, 'normal')
  if (facePng) urls.push(facePng)
  if (faceLarge) urls.push(faceLarge)
  const id = card.scryfall_id
  if (id.length >= 2) {
    urls.push(`https://cards.scryfall.io/png/front/${id[0]}/${id[1]}/${id}.png`)
    urls.push(`https://cards.scryfall.io/large/front/${id[0]}/${id[1]}/${id}.jpg`)
  }
  if (faceNormal) urls.push(faceNormal)
  if (card.image_normal) {
    urls.push(card.image_normal)
  }
  return [...new Set(urls)]
}

function getBackFaceImage(card: CardRow): string | null {
  if (!Array.isArray(card.card_faces) || card.card_faces.length < 2) return null
  const backFace = card.card_faces[1]
  if (!backFace || typeof backFace !== 'object' || Array.isArray(backFace)) return null
  const imageUris = backFace.image_uris
  if (!imageUris || typeof imageUris !== 'object' || Array.isArray(imageUris)) return null
  const small = imageUris.small
  if (typeof small === 'string' && small.length > 0) return small
  const normal = imageUris.normal
  if (typeof normal === 'string' && normal.length > 0) return normal
  const large = imageUris.large
  if (typeof large === 'string' && large.length > 0) return large
  return null
}

export default function ProxyPrintModal({ deckName, cards, userName, onClose }: ProxyPrintModalProps) {
  const [skipBasicLands, setSkipBasicLands] = useState(true)
  const [outputMode, setOutputMode] = useState<OutputMode>('a4-sheet')
  const [paperPreset, setPaperPreset] = useState<PaperPreset>('a4')
  const [customWidth, setCustomWidth] = useState(210)
  const [customHeight, setCustomHeight] = useState(297)
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [gridPreset, setGridPreset] = useState<GridPreset>('3x3')
  const [customCols, setCustomCols] = useState(3)
  const [customRows, setCustomRows] = useState(3)
  const [gapX, setGapX] = useState(4)
  const [gapY, setGapY] = useState(5)
  const [scale, setScale] = useState<ScaleOption>(100)
  const [bleed, setBleed] = useState(1)
  const [bleedMode, setBleedMode] = useState<BleedMode>('preserve')
  const [printFitMode, setPrintFitMode] = useState<PrintFitMode>('preserve')
  const [offsetXmm, setOffsetXmm] = useState(13)
  const [offsetYmm, setOffsetYmm] = useState(0.5)
  const [rotation, setRotation] = useState<DirectPokerRotation>(0)
  const [directPrintRasterPreset, setDirectPrintRasterPreset] = useState<DirectPrintRasterPreset>('high')
  const [calibrationMode, setCalibrationMode] = useState(false)
  const [showDirectPrintGuides, setShowDirectPrintGuides] = useState(false)
  const [printRasterPreset, setPrintRasterPreset] = useState<PrintRasterPreset>('standard')
  const [cutGuides, setCutGuides] = useState(true)
  const [debugLayout, setDebugLayout] = useState(false)
  const [deselected, setDeselected] = useState<Set<string>>(() => {
    const set = new Set<string>()
    for (const entry of cards) {
      const isDeckCard = entry.board === 'main' || entry.board === 'commander'
      if (!isDeckCard || isBasicLand(entry.card)) set.add(cardKey(entry))
    }
    return set
  })
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [canShareFiles, setCanShareFiles] = useState(false)
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set())
  const [showPreview, setShowPreview] = useState(false)
  const [expandedOrder, setExpandedOrder] = useState<Array<{ card: CardRow; board: string }>>([])
  const [dragSlot, setDragSlot] = useState<number | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [sendingOrder, setSendingOrder] = useState(false)
  const [skipWarning, setSkipWarning] = useState<number>(0)

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

  const toggleFlip = useCallback((key: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectedCards = useMemo(() => {
    return cards.filter((e) => !deselected.has(cardKey(e)))
  }, [cards, deselected])

  const openPreview = useCallback(() => {
    const expanded = selectedCards.flatMap((e) =>
      Array.from({ length: e.quantity }, () => ({ card: e.card, board: e.board })),
    )
    setExpandedOrder(expanded)
    setPreviewPage(0)
    setShowPreview(true)
  }, [selectedCards])

  const closePreview = useCallback(() => {
    setShowPreview(false)
  }, [])

  // Drag-and-drop handlers for grid reordering
  const handleDragStart = useCallback((index: number) => {
    setDragSlot(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverSlot(index)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverSlot(null)
  }, [])

  const handleDrop = useCallback((index: number) => {
    if (dragSlot === null || dragSlot === index) {
      setDragSlot(null)
      setDragOverSlot(null)
      return
    }
    setExpandedOrder((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragSlot, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragSlot(null)
    setDragOverSlot(null)
  }, [dragSlot])

  const handleDragEnd = useCallback(() => {
    setDragSlot(null)
    setDragOverSlot(null)
  }, [])

  // Group expanded slots back into entries with quantities for the decklist email
  const groupExpandedToEntries = useCallback(
    (slots: Array<{ card: CardRow; board: string }>): CardEntry[] => {
      const grouped: CardEntry[] = []
      for (const slot of slots) {
        const last = grouped[grouped.length - 1]
        if (last && last.card.id === slot.card.id && last.board === slot.board) {
          last.quantity++
        } else {
          grouped.push({ card: slot.card, quantity: 1, board: slot.board })
        }
      }
      return grouped
    },
    [],
  )

  const buildMoxfieldDecklist = useCallback((entries: CardEntry[]): string => {
    const main: string[] = []
    const sideboard: string[] = []
    const maybeboard: string[] = []
    const tokens: string[] = []
    for (const entry of cards) {
      const line = `${entry.quantity} ${entry.card.name}`
      if (entry.board === 'main' || entry.board === 'commander') main.push(line)
      else if (entry.board === 'sideboard') sideboard.push(line)
      else if (entry.board === 'maybeboard') maybeboard.push(line)
      else if (entry.board === 'tokens') tokens.push(line)
    }
    const parts: string[] = []
    if (main.length) parts.push(main.join('\n'))
    if (sideboard.length) parts.push(`\n// Sideboard\n${sideboard.join('\n')}`)
    if (maybeboard.length) parts.push(`\n// Maybeboard\n${maybeboard.join('\n')}`)
    if (tokens.length) parts.push(`\n// Tokens\n${tokens.join('\n')}`)
    return parts.join('\n')
  }, [])

  const totalCards = useMemo(() => {
    return selectedCards.reduce((sum, e) => sum + e.quantity, 0)
  }, [selectedCards])

  const paper = useMemo<PaperOption>(() => {
    if (paperPreset === 'custom') {
      return {
        preset: 'custom',
        width: Math.max(1, customWidth),
        height: Math.max(1, customHeight),
      }
    }
    return { preset: paperPreset, ...PAPER_SIZES[paperPreset] }
  }, [paperPreset, customWidth, customHeight])

  const grid = useMemo(() => {
    if (gridPreset !== 'custom') return GRID_PRESETS[gridPreset]
    return {
      cols: Math.max(1, Math.min(8, Math.floor(customCols))),
      rows: Math.max(1, Math.min(8, Math.floor(customRows))),
    }
  }, [gridPreset, customCols, customRows])

  const effectiveBleed = bleedMode === 'none' ? 0 : bleed
  const gapWarning = outputMode === 'a4-sheet' && effectiveBleed > 0 && (gapX <= 2 * effectiveBleed || gapY <= 2 * effectiveBleed)

  const buildPdfBlob = useCallback(async (): Promise<{ blob: Blob; skippedCount: number } | null> => {
    const sourceCards = showPreview ? expandedOrder : selectedCards
    const cardsWithImages = showPreview
      ? (sourceCards as Array<{ card: CardRow; board: string }>)
          .map((s) => ({ imageUrls: deriveScryfallImageUrls(s.card), quantity: 1 }))
      : (sourceCards as CardEntry[])
          .map((e) => ({ imageUrls: deriveScryfallImageUrls(e.card), quantity: e.quantity }))
      .filter((e) => e.imageUrls.length > 0)
    if (cardsWithImages.length === 0 && !(outputMode === 'direct-poker' && calibrationMode)) return null

    const { blob, skippedUrls } = await generateProxyPdfWithDetails({
      outputMode,
      paper,
      orientation,
      scale: scale / 100,
      bleed: outputMode === 'direct-poker' && printFitMode === 'preserve' ? 0 : bleed,
      gapX,
      gapY,
      grid,
      cutGuides,
      debugLayout,
      printRasterPreset,
      bleedMode,
      printFitMode,
      offsetXmm,
      offsetYmm,
      rotation,
      calibrationMode,
      showDirectPrintGuides,
      directPrintRasterPreset,
      cards: cardsWithImages,
      onProgress: (done, total) => setProgress({ done, total }),
    })
    setSkipWarning(skippedUrls.length)
    return { blob, skippedCount: skippedUrls.length }
  }, [
    selectedCards,
    expandedOrder,
    showPreview,
    outputMode,
    calibrationMode,
    paper,
    orientation,
    scale,
    printFitMode,
    bleed,
    gapX,
    gapY,
    grid,
    cutGuides,
    debugLayout,
    printRasterPreset,
    bleedMode,
    offsetXmm,
    offsetYmm,
    rotation,
    showDirectPrintGuides,
    directPrintRasterPreset,
  ])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setSkipWarning(0)
    setProgress({ done: 0, total: 0 })
    try {
      const blob = await buildPdfBlob()
      if (!blob) return
      const url = URL.createObjectURL(blob.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${deckName}-proxies.pdf`
      a.click()
      URL.revokeObjectURL(url)
      if (blob.skippedCount === 0) onClose()
    } catch (err) {
      console.error('[proxy-generate]', err)
    } finally {
      setGenerating(false)
    }
  }, [buildPdfBlob, deckName, onClose])

  const handleShare = useCallback(async () => {
    setGenerating(true)
    setSkipWarning(0)
    setProgress({ done: 0, total: 0 })
    try {
      const blob = await buildPdfBlob()
      if (!blob) return
      const file = new File([blob.blob], `${deckName}-proxies.pdf`, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${deckName} — proxies`,
          text: `Proxies for ${deckName}`,
        })
        if (blob.skippedCount === 0) onClose()
      } else {
        // Share API disappeared between detection and click — fall back to download.
        const url = URL.createObjectURL(blob.blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${deckName}-proxies.pdf`
        a.click()
        URL.revokeObjectURL(url)
        if (blob.skippedCount === 0) onClose()
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

  const handlePrintOrder = useCallback(async () => {
    setSendingOrder(true)
    try {
      const blob = await buildPdfBlob()
      if (!blob) return
      const pdfBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result as string
          resolve(result.slice(result.indexOf(',') + 1))
        }
        reader.readAsDataURL(blob.blob)
      })
      const sourceCards = showPreview ? expandedOrder : selectedCards
      const entries = showPreview
        ? groupExpandedToEntries(sourceCards as Array<{ card: CardRow; board: string }>)
        : (sourceCards as CardEntry[])
      const decklist = buildMoxfieldDecklist(entries)

      const res = await fetch('/api/print-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName,
          deckName,
          decklist,
          pdfBase64,
          timestamp: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error((err as { error?: string }).error ?? 'Failed to send order')
      }
      onClose()
    } catch (err) {
      console.error('[print-order]', err)
    } finally {
      setSendingOrder(false)
    }
  }, [buildPdfBlob, buildMoxfieldDecklist, groupExpandedToEntries, deckName, userName, onClose, showPreview, expandedOrder, selectedCards])

  const pages = outputMode === 'direct-poker'
    ? (calibrationMode ? 1 : totalCards)
    : Math.ceil(totalCards / (grid.cols * grid.rows))
  const canGenerate = totalCards > 0 || (outputMode === 'direct-poker' && calibrationMode)

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

        {/* Scrollable body: card sections + options + warnings */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
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
                    const isFlipped = flippedCards.has(key)
                    const backImage = getBackFaceImage(entry.card)
                    const showBack = isFlipped && backImage
                    const imageSrc = showBack ? backImage : entry.card.image_small
                    return (
                      <div
                        key={key}
                        className="relative"
                      >
                        <button
                          onClick={() => toggleCard(key)}
                          className={`relative overflow-hidden rounded-lg border-2 transition-all w-full ${
                            selected
                              ? 'border-bg-accent ring-1 ring-bg-accent/30'
                              : 'border-border opacity-40'
                          }`}
                          style={{ touchAction: 'manipulation' }}
                        >
                          {imageSrc ? (
                            <img
                              src={imageSrc}
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
                          <div className="absolute bottom-1 left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bg-dark/80 px-1 text-[10px] font-bold text-font-primary backdrop-blur-sm">
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
                        {/* Flip button for double-faced cards */}
                        {backImage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFlip(key)
                            }}
                            className={`absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-bg-dark/80 text-[10px] font-bold text-font-primary backdrop-blur-sm hover:bg-bg-accent hover:text-font-white transition-colors ${
                              isFlipped ? 'bg-bg-accent/80 text-font-white' : ''
                            }`}
                            title={isFlipped ? 'Show front' : 'Show back'}
                          >
                            ↻
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {sections.length === 0 && (
            <p className="text-sm text-font-muted text-center py-8">No cards in this deck.</p>
          )}

          {/* Options bar — inside scroll body so all controls stay reachable on mobile */}
          <div className="-mx-3 mt-3 border-t border-border px-4 pt-3">
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

            <label className="flex items-center gap-1.5 text-xs text-font-secondary">
              Output
              <select
                value={outputMode}
                onChange={(e) => setOutputMode(e.target.value as OutputMode)}
                className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
              >
                <option value="direct-poker">Direct poker card</option>
                <option value="a4-sheet">A4 sheet</option>
              </select>
            </label>

            {outputMode === 'direct-poker' && (
              <>
                <span className="text-xs text-font-muted">Paper 89x89 mm · Card 63x88 mm</span>

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Fit
                  <select
                    value={printFitMode}
                    onChange={(e) => setPrintFitMode(e.target.value as PrintFitMode)}
                    className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  >
                    <option value="preserve">Preserve full card</option>
                    <option value="crop">Crop into bleed</option>
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Offset X
                  <input
                    type="number"
                    step={0.1}
                    value={offsetXmm}
                    onChange={(e) => setOffsetXmm(Number(e.target.value))}
                    className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  />
                  mm
                </label>

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Offset Y
                  <input
                    type="number"
                    step={0.1}
                    value={offsetYmm}
                    onChange={(e) => setOffsetYmm(Number(e.target.value))}
                    className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  />
                  mm
                </label>

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Rotation
                  <select
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value) as DirectPokerRotation)}
                    className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  >
                    <option value={0}>0</option>
                    <option value={90}>90</option>
                    <option value={180}>180</option>
                    <option value={270}>270</option>
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Raster
                  <select
                    value={directPrintRasterPreset}
                    onChange={(e) => setDirectPrintRasterPreset(e.target.value as DirectPrintRasterPreset)}
                    className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  >
                    <option value="fast">Fast — 240 dpi — layout/test</option>
                    <option value="standard">Standard — 300 dpi — recommended for A4</option>
                    <option value="high">High — 360 dpi — recommended for direct poker</option>
                    <option value="ultra">Ultra — 600 dpi — max quality, slower printing</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-font-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calibrationMode}
                    onChange={(e) => setCalibrationMode(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border accent-bg-accent"
                  />
                  Calibration mode
                </label>

                <label className="flex items-center gap-2 text-xs text-font-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDirectPrintGuides}
                    onChange={(e) => setShowDirectPrintGuides(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border accent-bg-accent"
                  />
                  Show guides
                </label>

                {printFitMode === 'crop' && (
                  <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                    Bleed
                    <input
                      type="number"
                      min={0}
                      max={5}
                      step={0.5}
                      value={bleed}
                      onChange={(e) => setBleed(Math.max(0, Number(e.target.value)))}
                      className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                    />
                    mm
                  </label>
                )}
              </>
            )}

            {/* Paper */}
            {outputMode === 'a4-sheet' && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Paper
                  <select
                    value={paperPreset}
                    onChange={(e) => setPaperPreset(e.target.value as PaperPreset)}
                    className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  >
                    <option value="a4">A4</option>
                    <option value="a5">A5</option>
                    <option value="a6">A6</option>
                    <option value="letter">Letter</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Orientation
                  <select
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value as Orientation)}
                    className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
              </>
            )}

            {outputMode === 'a4-sheet' && (
              <>
                {paperPreset === 'custom' && (
                  <>
                    <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                      W
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={customWidth}
                        onChange={(e) => setCustomWidth(Number(e.target.value))}
                        className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                      H
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={customHeight}
                        onChange={(e) => setCustomHeight(Number(e.target.value))}
                        className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                      />
                    </label>
                  </>
                )}

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Grid
                  <select
                    value={gridPreset}
                    onChange={(e) => setGridPreset(e.target.value as GridPreset)}
                    className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  >
                    <option value="3x3">3x3</option>
                    <option value="4x2">4x2</option>
                    <option value="5x2">5x2</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                {gridPreset === 'custom' && (
                  <>
                    <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                      Cols
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={customCols}
                        onChange={(e) => setCustomCols(Number(e.target.value))}
                        className="w-14 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                      Rows
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={customRows}
                        onChange={(e) => setCustomRows(Number(e.target.value))}
                        className="w-14 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                      />
                    </label>
                  </>
                )}

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Gap X
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    value={gapX}
                    onChange={(e) => setGapX(Math.max(0, Number(e.target.value)))}
                    className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  />
                  mm
                </label>

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Gap Y
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    value={gapY}
                    onChange={(e) => setGapY(Math.max(0, Number(e.target.value)))}
                    className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  />
                  mm
                </label>

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

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Bleed mode
                  <select
                    value={bleedMode}
                    onChange={(e) => setBleedMode(e.target.value as BleedMode)}
                    className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  >
                    <option value="preserve">Preserve full card</option>
                    <option value="crop">Crop into bleed</option>
                    <option value="none">No bleed</option>
                  </select>
                </label>

                <label className={`flex items-center gap-1.5 text-xs text-font-secondary ${bleedMode === 'none' ? 'opacity-50' : ''}`}>
                  Bleed
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={bleed}
                    disabled={bleedMode === 'none'}
                    onChange={(e) => setBleed(Math.max(0, Number(e.target.value)))}
                    className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  />
                  mm
                </label>

                <label className="flex items-center gap-1.5 text-xs text-font-secondary">
                  Raster
                  <select
                    value={printRasterPreset}
                    onChange={(e) => setPrintRasterPreset(e.target.value as PrintRasterPreset)}
                    className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
                  >
                    <option value="fast">Fast — 240 dpi — layout/test</option>
                    <option value="standard">Standard — 300 dpi — recommended for A4</option>
                    <option value="high">High — 360 dpi — recommended for direct poker</option>
                    <option value="ultra">Ultra — 600 dpi — max quality, slower printing</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-font-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cutGuides}
                    onChange={(e) => setCutGuides(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border accent-bg-accent"
                  />
                  Cut guides
                </label>

                <label className="flex items-center gap-2 text-xs text-font-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={debugLayout}
                    onChange={(e) => setDebugLayout(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border accent-bg-accent"
                  />
                  Debug layout
                </label>
              </>
            )}
          </div>

          {gapWarning && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Gap too small for selected bleed: bleed areas may overlap.</span>
            </div>
          )}

          {((outputMode === 'a4-sheet' && bleedMode === 'crop') || (outputMode === 'direct-poker' && printFitMode === 'crop')) && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>This mode may crop card edges.</span>
            </div>
          )}

          {skipWarning > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {skipWarning} image{skipWarning === 1 ? '' : 's'} failed to download from Scryfall and were skipped.
                The PDF is incomplete — tap Generate again to retry.
              </span>
            </div>
          )}
          </div>
        </div>

        {/* Pinned action bar — always visible regardless of options bar height */}
        <div className="shrink-0 border-t border-border bg-bg-surface px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={openPreview}
              disabled={!canGenerate}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-bg-accent px-4 py-2.5 text-sm font-bold text-font-white transition-colors hover:bg-bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer size={16} />
              Preview PDF
            </button>
            {canShareFiles && (
              <button
                onClick={handleShare}
                disabled={generating || !canGenerate}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-bg-accent/60 bg-bg-card px-4 py-2.5 text-sm font-bold text-font-accent transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mail size={16} />
                Send via email
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ====== PREVIEW MODAL — full screen grid ====== */}
      {showPreview && (() => {
        const slotsPerPage = Math.max(1, grid.cols * grid.rows)
        const previewPages = Math.max(1, Math.ceil(expandedOrder.length / slotsPerPage))
        const paginated: (Array<{ card: CardRow; board: string } | null>)[] = []
        for (let pi = 0; pi < previewPages; pi++) {
          const start = pi * slotsPerPage
          const slots: Array<{ card: CardRow; board: string } | null> = []
          for (let si = 0; si < slotsPerPage; si++) {
            const idx = start + si
            slots.push(idx < expandedOrder.length ? expandedOrder[idx] : null)
          }
          paginated.push(slots)
        }
        const gridGapXPx = Math.max(4, gapX * 2)
        const gridGapYPx = Math.max(4, gapY * 2)

        return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-bg-dark" onClick={closePreview}>
          {/* Header */}
          <div className="flex items-center justify-between shrink-0 border-b border-border bg-bg-surface px-3 py-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <button onClick={closePreview} className="rounded p-1 text-font-muted hover:bg-bg-hover hover:text-font-primary">
                <X size={18} />
              </button>
              <h2 className="text-sm font-bold text-font-primary">Preview & Order</h2>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-font-muted">
              <span>{expandedOrder.length} card{expandedOrder.length !== 1 ? 's' : ''} · {previewPages} page{previewPages !== 1 ? 's' : ''}</span>
              <span className="hidden sm:inline">{grid.cols}×{grid.rows} · gap {gapX}/{gapY} mm</span>
            </div>
          </div>

          {/* Grid area */}
          <div className="flex-1 min-h-0 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {expandedOrder.length === 0 ? (
              <p className="text-sm text-font-muted text-center py-16">No cards selected.</p>
            ) : (
              <div className="flex flex-col items-center gap-8 py-4 px-1 sm:px-4">
                {paginated.map((slots, pageIdx) => (
                  <div key={pageIdx} className="flex flex-col items-center w-full max-w-[1600px]">
                    <span className="text-[10px] font-semibold text-font-muted mb-2 tracking-wide">
                      PAGE {pageIdx + 1} OF {previewPages}
                    </span>
                    <div
                      className="grid justify-center"
                      style={{
                        gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
                        gap: `${gridGapYPx}px ${gridGapXPx}px`,
                        width: '100%',
                      }}
                    >
                      {slots.map((slot, slotIdx) => {
                        const globalIdx = pageIdx * slotsPerPage + slotIdx
                        const isDragging = dragSlot === globalIdx
                        const isDragOver = dragOverSlot === globalIdx
                        if (!slot) {
                          return (
                            <div
                              key={`empty-${slotIdx}`}
                              className="aspect-[63/88] rounded border border-dashed border-border/20 bg-bg-cell/10"
                            />
                          )
                        }
                        const backImage = getBackFaceImage(slot.card)
                        const slotKey = `${slot.card.id}-${globalIdx}`
                        const isFlipped = flippedCards.has(slotKey)
                        const imageSrc = isFlipped && backImage ? backImage : slot.card.image_small
                        return (
                          <div
                            key={slotKey}
                            draggable
                            onDragStart={() => handleDragStart(globalIdx)}
                            onDragOver={(e) => handleDragOver(e, globalIdx)}
                            onDragLeave={handleDragLeave}
                            onDrop={() => handleDrop(globalIdx)}
                            onDragEnd={handleDragEnd}
                            className={`relative aspect-[63/88] rounded overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
                              isDragging ? 'opacity-30 scale-95 border-bg-accent' :
                              isDragOver ? 'border-bg-accent ring-2 ring-bg-accent/50 scale-[1.02]' :
                              'border-transparent hover:border-border/50'
                            }`}
                            style={{ touchAction: 'none' }}
                          >
                            {imageSrc ? (
                              <img src={imageSrc} alt={slot.card.name} className="w-full h-full object-cover" draggable={false} loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-bg-cell p-1">
                                <span className="text-[9px] text-font-muted text-center leading-tight">{slot.card.name}</span>
                              </div>
                            )}
                            {/* Flip toggle for double-faced cards */}
                            {backImage && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleFlip(slotKey); }}
                                className={`absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-bg-dark/80 text-[8px] font-bold text-font-primary hover:bg-bg-accent hover:text-font-white transition-colors ${
                                  isFlipped ? 'bg-bg-accent/80 text-font-white' : ''
                                }`}
                                title={isFlipped ? 'Show front' : 'Show back'}
                              >
                                ↻
                              </button>
                            )}
                            {/* Position number — top-left */}
                            <div className="absolute top-0.5 left-0.5 flex h-4 min-w-[16px] items-center justify-center rounded bg-bg-dark/70 px-0.5 text-[8px] font-bold text-font-primary/80 backdrop-blur-sm">
                              {globalIdx + 1}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-bg-surface px-3 py-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPreviewPage(Math.max(0, previewPage - 1))}
                  disabled={previewPage === 0}
                  className="rounded p-1 text-font-muted hover:bg-bg-hover hover:text-font-primary disabled:opacity-25"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="text-xs text-font-secondary tabular-nums min-w-[3rem] text-center">
                  {previewPage + 1}/{previewPages}
                </span>
                <button
                  onClick={() => setPreviewPage(Math.min(previewPages - 1, previewPage + 1))}
                  disabled={previewPage >= previewPages - 1}
                  className="rounded p-1 text-font-muted hover:bg-bg-hover hover:text-font-primary disabled:opacity-25"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <span className="hidden sm:inline text-[10px] text-font-muted ml-2">Drag cards to reorder</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating || sendingOrder || expandedOrder.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-bg-accent px-3 py-1.5 text-xs font-bold text-font-white hover:bg-bg-accent/80 disabled:opacity-40"
                >
                  {generating ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-font-white/30 border-t-font-white" />
                  ) : (
                    <Printer size={14} />
                  )}
                  {generating ? 'Generating…' : 'Generate PDF'}
                </button>
                <button
                  onClick={handlePrintOrder}
                  disabled={generating || sendingOrder || expandedOrder.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-font-secondary hover:bg-bg-hover disabled:opacity-40"
                >
                  {sendingOrder ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-font-secondary/30 border-t-font-secondary" />
                  ) : (
                    <Send size={14} />
                  )}
                  {sendingOrder ? 'Sending…' : 'Print at StudioB35'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )})()}
    </div>
  )
}
