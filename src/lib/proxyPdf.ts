import { jsPDF } from 'jspdf'
import {
  computeCardImageLayout,
  computeBleedBoxes,
  computeGridLayout,
  computeLayoutWarnings,
  generateAdjacentGridCutGuides,
  generateCropMarks,
  paginateCards,
  type BleedMode,
  type ImageFitMode,
  type LayoutWarning,
  type Rect,
} from './proxyPdfLayout'

export type { BleedMode } from './proxyPdfLayout'

export interface ProxyPdfOptions {
  paper: PaperOption
  orientation: 'portrait' | 'landscape'
  scale: number     // 0.9, 0.95, 1.0
  bleed: number     // mm added outside the trim line
  gapX: number      // mm between trim boxes
  gapY: number      // mm between trim boxes
  grid: { cols: number; rows: number }
  cutGuides: boolean
  debugLayout?: boolean
  printRasterPreset?: PrintRasterPreset
  bleedMode?: BleedMode
  cards: { imageUrls: string[]; quantity: number }[]
  onProgress?: (done: number, total: number) => void
}

export interface ProxyPdfResult {
  blob: Blob
  skippedUrls: string[]
  layoutWarnings: LayoutWarning[]
}

export type PaperPreset = 'a4' | 'a5' | 'a6' | 'letter' | 'custom'

export interface PaperOption {
  preset: PaperPreset
  width: number
  height: number
}

export type PrintRasterPreset = 'fast' | 'standard' | 'high' | 'ultra'

interface PrintRasterPresetOptions {
  dpi: number
  jpegQuality: number
  maxWidthPx: number
  maxHeightPx: number
  allowUpscale?: boolean
  bleedJpegQuality?: number
}

export interface PrintRasterOptions {
  bleedWmm: number
  bleedHmm: number
  dpi: number
  jpegQuality: number
  maxWidthPx?: number
  maxHeightPx?: number
  allowUpscale?: boolean
  fitMode?: ImageFitMode
  debug?: boolean
}

export const PRINT_RASTER_PRESETS: Record<PrintRasterPreset, PrintRasterPresetOptions> = {
  fast: { dpi: 240, jpegQuality: 0.82, maxWidthPx: 1000, maxHeightPx: 1400 },
  standard: { dpi: 300, jpegQuality: 0.88, maxWidthPx: 1000, maxHeightPx: 1400 },
  high: { dpi: 360, jpegQuality: 0.9, maxWidthPx: 1000, maxHeightPx: 1400 },
  ultra: {
    dpi: 480,
    jpegQuality: 0.95,
    maxWidthPx: 1500,
    maxHeightPx: 2100,
    allowUpscale: false,
    bleedJpegQuality: 0.9,
  },
}

const CARD_W = 63 // mm
const CARD_H = 88 // mm
const FETCH_CONCURRENCY = 6     // stay under browser per-origin cap
const FETCH_RETRIES = 2         // 1 initial + 2 retries
const FETCH_RETRY_BASE_MS = 250
const CROP_MARK_LENGTH = 4
const CROP_MARK_OFFSET = 1
const CROP_MARK_PRINTABLE_INSET = 3
const CROP_MARK_STROKE_PT = 0.2
const CROP_MARK_GRAY = 140
const PT_PER_MM = 72 / 25.4

interface CachedImage {
  bytes: Uint8Array
  alias: string
}

interface CachedCardImages {
  main: CachedImage
  bleed?: CachedImage
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Scryfall URLs are routed through /api/card-image so we hit Vercel's edge
// cache (same as next/image in the card browser) instead of pounding Scryfall
// on every PDF build. Non-Scryfall URLs fall back to a direct fetch.
function toProxyUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === 'cards.scryfall.io') {
      return `/api/card-image?url=${encodeURIComponent(url)}`
    }
  } catch {
    // fall through
  }
  return url
}

export function printRasterDimensions(
  options: PrintRasterOptions,
  sourceWidth?: number,
  sourceHeight?: number,
): { width: number; height: number } {
  const rawWidth = Math.round((options.bleedWmm / 25.4) * options.dpi)
  const rawHeight = Math.round((options.bleedHmm / 25.4) * options.dpi)
  const maxWidth = options.maxWidthPx ?? 1000
  const maxHeight = options.maxHeightPx ?? 1400
  const sourceScale = options.allowUpscale === false && sourceWidth && sourceHeight
    ? Math.min(sourceWidth / rawWidth, sourceHeight / rawHeight, 1)
    : 1
  const maxScale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight, sourceScale, 1)
  return {
    width: Math.max(1, Math.round(rawWidth * maxScale)),
    height: Math.max(1, Math.round(rawHeight * maxScale)),
  }
}

function sourceByteLength(sourceImage: Blob | ArrayBuffer | HTMLImageElement): number {
  if (sourceImage instanceof Blob) return sourceImage.size
  if (sourceImage instanceof ArrayBuffer) return sourceImage.byteLength
  return 0
}

function isHtmlImageElement(sourceImage: Blob | ArrayBuffer | HTMLImageElement): sourceImage is HTMLImageElement {
  return typeof HTMLImageElement !== 'undefined' && sourceImage instanceof HTMLImageElement
}

async function blobFromCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
  if (!blob) throw new Error('Unable to encode optimized card image')
  return blob
}

async function decodeImageElement(sourceImage: Blob | ArrayBuffer | HTMLImageElement): Promise<{
  image: HTMLImageElement
  revokeUrl: (() => void) | null
}> {
  if (isHtmlImageElement(sourceImage)) {
    if (sourceImage.complete && sourceImage.naturalWidth > 0) return { image: sourceImage, revokeUrl: null }
    await sourceImage.decode()
    return { image: sourceImage, revokeUrl: null }
  }

  const blob = sourceImage instanceof Blob ? sourceImage : new Blob([sourceImage])
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'async'
  image.src = url

  try {
    await image.decode()
    return { image, revokeUrl: () => URL.revokeObjectURL(url) }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

export async function optimizeCardImageForPrint(
  sourceImage: Blob | ArrayBuffer | HTMLImageElement,
  options: PrintRasterOptions,
): Promise<Uint8Array> {
  const originalBytes = sourceByteLength(sourceImage)
  const { image, revokeUrl } = await decodeImageElement(sourceImage)
  const originalWidth = image.naturalWidth || image.width
  const originalHeight = image.naturalHeight || image.height
  const { width: optimizedWidth, height: optimizedHeight } = printRasterDimensions(options, originalWidth, originalHeight)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = optimizedWidth
    canvas.height = optimizedHeight
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Unable to create card image raster context')

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, optimizedWidth, optimizedHeight)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const imageRatio = originalWidth / originalHeight
    const targetRatio = optimizedWidth / optimizedHeight
    const fitMode = options.fitMode ?? 'cover'
    const useWidthBound = fitMode === 'contain'
      ? imageRatio > targetRatio
      : imageRatio <= targetRatio
    const drawW = useWidthBound ? optimizedWidth : optimizedHeight * imageRatio
    const drawH = useWidthBound ? optimizedWidth / imageRatio : optimizedHeight
    const drawX = (optimizedWidth - drawW) / 2
    const drawY = (optimizedHeight - drawH) / 2
    ctx.drawImage(image, drawX, drawY, drawW, drawH)

    const jpegBlob = await blobFromCanvas(canvas, options.jpegQuality)
    const optimizedBytes = jpegBlob.size
    if (options.debug && process.env.NODE_ENV !== 'production') {
      console.log({
        originalWidth,
        originalHeight,
        optimizedWidth,
        optimizedHeight,
        originalBytes,
        optimizedBytes,
      })
    }

    return new Uint8Array(await jpegBlob.arrayBuffer())
  } finally {
    revokeUrl?.()
  }
}

async function fetchImageBlob(url: string): Promise<Blob | null> {
  const target = toProxyUrl(url)
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(target, { cache: 'force-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.blob()
    } catch {
      // fall through to retry
    }
    if (attempt < FETCH_RETRIES) await delay(FETCH_RETRY_BASE_MS * (attempt + 1))
  }
  return null
}

async function fetchBestCardImages(
  urls: string[],
  variants: { main: PrintRasterOptions; bleed?: PrintRasterOptions },
  alias: string,
): Promise<CachedCardImages | null> {
  for (const url of urls) {
    const blob = await fetchImageBlob(url)
    if (blob) {
      const mainBytes = await optimizeCardImageForPrint(blob, variants.main)
      const bleedBytes = variants.bleed ? await optimizeCardImageForPrint(blob, variants.bleed) : null
      return {
        main: { bytes: mainBytes, alias: `${alias}-main` },
        bleed: bleedBytes ? { bytes: bleedBytes, alias: `${alias}-bleed` } : undefined,
      }
    }
  }
  return null
}

function pageSize(paper: PaperOption, orientation: ProxyPdfOptions['orientation']): { w: number; h: number } {
  const w = Math.max(1, paper.width)
  const h = Math.max(1, paper.height)
  const short = Math.min(w, h)
  const long = Math.max(w, h)
  return orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long }
}

function drawImageInBox(doc: jsPDF, image: CachedImage, box: Rect): void {
  doc.addImage(image.bytes, 'JPEG', box.x, box.y, box.w, box.h, image.alias, 'FAST')
}

function drawDebugLayout(doc: jsPDF, trimBox: Rect, bleedBox: Rect): void {
  doc.setDrawColor(40, 120, 220)
  doc.setLineWidth(0.15)
  doc.rect(bleedBox.x, bleedBox.y, bleedBox.w, bleedBox.h)
  doc.setDrawColor(220, 40, 40)
  doc.rect(trimBox.x, trimBox.y, trimBox.w, trimBox.h)
}

// Bounded-concurrency map — limits in-flight fetches to avoid CDN throttling
// and browser connection caps that silently fail a fraction of a big batch.
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

export async function generateProxyPdf(options: ProxyPdfOptions): Promise<Blob> {
  const result = await generateProxyPdfWithDetails(options)
  return result.blob
}

export async function generateProxyPdfWithDetails(
  options: ProxyPdfOptions,
): Promise<ProxyPdfResult> {
  const {
    paper,
    orientation,
    scale,
    bleed,
    gapX,
    gapY,
    grid,
    cutGuides,
    debugLayout = false,
    printRasterPreset = 'standard',
    bleedMode = 'preserve',
    cards,
    onProgress,
  } = options
  const page = pageSize(paper, orientation)
  const cardW = CARD_W * scale
  const cardH = CARD_H * scale
  const cols = Math.max(1, Math.floor(grid.cols))
  const rows = Math.max(1, Math.floor(grid.rows))
  const layoutOptions = {
    pageW: page.w,
    pageH: page.h,
    cols,
    rows,
    cardW,
    cardH,
    gapX,
    gapY,
  }
  const trimBoxes = computeGridLayout(layoutOptions)
  const effectiveBleed = bleedMode === 'none' ? 0 : bleed
  const bleedBoxes = computeBleedBoxes(trimBoxes, effectiveBleed)
  const sampleImageLayout = computeCardImageLayout(trimBoxes[0], effectiveBleed, bleedMode)
  const rasterPreset = PRINT_RASTER_PRESETS[printRasterPreset] ?? PRINT_RASTER_PRESETS.standard
  const rasterVariants: { main: PrintRasterOptions; bleed?: PrintRasterOptions } = {
    main: {
      bleedWmm: sampleImageLayout.mainImageDrawBox.w,
      bleedHmm: sampleImageLayout.mainImageDrawBox.h,
      dpi: rasterPreset.dpi,
      jpegQuality: rasterPreset.jpegQuality,
      maxWidthPx: rasterPreset.maxWidthPx,
      maxHeightPx: rasterPreset.maxHeightPx,
      allowUpscale: rasterPreset.allowUpscale,
      fitMode: sampleImageLayout.mainFitMode,
      debug: debugLayout,
    },
  }
  if (sampleImageLayout.bleedImageDrawBox && sampleImageLayout.bleedFitMode) {
    rasterVariants.bleed = {
      bleedWmm: sampleImageLayout.bleedImageDrawBox.w,
      bleedHmm: sampleImageLayout.bleedImageDrawBox.h,
      dpi: rasterPreset.dpi,
      jpegQuality: rasterPreset.bleedJpegQuality ?? Math.min(rasterPreset.jpegQuality, 0.82),
      maxWidthPx: rasterPreset.maxWidthPx,
      maxHeightPx: rasterPreset.maxHeightPx,
      allowUpscale: rasterPreset.allowUpscale,
      fitMode: sampleImageLayout.bleedFitMode,
      debug: debugLayout,
    }
  }
  const layoutWarnings = computeLayoutWarnings({
    ...layoutOptions,
    bleed: effectiveBleed,
    cropMarkLength: CROP_MARK_LENGTH,
    cropMarkOffset: CROP_MARK_OFFSET,
  })

  // Expand cards by quantity
  const expandedKeys: string[] = []
  const imageGroups = new Map<string, string[]>()
  for (const c of cards) {
    const urls = [...new Set(c.imageUrls.filter(Boolean))]
    if (urls.length === 0) continue
    const key = urls.join('|')
    imageGroups.set(key, urls)
    for (let i = 0; i < c.quantity; i++) {
      expandedKeys.push(key)
    }
  }

  // Deduplicate candidate sets for fetching. Each set is ordered by quality,
  // so one card can try PNG first, then large JPG, then normal JPG.
  const uniqueKeys = [...imageGroups.keys()]
  const imageCache = new Map<string, CachedCardImages>()
  let fetched = 0
  const total = uniqueKeys.length

  await mapWithLimit(uniqueKeys, FETCH_CONCURRENCY, async (key) => {
    const image = await fetchBestCardImages(imageGroups.get(key) ?? [], rasterVariants, `proxy-card-${uniqueKeys.indexOf(key)}`)
    if (image) imageCache.set(key, image)
    fetched++
    onProgress?.(fetched, total)
  })

  const skippedUrls = uniqueKeys.filter((key) => !imageCache.has(key)).map((key) => imageGroups.get(key)?.[0] ?? key)
  if (skippedUrls.length > 0) {
    console.warn(`[proxyPdf] ${skippedUrls.length}/${uniqueKeys.length} images failed to load`, skippedUrls)
  }

  const validCards = expandedKeys.filter((key) => imageCache.has(key))
  if (validCards.length === 0) {
    throw new Error('No card images available')
  }

  const doc = new jsPDF({ orientation, unit: 'mm', format: [page.w, page.h] })

  const perPage = cols * rows

  const pages = paginateCards(validCards, perPage)

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    if (pageIndex > 0) doc.addPage()
    const pageCards = pages[pageIndex]

    for (let slotIndex = 0; slotIndex < pageCards.length; slotIndex++) {
      const trimBox = trimBoxes[slotIndex]
      const bleedBox = bleedBoxes[slotIndex]
      const imageLayout = computeCardImageLayout(trimBox, effectiveBleed, bleedMode)
      const images = imageCache.get(pageCards[slotIndex])!
      if (images.bleed && imageLayout.bleedImageDrawBox) {
        drawImageInBox(doc, images.bleed, imageLayout.bleedImageDrawBox)
      }
      drawImageInBox(doc, images.main, imageLayout.mainImageDrawBox)
      if (debugLayout) {
        drawDebugLayout(doc, trimBox, bleedBox)
      }
    }

    if (cutGuides) {
      const occupiedTrimBoxes = trimBoxes.slice(0, pageCards.length)
      const cropMarks = layoutOptions.gapX <= 0 && layoutOptions.gapY <= 0
        ? generateAdjacentGridCutGuides(occupiedTrimBoxes, layoutOptions, {
          offset: CROP_MARK_OFFSET,
          printableInset: CROP_MARK_PRINTABLE_INSET,
        })
        : generateCropMarks(occupiedTrimBoxes, layoutOptions, {
          length: CROP_MARK_LENGTH,
          offset: CROP_MARK_OFFSET,
          printableInset: CROP_MARK_PRINTABLE_INSET,
        })
      doc.setDrawColor(CROP_MARK_GRAY)
      doc.setLineWidth(CROP_MARK_STROKE_PT / PT_PER_MM)
      for (const mark of cropMarks) {
        doc.line(mark.x1, mark.y1, mark.x2, mark.y2)
      }
    }
  }

  return { blob: doc.output('blob'), skippedUrls, layoutWarnings }
}
