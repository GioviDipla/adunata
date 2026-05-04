import { jsPDF } from 'jspdf'
import {
  computeBleedBoxes,
  computeGridLayout,
  computeLayoutWarnings,
  generateCropMarks,
  paginateCards,
  type LayoutWarning,
  type Rect,
} from './proxyPdfLayout'

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

const CARD_W = 63 // mm
const CARD_H = 88 // mm
const FETCH_CONCURRENCY = 6     // stay under browser per-origin cap
const FETCH_RETRIES = 2         // 1 initial + 2 retries
const FETCH_RETRY_BASE_MS = 250
const CROP_MARK_LENGTH = 2.5
const CROP_MARK_OFFSET = 1.2
const CROP_MARK_STROKE_PT = 0.2
const CROP_MARK_GRAY = 140
const PT_PER_MM = 72 / 25.4

interface CachedImage {
  dataUrl: string
  width: number
  height: number
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

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const target = toProxyUrl(url)
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(target, { cache: 'force-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
      if (dataUrl) return dataUrl
    } catch {
      // fall through to retry
    }
    if (attempt < FETCH_RETRIES) await delay(FETCH_RETRY_BASE_MS * (attempt + 1))
  }
  return null
}

async function fetchBestImage(urls: string[]): Promise<CachedImage | null> {
  for (const url of urls) {
    const dataUrl = await fetchImageAsDataUrl(url)
    if (dataUrl) {
      return { dataUrl, ...imageSize(dataUrl) }
    }
  }
  return null
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}

function pageSize(paper: PaperOption, orientation: ProxyPdfOptions['orientation']): { w: number; h: number } {
  const w = Math.max(1, paper.width)
  const h = Math.max(1, paper.height)
  const short = Math.min(w, h)
  const long = Math.max(w, h)
  return orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  )
}

function base64Bytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function imageSize(dataUrl: string): { width: number; height: number } {
  const bytes = base64Bytes(dataUrl)
  if (dataUrl.startsWith('data:image/png')) {
    return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) }
  }

  for (let i = 2; i < bytes.length - 9;) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    const length = bytes[i + 2] * 256 + bytes[i + 3]
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes[i + 5] * 256 + bytes[i + 6],
        width: bytes[i + 7] * 256 + bytes[i + 8],
      }
    }
    i += 2 + length
  }

  return { width: 745, height: 1040 }
}

function drawImageCover(doc: jsPDF, image: CachedImage, box: Rect): void {
  const imageRatio = image.width / image.height
  const boxRatio = box.w / box.h
  const drawW = imageRatio > boxRatio ? box.h * imageRatio : box.w
  const drawH = imageRatio > boxRatio ? box.h : box.w / imageRatio
  const drawX = box.x - (drawW - box.w) / 2
  const drawY = box.y - (drawH - box.h) / 2

  doc.addImage(image.dataUrl, imageFormat(image.dataUrl), drawX, drawY, drawW, drawH)
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
  const { paper, orientation, scale, bleed, gapX, gapY, grid, cutGuides, debugLayout = false, cards, onProgress } = options
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
  const bleedBoxes = computeBleedBoxes(trimBoxes, bleed)
  const layoutWarnings = computeLayoutWarnings({
    ...layoutOptions,
    bleed,
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
  const imageCache = new Map<string, CachedImage>()
  let fetched = 0
  const total = uniqueKeys.length

  await mapWithLimit(uniqueKeys, FETCH_CONCURRENCY, async (key) => {
    const image = await fetchBestImage(imageGroups.get(key) ?? [])
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
      const image = imageCache.get(pageCards[slotIndex])!
      drawImageCover(doc, image, bleedBox)
      if (debugLayout) {
        drawDebugLayout(doc, trimBox, bleedBox)
      }
    }

    if (cutGuides) {
      const occupiedTrimBoxes = trimBoxes.slice(0, pageCards.length)
      const cropMarks = generateCropMarks(occupiedTrimBoxes, layoutOptions, {
        length: CROP_MARK_LENGTH,
        offset: CROP_MARK_OFFSET,
        extendOuterToPageEdge: true,
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
