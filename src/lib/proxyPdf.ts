import { jsPDF } from 'jspdf'

export interface ProxyPdfOptions {
  paper: 'a4' | 'letter'
  gap: number       // mm
  scale: number     // 0.9, 0.95, 1.0
  cards: { imageUrl: string; quantity: number }[]
  onProgress?: (done: number, total: number) => void
}

const CARD_W = 63 // mm
const CARD_H = 88 // mm
const COLS = 3
const ROWS = 3

const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generateProxyPdf(options: ProxyPdfOptions): Promise<Blob> {
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

  // Fetch all unique images
  await Promise.all(
    uniqueUrls.map(async (url) => {
      const data = await fetchImageAsBase64(url)
      if (data) imageCache.set(url, data)
      fetched++
      onProgress?.(fetched, total)
    })
  )

  // Filter to cards that have images
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

  return doc.output('blob')
}
