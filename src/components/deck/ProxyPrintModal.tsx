'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { X, Printer, CheckSquare, Square, AlertTriangle, Send } from 'lucide-react'
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
  isFoil?: boolean
}

interface ProxyPrintModalProps {
  deckId: string
  deckName: string
  cards: CardEntry[]
  userName: string
  userEmail: string
  /** Current deck visibility. If the owner submits a print order while
   *  the deck is still 'private', the modal silently promotes it to
   *  'unlisted' before posting so StudioB35 can actually open the
   *  share link from the email. */
  currentVisibility?: 'private' | 'unlisted' | 'public'
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

type PrintPresetId =
  | 'epic'
  | 'ultra'
  | 'high'
  | 'standard'
  | 'ultra-spaced'
  | 'high-spaced'
  | 'standard-spaced'
  | 'direct-poker'

interface PrintPresetConfig {
  id: PrintPresetId
  label: string
  hint: string
  values: {
    outputMode: OutputMode
    paperPreset?: PaperPreset
    orientation?: Orientation
    gridPreset?: GridPreset
    scale?: ScaleOption
    bleed?: number
    bleedMode?: BleedMode
    gapX?: number
    gapY?: number
    cutGuides?: boolean
    printRasterPreset?: PrintRasterPreset
    printFitMode?: PrintFitMode
    rotation?: DirectPokerRotation
    directPrintRasterPreset?: DirectPrintRasterPreset
  }
}

const PRINT_PRESETS: PrintPresetConfig[] = [
  {
    id: 'epic',
    label: 'Epic · 4x on demand',
    hint: 'Massima definizione. Genera immagini 4x al volo e richiede piu tempo.',
    values: {
      outputMode: 'a4-sheet',
      paperPreset: 'a4',
      orientation: 'portrait',
      gridPreset: '3x3',
      scale: 100,
      bleed: 0,
      bleedMode: 'preserve',
      gapX: 0.1,
      gapY: 0.1,
      cutGuides: true,
      printRasterPreset: 'epic',
    },
  },
  {
    id: 'ultra',
    label: 'Ultra · senza spaziatura',
    hint: 'Massima qualità, taglio facile. A4 3×3, 0 bleed, gap 0,1mm.',
    values: {
      outputMode: 'a4-sheet',
      paperPreset: 'a4',
      orientation: 'portrait',
      gridPreset: '3x3',
      scale: 100,
      bleed: 0,
      bleedMode: 'preserve',
      gapX: 0.1,
      gapY: 0.1,
      cutGuides: true,
      printRasterPreset: 'ultra',
    },
  },
  {
    id: 'high',
    label: 'High · senza spaziatura',
    hint: 'Inkjet casa, taglio righello. A4 3×3, 0 bleed, gap 0,1mm.',
    values: {
      outputMode: 'a4-sheet',
      paperPreset: 'a4',
      orientation: 'portrait',
      gridPreset: '3x3',
      scale: 100,
      bleed: 0,
      bleedMode: 'preserve',
      gapX: 0.1,
      gapY: 0.1,
      cutGuides: true,
      printRasterPreset: 'high',
    },
  },
  {
    id: 'standard',
    label: 'Standard · senza spaziatura',
    hint: 'Bozza veloce. A4 3×3, 0 bleed, gap 0,1mm.',
    values: {
      outputMode: 'a4-sheet',
      paperPreset: 'a4',
      orientation: 'portrait',
      gridPreset: '3x3',
      scale: 100,
      bleed: 0,
      bleedMode: 'preserve',
      gapX: 0.1,
      gapY: 0.1,
      cutGuides: true,
      printRasterPreset: 'standard',
    },
  },
  {
    id: 'ultra-spaced',
    label: 'Ultra · con spaziatura',
    hint: 'Taglierina pro. A4 3×3, 1mm bleed, gap 2mm.',
    values: {
      outputMode: 'a4-sheet',
      paperPreset: 'a4',
      orientation: 'portrait',
      gridPreset: '3x3',
      scale: 100,
      bleed: 1,
      bleedMode: 'preserve',
      gapX: 2,
      gapY: 2,
      cutGuides: true,
      printRasterPreset: 'ultra',
    },
  },
  {
    id: 'high-spaced',
    label: 'High · con spaziatura',
    hint: 'Taglierina pro, alta qualità. A4 3×3, 1mm bleed, gap 2mm.',
    values: {
      outputMode: 'a4-sheet',
      paperPreset: 'a4',
      orientation: 'portrait',
      gridPreset: '3x3',
      scale: 100,
      bleed: 1,
      bleedMode: 'preserve',
      gapX: 2,
      gapY: 2,
      cutGuides: true,
      printRasterPreset: 'high',
    },
  },
  {
    id: 'standard-spaced',
    label: 'Standard · con spaziatura',
    hint: 'Taglierina pro, qualità base. A4 3×3, 1mm bleed, gap 2mm.',
    values: {
      outputMode: 'a4-sheet',
      paperPreset: 'a4',
      orientation: 'portrait',
      gridPreset: '3x3',
      scale: 100,
      bleed: 1,
      bleedMode: 'preserve',
      gapX: 2,
      gapY: 2,
      cutGuides: true,
      printRasterPreset: 'standard',
    },
  },
  {
    id: 'direct-poker',
    label: 'Direct Poker · stampante carte',
    hint: 'Canon Selphy / stampanti card-size 63×88. Ultra raster, no bleed.',
    values: {
      outputMode: 'direct-poker',
      printFitMode: 'preserve',
      rotation: 0,
      directPrintRasterPreset: 'ultra',
    },
  },
]

const DEFAULT_PRESET_ID: PrintPresetId = 'ultra'
type CardFace = 'front' | 'back'

interface UpscaledImagePrepareItem {
  cardId: string
  scryfallId: string
  face: CardFace
}

interface UpscaledImagePrepareResponse {
  total: number
  cached: number
  queued: number
  disabled: number
  failed: number
}

function isBasicLand(card: CardRow): boolean {
  return (card.type_line ?? '').includes('Basic Land')
}

function cardKey(entry: CardEntry): string {
  return `${entry.card.id}-${entry.board}`
}

function imageUriFromFace(card: CardRow, faceIndex: number, key: 'png' | 'large' | 'normal'): string | null {
  if (!Array.isArray(card.card_faces)) return null
  const face = card.card_faces[faceIndex]
  if (!face || typeof face !== 'object' || Array.isArray(face)) return null
  const imageUris = face.image_uris
  if (!imageUris || typeof imageUris !== 'object' || Array.isArray(imageUris)) return null
  const value = imageUris[key]
  return typeof value === 'string' ? value : null
}

function cardImagePathFace(face: CardFace): string {
  return face === 'back' ? 'back' : 'front'
}

function deriveScryfallImageUrls(card: CardRow, face: CardFace = 'front'): string[] {
  const urls: string[] = []
  const faceIndex = face === 'back' ? 1 : 0
  const facePng = imageUriFromFace(card, faceIndex, 'png')
  const faceLarge = imageUriFromFace(card, faceIndex, 'large')
  const faceNormal = imageUriFromFace(card, faceIndex, 'normal')
  if (facePng) urls.push(facePng)
  if (faceLarge) urls.push(faceLarge)
  const id = card.scryfall_id
  const pathFace = cardImagePathFace(face)
  if (id.length >= 2) {
    urls.push(`https://cards.scryfall.io/png/${pathFace}/${id[0]}/${id[1]}/${id}.png`)
    urls.push(`https://cards.scryfall.io/large/${pathFace}/${id[0]}/${id[1]}/${id}.jpg`)
  }
  if (faceNormal) urls.push(faceNormal)
  if (face === 'front' && card.image_normal) {
    urls.push(card.image_normal)
  }
  return [...new Set(urls)]
}

function upscaled2xImageUrl(card: CardRow, face: CardFace): string {
  const params = new URLSearchParams({
    cardId: String(card.id),
    scryfallId: card.scryfall_id,
    face,
    profile: 'hd-2x',
  })
  return `/api/card-image/upscaled?${params.toString()}`
}

function epicUpscaleImageUrl(sourceUrl: string): string {
  return `/api/card-image/upscale?url=${encodeURIComponent(sourceUrl)}`
}

async function prepareUpscaled2xImages(items: UpscaledImagePrepareItem[]): Promise<UpscaledImagePrepareResponse | null> {
  if (items.length === 0) return null
  const res = await fetch('/api/card-image/upscaled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${res.status}`
    throw new Error(`Ultra image preparation failed: ${error}`)
  }
  return body as UpscaledImagePrepareResponse
}

function deriveProxyImageUrls(
  card: CardRow,
  rasterPreset: PrintRasterPreset | DirectPrintRasterPreset,
  face: CardFace = 'front',
): string[] {
  const scryfallUrls = deriveScryfallImageUrls(card, face)
  const urls: string[] = []
  if (rasterPreset === 'epic' && scryfallUrls[0]) {
    urls.push(epicUpscaleImageUrl(scryfallUrls[0]))
  }
  if (rasterPreset === 'ultra' || rasterPreset === 'epic') {
    urls.push(upscaled2xImageUrl(card, face))
  }
  // ULTRA/EPIC use only upscaled R2 images — no Scryfall fallback.
  // If the upscaled asset isn't ready, the card will be skipped with a warning
  // instead of silently printing at lower quality.
  if (rasterPreset !== 'ultra' && rasterPreset !== 'epic') {
    urls.push(...scryfallUrls)
  }
  return [...new Set(urls)]
}

function getBackFaceImage(card: CardRow): string | null {
  // Only double-faced cards have a back face
  if (!Array.isArray(card.card_faces) || card.card_faces.length < 2) return null
  const backFace = card.card_faces[1]
  if (backFace && typeof backFace === 'object' && !Array.isArray(backFace)) {
    const imageUris = backFace.image_uris
    if (imageUris && typeof imageUris === 'object' && !Array.isArray(imageUris)) {
      // Prefer largest available image
      const large = imageUris.large
      if (typeof large === 'string' && large.length > 0) return large
      const normal = imageUris.normal
      if (typeof normal === 'string' && normal.length > 0) return normal
      const small = imageUris.small
      if (typeof small === 'string' && small.length > 0) return small
    }
  }
  // Fallback: some layouts (dungeon, emblem) store card_faces without
  // full image_uris. Derive back url from scryfall_id.
  const id = card.scryfall_id
  if (id.length >= 2) {
    return `https://cards.scryfall.io/large/back/${id[0]}/${id[1]}/${id}.jpg`
  }
  return null
}

function getPreviewImage(card: CardRow): string | null {
  return card.image_normal || card.image_small
}

export default function ProxyPrintModal({ deckId, deckName, cards, userName, userEmail, currentVisibility, onClose }: ProxyPrintModalProps) {
  const [skipBasicLands, setSkipBasicLands] = useState(true)
  const [presetId, setPresetId] = useState<PrintPresetId>(DEFAULT_PRESET_ID)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [outputMode, setOutputMode] = useState<OutputMode>('a4-sheet')
  const [paperPreset, setPaperPreset] = useState<PaperPreset>('a4')
  const [customWidth, setCustomWidth] = useState(210)
  const [customHeight, setCustomHeight] = useState(297)
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [gridPreset, setGridPreset] = useState<GridPreset>('3x3')
  const [customCols, setCustomCols] = useState(3)
  const [customRows, setCustomRows] = useState(3)
  const [gapX, setGapX] = useState(0.1)
  const [gapY, setGapY] = useState(0.1)
  const [scale, setScale] = useState<ScaleOption>(100)
  const [bleed, setBleed] = useState(0)
  const [bleedMode, setBleedMode] = useState<BleedMode>('preserve')
  const [printFitMode, setPrintFitMode] = useState<PrintFitMode>('preserve')
  const [offsetXmm, setOffsetXmm] = useState(13)
  const [offsetYmm, setOffsetYmm] = useState(0.5)
  const [rotation, setRotation] = useState<DirectPokerRotation>(0)
  const [directPrintRasterPreset, setDirectPrintRasterPreset] = useState<DirectPrintRasterPreset>('high')
  const [calibrationMode, setCalibrationMode] = useState(false)
  const [showDirectPrintGuides, setShowDirectPrintGuides] = useState(false)
  const [printRasterPreset, setPrintRasterPreset] = useState<PrintRasterPreset>('ultra')
  const [cutGuides, setCutGuides] = useState(true)
  const [debugLayout, setDebugLayout] = useState(false)

  const applyPreset = useCallback((id: PrintPresetId) => {
    const preset = PRINT_PRESETS.find((p) => p.id === id)
    if (!preset) return
    setPresetId(id)
    const v = preset.values
    if (v.outputMode !== undefined) setOutputMode(v.outputMode)
    if (v.paperPreset !== undefined) setPaperPreset(v.paperPreset)
    if (v.orientation !== undefined) setOrientation(v.orientation)
    if (v.gridPreset !== undefined) setGridPreset(v.gridPreset)
    if (v.scale !== undefined) setScale(v.scale)
    if (v.bleed !== undefined) setBleed(v.bleed)
    if (v.bleedMode !== undefined) setBleedMode(v.bleedMode)
    if (v.gapX !== undefined) setGapX(v.gapX)
    if (v.gapY !== undefined) setGapY(v.gapY)
    if (v.cutGuides !== undefined) setCutGuides(v.cutGuides)
    if (v.printRasterPreset !== undefined) setPrintRasterPreset(v.printRasterPreset)
    if (v.printFitMode !== undefined) setPrintFitMode(v.printFitMode)
    if (v.rotation !== undefined) setRotation(v.rotation)
    if (v.directPrintRasterPreset !== undefined) setDirectPrintRasterPreset(v.directPrintRasterPreset)
  }, [])
  const [deselected, setDeselected] = useState<Set<string>>(() => {
    const set = new Set<string>()
    for (const entry of cards) {
      const isDeckCard = entry.board === 'main' || entry.board === 'commander'
      if (!isDeckCard || isBasicLand(entry.card)) set.add(cardKey(entry))
    }
    return set
  })
  const [generating, setGenerating] = useState(false)
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'preparing-images' | 'building-pdf'>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set())
  const [showPreview, setShowPreview] = useState(false)
  interface ExpandedSlot {
    card: CardRow
    board: string
    face?: 'front' | 'back'
    isFoil?: boolean
  }
  const [expandedOrder, setExpandedOrder] = useState<ExpandedSlot[]>([])
  const [dragSlot, setDragSlot] = useState<number | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [sendingOrder, setSendingOrder] = useState(false)
  const [orderFeedback, setOrderFeedback] = useState<{ type: 'error'; text: string } | null>(null)
  const [orderSuccess, setOrderSuccess] = useState(false)
  const [skipWarning, setSkipWarning] = useState<number>(0)


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
    const expanded: ExpandedSlot[] = []
    for (const e of selectedCards) {
      const isDfc = Array.isArray(e.card.card_faces) && e.card.card_faces.length >= 2
      for (let i = 0; i < e.quantity; i++) {
        expanded.push({ card: e.card, board: e.board, face: 'front', isFoil: !!e.isFoil })
        if (isDfc) expanded.push({ card: e.card, board: e.board, face: 'back', isFoil: !!e.isFoil })
      }
    }
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

  // Group expanded slots back into entries with quantities for the decklist email.
  // Back-face slots are ignored — they represent the same card as their front sibling.
  // Foil vs non-foil copies of the same card stay on separate lines so the
  // Moxfield-format export carries the correct `*F*` marker per copy.
  const groupExpandedToEntries = useCallback(
    (slots: ExpandedSlot[]): CardEntry[] => {
      const grouped: CardEntry[] = []
      for (const slot of slots) {
        if (slot.face === 'back') continue
        const last = grouped[grouped.length - 1]
        if (
          last
          && last.card.id === slot.card.id
          && last.board === slot.board
          && !!last.isFoil === !!slot.isFoil
        ) {
          last.quantity++
        } else {
          grouped.push({ card: slot.card, quantity: 1, board: slot.board, isFoil: !!slot.isFoil })
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
    // Moxfield import line format:
    //   `{qty} {name} ({SET}) {collector_number}{ *F* if foil}`
    // Set + CN come from the `cards` table (already populated by the bulk
    // Scryfall sync). Foil flag travels with each deck_card row.
    for (const entry of entries) {
      const setCode = (entry.card.set_code ?? '').toUpperCase()
      const cn = entry.card.collector_number ?? ''
      const foilSuffix = entry.isFoil ? ' *F*' : ''
      const lineParts = [`${entry.quantity} ${entry.card.name}`]
      if (setCode) lineParts.push(`(${setCode})`)
      if (cn) lineParts.push(cn)
      const line = `${lineParts.join(' ')}${foilSuffix}`
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
  const activeRasterPreset = outputMode === 'direct-poker' ? directPrintRasterPreset : printRasterPreset
  const usesEpicRaster = activeRasterPreset === 'epic'

  const buildPdfBlob = useCallback(async (): Promise<{ blob: Blob; skippedCount: number } | null> => {
    const sourceCards = showPreview ? expandedOrder : selectedCards
    const rasterPresetForImages = outputMode === 'direct-poker' ? directPrintRasterPreset : printRasterPreset
    if (rasterPresetForImages === 'ultra' || rasterPresetForImages === 'epic') {
      const prepareItems = new Map<string, UpscaledImagePrepareItem>()
      const addPrepareItem = (card: CardRow, face: CardFace) => {
        if (!card.scryfall_id) return
        prepareItems.set(`${card.id}:${face}`, {
          cardId: String(card.id),
          scryfallId: card.scryfall_id,
          face,
        })
      }

      if (showPreview) {
        for (const slot of sourceCards as ExpandedSlot[]) {
          addPrepareItem(slot.card, slot.face === 'back' ? 'back' : 'front')
        }
      } else {
        for (const entry of sourceCards as CardEntry[]) {
          addPrepareItem(entry.card, 'front')
        }
      }

      if (prepareItems.size > 0) {
        setGenerationPhase('preparing-images')
        setProgress({ done: 0, total: prepareItems.size })
        try {
          const prepared = await prepareUpscaled2xImages([...prepareItems.values()])
          if (prepared?.failed) {
            console.warn('[proxy-generate] Ultra image preparation failed for some cards', prepared)
          }
        } catch (err) {
          console.warn('[proxy-generate] Ultra image preparation unavailable; falling back to source images', err)
        }
      }
    }

    setGenerationPhase('building-pdf')
    const cardsWithImages = showPreview
      ? (sourceCards as ExpandedSlot[]).map((s) => ({
          imageUrls: s.face === 'back'
            ? deriveProxyImageUrls(s.card, rasterPresetForImages, 'back')
            : deriveProxyImageUrls(s.card, rasterPresetForImages, 'front'),
          quantity: 1,
        }))
      : (sourceCards as CardEntry[])
          .map((e) => ({ imageUrls: deriveProxyImageUrls(e.card, rasterPresetForImages), quantity: e.quantity }))
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
    setGenerationPhase('idle')
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
      setGenerationPhase('idle')
      setGenerating(false)
    }
  }, [buildPdfBlob, deckName, onClose])


  const handlePrintOrder = useCallback(async () => {
    setSendingOrder(true)
    setOrderFeedback(null)
    try {
      const sourceCards = showPreview ? expandedOrder : selectedCards
      const entries = showPreview
        ? groupExpandedToEntries(sourceCards as ExpandedSlot[])
        : (sourceCards as CardEntry[])
      const decklist = buildMoxfieldDecklist(entries)
      const shareLink = `${window.location.origin}/decks/${deckId}`

      // If the owner is shipping a still-private deck, silently promote
      // it to 'unlisted' so the link in the email actually opens for
      // StudioB35. The API rejects the patch if the caller is not the
      // owner — non-owner visitors only ever reach this code path with
      // an already-shareable deck (RLS gates the page).
      if (currentVisibility === 'private') {
        await fetch(`/api/decks/${deckId}/visibility`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility: 'unlisted' }),
        }).catch(() => {
          // Best-effort — if promotion fails the email still goes out
          // with the existing link, just with a broken share for the
          // recipient. We surface the order error below if Resend
          // itself rejects.
        })
      }

      const res = await fetch('/api/print-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName,
          userEmail,
          deckName,
          decklist,
          shareLink,
          timestamp: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        const msg = (err as { error?: string }).error ?? `HTTP ${res.status}`
        throw new Error(msg)
      }
      setOrderSuccess(true)
    } catch (err) {
      console.error('[print-order]', err)
      const text = err instanceof Error ? err.message : 'Errore sconosciuto durante invio ordine.'
      setOrderFeedback({ type: 'error', text })
    } finally {
      setSendingOrder(false)
    }
  }, [buildMoxfieldDecklist, groupExpandedToEntries, deckId, deckName, userName, userEmail, currentVisibility, onClose, showPreview, expandedOrder, selectedCards])

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
                    const imageSrc = showBack ? backImage : getPreviewImage(entry.card)
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
              Preset
              <select
                value={presetId}
                onChange={(e) => applyPreset(e.target.value as PrintPresetId)}
                className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
              >
                {PRINT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-1.5 text-[11px] text-font-muted">
            {PRINT_PRESETS.find((p) => p.id === presetId)?.hint}
          </p>

          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-bold text-font-secondary hover:text-font-primary"
              aria-expanded={advancedOpen}
            >
              <span className={`inline-block transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>▶</span>
              Avanzate
              <span className="ml-1 text-[10px] font-normal text-font-muted">
                ({advancedOpen ? 'nascondi' : 'mostra'} parametri manuali)
              </span>
            </button>
          </div>

          {advancedOpen && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
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
                    <option value="epic">Epic — 4x on demand — very slow</option>
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
                      step={0.01}
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
                    step={0.01}
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
                    <option value="epic">Epic — 4x on demand — very slow</option>
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
          )}

          {gapWarning && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Gap too small for selected bleed: bleed areas may overlap.</span>
            </div>
          )}

          {usesEpicRaster && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Epic genera immagini 4x on demand: il processo richiedera diverso tempo. Se non serve il massimo dettaglio, passa a Ultra.</span>
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
                {skipWarning} image{skipWarning === 1 ? '' : 's'} failed to download from the available sources and were skipped.
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
          </div>
        </div>
      </div>

      {/* ====== PREVIEW MODAL — full screen grid ====== */}
      {showPreview && (() => {
        const slotsPerPage = Math.max(1, grid.cols * grid.rows)
        const previewPages = Math.max(1, Math.ceil(expandedOrder.length / slotsPerPage))
        const paginated: (Array<ExpandedSlot | null>)[] = []
        for (let pi = 0; pi < previewPages; pi++) {
          const start = pi * slotsPerPage
          const slots: Array<ExpandedSlot | null> = []
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
                  <div key={pageIdx} className="flex flex-col items-center w-full">
                    <span className="text-[10px] font-semibold text-font-muted mb-2 tracking-wide">
                      PAGE {pageIdx + 1} OF {previewPages}
                    </span>
                    <div
                      className="grid justify-center mx-auto"
                      style={{
                        gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 260px))`,
                        gap: `${gridGapYPx}px ${gridGapXPx}px`,
                        maxWidth: `${grid.cols * 260 + (grid.cols - 1) * gridGapXPx}px`,
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
                        const isBackFace = slot.face === 'back'
                        const imageSrc = isBackFace
                          ? getBackFaceImage(slot.card)
                          : getPreviewImage(slot.card)
                        return (
                          <div
                            key={`${slot.card.id}-${slot.face || 'front'}-${globalIdx}`}
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
                            {/* Position number + back label */}
                            <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5">
                              <span className="flex h-4 min-w-[16px] items-center justify-center rounded bg-bg-dark/70 px-0.5 text-[8px] font-bold text-font-primary/80 backdrop-blur-sm">
                                {globalIdx + 1}
                              </span>
                              {isBackFace && (
                                <span className="flex h-4 items-center rounded bg-bg-accent/70 px-1 text-[7px] font-bold text-font-white backdrop-blur-sm">
                                  BACK
                                </span>
                              )}
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
            {orderFeedback && (
              <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {orderFeedback.text}
              </div>
            )}
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
                  {generating
                    ? generationPhase === 'preparing-images' ? 'Preparing Ultra...' : 'Generating...'
                    : 'Generate PDF'}
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
                  {sendingOrder
                    ? 'Sending...'
                    : 'Stampa con servizio proxy Adunata!'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )})()}

      {orderSuccess && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4"
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl border border-border bg-bg-surface p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-bold text-font-primary">
              Grazie!
            </h2>
            <p className="mb-2 text-sm text-font-secondary">
              Abbiamo inoltrato la richiesta al nostro laboratorio. Nelle
              prossime ore riceverai una risposta per email su tempi e costi.
            </p>
            <p className="mb-5 text-base font-bold text-font-accent">
              Intanto... ADUNATAAAAAAAAAA!
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-bg-accent px-4 py-2.5 text-sm font-bold text-font-white transition-colors hover:bg-bg-accent/80"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
