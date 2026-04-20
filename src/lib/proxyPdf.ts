import { jsPDF } from 'jspdf'

export interface ProxyPdfOptions {
  paper: 'a4' | 'letter'
  gap: number       // mm
  scale: number     // 0.9, 0.95, 1.0
  cards: { imageUrl: string; quantity: number }[]
  onProgress?: (done: number, total: number) => void
}

export interface ProxyPdfResult {
  blob: Blob
  skippedUrls: string[]
}

const CARD_W = 63 // mm
const CARD_H = 88 // mm
const COLS = 3
const ROWS = 3
const FETCH_CONCURRENCY = 6     // stay under browser per-origin cap
const FETCH_RETRIES = 2         // 1 initial + 2 retries
const FETCH_RETRY_BASE_MS = 250

const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { cache: 'force-cache' })
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
  const { paper, gap, scale, cards, onProgress } = options
  const page = PAGE_SIZES[paper]
  const cardW = CARD_W * scale
  const cardH = CARD_H * scale

  // Expand cards by quantity
  const expandedUrls: string[] = []
  for (const c of cards) {
    for (let i = 0; i < c.quantity; i++) {
      expandedUrls.push(c.imageUrl)
    }
  }

  // Deduplicate URLs for fetching
  const uniqueUrls = [...new Set(expandedUrls)]
  const imageCache = new Map<string, string>()
  let fetched = 0
  const total = uniqueUrls.length

  await mapWithLimit(uniqueUrls, FETCH_CONCURRENCY, async (url) => {
    const data = await fetchImageAsBase64(url)
    if (data) imageCache.set(url, data)
    fetched++
    onProgress?.(fetched, total)
  })

  const skippedUrls = uniqueUrls.filter((url) => !imageCache.has(url))
  if (skippedUrls.length > 0) {
    console.warn(`[proxyPdf] ${skippedUrls.length}/${uniqueUrls.length} images failed to load`, skippedUrls)
  }

  const validCards = expandedUrls.filter((url) => imageCache.has(url))
  if (validCards.length === 0) {
    throw new Error('No card images available')
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: paper })

  const perPage = COLS * ROWS
  const totalGridW = COLS * cardW + (COLS - 1) * gap
  const totalGridH = ROWS * cardH + (ROWS - 1) * gap
  const marginX = (page.w - totalGridW) / 2
  const marginY = (page.h - totalGridH) / 2

  for (let i = 0; i < validCards.length; i++) {
    if (i > 0 && i % perPage === 0) {
      doc.addPage()
    }
    const posOnPage = i % perPage
    const col = posOnPage % COLS
    const row = Math.floor(posOnPage / COLS)
    const x = marginX + col * (cardW + gap)
    const y = marginY + row * (cardH + gap)

    const dataUrl = imageCache.get(validCards[i])!
    doc.addImage(dataUrl, 'JPEG', x, y, cardW, cardH)
  }

  return { blob: doc.output('blob'), skippedUrls }
}
