import { jsPDF, type TextOptionsLight } from 'jspdf'
import {
  computeCardImageLayout,
  computeBleedBoxes,
  computeDirectPokerImageBox,
  computeDirectPokerTrimBox,
  computeGridLayout,
  computeLayoutWarnings,
  generateAdjacentGridCutGuides,
  generateCropMarks,
  paginateCards,
  type BleedMode,
  type ImageFitMode,
  type LayoutWarning,
  type PrintFitMode,
  type Rect,
} from './proxyPdfLayout'

export type { BleedMode, PrintFitMode } from './proxyPdfLayout'

export type OutputMode = 'a4-sheet' | 'direct-poker'
export type DirectPrintRasterPreset = 'fast' | 'standard' | 'high' | 'ultra' | 'epic'
export type DirectPokerRotation = 0 | 90 | 180 | 270

export interface ProxyPdfOptions {
  outputMode?: OutputMode
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
  printFitMode?: PrintFitMode
  offsetXmm?: number
  offsetYmm?: number
  rotation?: DirectPokerRotation
  calibrationMode?: boolean
  showDirectPrintGuides?: boolean
  directPrintRasterPreset?: DirectPrintRasterPreset
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

export type PrintRasterPreset = 'fast' | 'standard' | 'high' | 'ultra' | 'epic'

interface PrintRasterPresetOptions {
  dpi: number
  jpegQuality: number
  maxWidthPx?: number
  maxHeightPx?: number
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
    dpi: 600,
    jpegQuality: 0.98,
    bleedJpegQuality: 0.94,
  },
  epic: {
    dpi: 1200,
    jpegQuality: 0.99,
    bleedJpegQuality: 0.96,
  },
}

export const DIRECT_PRINT_RASTER_PRESETS: Record<DirectPrintRasterPreset, PrintRasterPresetOptions> = {
  fast: { dpi: 240, jpegQuality: 0.82, maxWidthPx: 800, maxHeightPx: 1100 },
  standard: { dpi: 300, jpegQuality: 0.88, maxWidthPx: 800, maxHeightPx: 1100 },
  high: { dpi: 360, jpegQuality: 0.9, maxWidthPx: 1000, maxHeightPx: 1400 },
  ultra: { dpi: 600, jpegQuality: 0.98 },
  epic: { dpi: 1200, jpegQuality: 0.99 },
}

export function defaultDirectPokerRasterPreset(): DirectPrintRasterPreset {
  return 'high'
}

const CARD_W = 63 // mm
const CARD_H = 88 // mm
const DIRECT_POKER_PAGE_W = 89 // mm
const DIRECT_POKER_PAGE_H = 89 // mm
const FETCH_CONCURRENCY = 6     // stay under browser per-origin cap
const FETCH_RETRIES = 2         // 1 initial + 2 retries
const FETCH_RETRY_BASE_MS = 250
const CROP_MARK_LENGTH = 4
const CROP_MARK_OFFSET = 1
const CROP_MARK_PRINTABLE_INSET = 3
const CROP_MARK_STROKE_PT = 0.2
const CROP_MARK_GRAY = 140
const PT_PER_MM = 72 / 25.4
const DIRECT_GUIDE_STROKE_PT = 0.2
const DIRECT_GUIDE_GRAY = 140
const DIRECT_GUIDE_LENGTH_MM = 2
const DIRECT_GUIDE_OFFSET_MM = 0.7

interface CachedImage {
  bytes: Uint8Array
  alias: string
}

interface CachedCardImages {
  main: CachedImage
  bleed?: CachedImage
}

interface DirectPokerPdfDetails {
  bytes: Uint8Array
  skippedUrls: string[]
}

interface DirectPokerGenerationOptions {
  cards: ProxyPdfOptions['cards']
  bleed?: number
  printFitMode?: PrintFitMode
  offsetXmm?: number
  offsetYmm?: number
  rotation?: DirectPokerRotation
  calibrationMode?: boolean
  showDirectPrintGuides?: boolean
  directPrintRasterPreset?: DirectPrintRasterPreset
  debugLayout?: boolean
  onProgress?: (done: number, total: number) => void
}

interface DirectPokerDrawOptions {
  trimBox: Rect
  imageBox: Rect
  rotation: DirectPokerRotation
}

interface DirectPokerCalibrationOptions {
  trimBox: Rect
  offsetXmm: number
  offsetYmm: number
  rotation: DirectPokerRotation
}

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM
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
  // Upscaling beyond source dims only invents interpolated pixels and
  // bloats the PDF. Treat undefined allowUpscale as "no upscale" so every
  // preset (including Ultra) caps at source resolution unless explicitly
  // opted in.
  const sourceScale = options.allowUpscale !== true && sourceWidth && sourceHeight
    ? Math.min(sourceWidth / rawWidth, sourceHeight / rawHeight, 1)
    : 1
  const maxScale = options.maxWidthPx != null && options.maxHeightPx != null
    ? Math.min(options.maxWidthPx / rawWidth, options.maxHeightPx / rawHeight, sourceScale, 1)
    : Math.min(sourceScale, 1)
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

  // Fast path: source is JPEG, already covers target dims, and aspect ratio
  // matches within tolerance → embed native bytes. Skips a canvas decode/
  // re-encode that would only lose quality and inflate the PDF.
  if (
    sourceImage instanceof Blob &&
    sourceImage.type === 'image/jpeg' &&
    originalWidth >= optimizedWidth &&
    originalHeight >= optimizedHeight
  ) {
    const sourceAspect = originalWidth / originalHeight
    const targetAspect = optimizedWidth / optimizedHeight
    const aspectDelta = Math.abs(sourceAspect - targetAspect) / targetAspect
    if (aspectDelta < 0.02) {
      revokeUrl?.()
      const bytes = new Uint8Array(await sourceImage.arrayBuffer())
      if (options.debug && process.env.NODE_ENV !== 'production') {
        console.log({ skipCanvas: true, originalWidth, originalHeight, optimizedWidth, optimizedHeight, originalBytes, optimizedBytes: bytes.length })
      }
      return bytes
    }
  }

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

export async function optimizeDirectPokerImageForPrint(
  sourceImage: Blob | ArrayBuffer | HTMLImageElement,
  options: {
    physicalWidthMm: number
    physicalHeightMm: number
    dpi: number
    jpegQuality: number
    maxWidthPx?: number
    maxHeightPx?: number
    fitMode?: PrintFitMode
    debug?: boolean
  },
): Promise<Uint8Array> {
  return optimizeCardImageForPrint(sourceImage, {
    bleedWmm: options.physicalWidthMm,
    bleedHmm: options.physicalHeightMm,
    dpi: options.dpi,
    jpegQuality: options.jpegQuality,
    maxWidthPx: options.maxWidthPx,
    maxHeightPx: options.maxHeightPx,
    fitMode: options.fitMode === 'crop' ? 'cover' : 'contain',
    debug: options.debug,
  })
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

function rectMmToPt(box: Rect): Rect {
  return {
    x: mmToPt(box.x),
    y: mmToPt(box.y),
    w: mmToPt(box.w),
    h: mmToPt(box.h),
  }
}

function drawImageInBoxPt(doc: jsPDF, image: CachedImage, box: Rect, rotation: DirectPokerRotation): void {
  const b = rectMmToPt(box)
  if (rotation === 0) {
    doc.addImage(image.bytes, 'JPEG', b.x, b.y, b.w, b.h, image.alias, 'FAST')
    return
  }

  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2

  if (rotation === 180) {
    doc.addImage(image.bytes, 'JPEG', b.x + b.w, b.y - b.h, b.w, b.h, image.alias, 'FAST', 180)
    return
  }

  const rotatedX = cx - b.h / 2
  const rotatedY = cy - b.w / 2
  if (rotation === 90) {
    doc.addImage(image.bytes, 'JPEG', rotatedX + b.h, rotatedY + b.w - b.h, b.w, b.h, image.alias, 'FAST', 90)
    return
  }

  doc.addImage(image.bytes, 'JPEG', rotatedX, rotatedY - b.h, b.w, b.h, image.alias, 'FAST', 270)
}

function lineMm(doc: jsPDF, x1: number, y1: number, x2: number, y2: number): void {
  doc.line(mmToPt(x1), mmToPt(y1), mmToPt(x2), mmToPt(y2))
}

function rectMm(doc: jsPDF, box: Rect, style?: string | null): void {
  doc.rect(mmToPt(box.x), mmToPt(box.y), mmToPt(box.w), mmToPt(box.h), style)
}

function textMm(doc: jsPDF, text: string, x: number, y: number, options?: TextOptionsLight): void {
  doc.text(text, mmToPt(x), mmToPt(y), options)
}

function drawDirectPrintGuides(doc: jsPDF, trimBox: Rect): void {
  const left = trimBox.x
  const right = trimBox.x + trimBox.w
  const top = trimBox.y
  const bottom = trimBox.y + trimBox.h
  const len = DIRECT_GUIDE_LENGTH_MM
  const offset = DIRECT_GUIDE_OFFSET_MM

  doc.setDrawColor(DIRECT_GUIDE_GRAY)
  doc.setLineWidth(DIRECT_GUIDE_STROKE_PT)

  lineMm(doc, left - offset - len, top, left - offset, top)
  lineMm(doc, left, top - offset - len, left, top - offset)
  lineMm(doc, right + offset, top, right + offset + len, top)
  lineMm(doc, right, top - offset - len, right, top - offset)
  lineMm(doc, left - offset - len, bottom, left - offset, bottom)
  lineMm(doc, left, bottom + offset, left, bottom + offset + len)
  lineMm(doc, right + offset, bottom, right + offset + len, bottom)
  lineMm(doc, right, bottom + offset, right, bottom + offset + len)
}

export function drawDirectPokerCard(doc: jsPDF, image: CachedImage, options: DirectPokerDrawOptions): void {
  drawImageInBoxPt(doc, image, options.imageBox, options.rotation)
}

export function drawDirectPokerCalibrationPage(doc: jsPDF, options: DirectPokerCalibrationOptions): void {
  const { trimBox } = options
  const centerX = trimBox.x + trimBox.w / 2
  const centerY = trimBox.y + trimBox.h / 2
  const left = trimBox.x
  const right = trimBox.x + trimBox.w
  const top = trimBox.y
  const bottom = trimBox.y + trimBox.h
  const tick = 4

  doc.setDrawColor(145)
  doc.setLineWidth(0.35)
  rectMm(doc, trimBox)
  lineMm(doc, centerX - 8, centerY, centerX + 8, centerY)
  lineMm(doc, centerX, centerY - 8, centerX, centerY + 8)

  lineMm(doc, left, top, left + tick, top)
  lineMm(doc, left, top, left, top + tick)
  lineMm(doc, right - tick, top, right, top)
  lineMm(doc, right, top, right, top + tick)
  lineMm(doc, left, bottom, left + tick, bottom)
  lineMm(doc, left, bottom - tick, left, bottom)
  lineMm(doc, right - tick, bottom, right, bottom)
  lineMm(doc, right, bottom - tick, right, bottom)

  doc.setTextColor(20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  textMm(doc, 'TOP', centerX, top + 8, { align: 'center' })
  textMm(doc, 'FRONT', centerX, centerY - 2.5, { align: 'center' })
  textMm(doc, 'LEFT', left + 4, centerY, { angle: 90, align: 'center' })
  textMm(doc, 'RIGHT', right - 4, centerY, { angle: 270, align: 'center' })
  textMm(doc, 'BOTTOM', centerX, bottom - 5, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  textMm(doc, `offset X ${options.offsetXmm.toFixed(1)} mm`, left + 2, bottom - 12)
  textMm(doc, `offset Y ${options.offsetYmm.toFixed(1)} mm`, left + 2, bottom - 8)
  textMm(doc, `rotation ${options.rotation}`, left + 2, bottom - 4)
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

async function fetchBestDirectPokerImage(
  urls: string[],
  raster: PrintRasterPresetOptions,
  imageBox: Rect,
  printFitMode: PrintFitMode,
  alias: string,
  debug?: boolean,
): Promise<CachedImage | null> {
  for (const url of urls) {
    const blob = await fetchImageBlob(url)
    if (blob) {
      const bytes = await optimizeDirectPokerImageForPrint(blob, {
        physicalWidthMm: imageBox.w,
        physicalHeightMm: imageBox.h,
        dpi: raster.dpi,
        jpegQuality: raster.jpegQuality,
        maxWidthPx: raster.maxWidthPx,
        maxHeightPx: raster.maxHeightPx,
        fitMode: printFitMode,
        debug,
      })
      return { bytes, alias }
    }
  }
  return null
}

async function generateDirectPokerPdfWithDetails(options: DirectPokerGenerationOptions): Promise<DirectPokerPdfDetails> {
  const printFitMode = options.printFitMode ?? 'preserve'
  const effectiveBleed = printFitMode === 'preserve' ? 0 : Math.max(0, options.bleed ?? 0)
  const offsetXmm = options.offsetXmm ?? 13
  const offsetYmm = options.offsetYmm ?? 0.5
  const rotation = options.rotation ?? 0
  const trimBox = computeDirectPokerTrimBox({ offsetXmm, offsetYmm })
  const imageBox = computeDirectPokerImageBox({
    offsetXmm,
    offsetYmm,
    bleedMm: effectiveBleed,
    printFitMode,
  })
  const raster = DIRECT_PRINT_RASTER_PRESETS[options.directPrintRasterPreset ?? defaultDirectPokerRasterPreset()]
  const pageFormat: [number, number] = [mmToPt(DIRECT_POKER_PAGE_W), mmToPt(DIRECT_POKER_PAGE_H)]
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: pageFormat })

  if (options.calibrationMode) {
    drawDirectPokerCalibrationPage(doc, { trimBox, offsetXmm, offsetYmm, rotation })
    if (options.showDirectPrintGuides) drawDirectPrintGuides(doc, trimBox)
    return { bytes: new Uint8Array(doc.output('arraybuffer')), skippedUrls: [] }
  }

  const expandedKeys: string[] = []
  const imageGroups = new Map<string, string[]>()
  for (const c of options.cards) {
    const urls = [...new Set(c.imageUrls.filter(Boolean))]
    if (urls.length === 0) continue
    const key = urls.join('|')
    imageGroups.set(key, urls)
    for (let i = 0; i < c.quantity; i++) {
      expandedKeys.push(key)
    }
  }

  const uniqueKeys = [...imageGroups.keys()]
  const imageCache = new Map<string, CachedImage>()
  let fetched = 0
  const total = uniqueKeys.length

  await mapWithLimit(uniqueKeys, FETCH_CONCURRENCY, async (key) => {
    const image = await fetchBestDirectPokerImage(
      imageGroups.get(key) ?? [],
      raster,
      imageBox,
      printFitMode,
      `direct-poker-card-${uniqueKeys.indexOf(key)}`,
      options.debugLayout,
    )
    if (image) imageCache.set(key, image)
    fetched++
    options.onProgress?.(fetched, total)
  })

  const skippedUrls = uniqueKeys.filter((key) => !imageCache.has(key)).map((key) => imageGroups.get(key)?.[0] ?? key)
  if (skippedUrls.length > 0) {
    console.warn(`[proxyPdf] ${skippedUrls.length}/${uniqueKeys.length} images failed to load`, skippedUrls)
  }

  const validCards = expandedKeys.filter((key) => imageCache.has(key))
  if (validCards.length === 0) {
    throw new Error('No card images available')
  }

  for (let index = 0; index < validCards.length; index++) {
    if (index > 0) doc.addPage(pageFormat, 'portrait')
    drawDirectPokerCard(doc, imageCache.get(validCards[index])!, { trimBox, imageBox, rotation })
    if (options.showDirectPrintGuides) drawDirectPrintGuides(doc, trimBox)
  }

  return { bytes: new Uint8Array(doc.output('arraybuffer')), skippedUrls }
}

export async function generateDirectPokerPdf(
  cards: ProxyPdfOptions['cards'],
  options: Omit<DirectPokerGenerationOptions, 'cards'> = {},
): Promise<Uint8Array> {
  const result = await generateDirectPokerPdfWithDetails({ ...options, cards })
  return result.bytes
}

export async function generateProxyPdf(options: ProxyPdfOptions): Promise<Blob> {
  const result = await generateProxyPdfWithDetails(options)
  return result.blob
}

export async function generateProxyPdfWithDetails(
  options: ProxyPdfOptions,
): Promise<ProxyPdfResult> {
  if (options.outputMode === 'direct-poker') {
    const { bytes, skippedUrls } = await generateDirectPokerPdfWithDetails({
      cards: options.cards,
      bleed: options.bleed,
      printFitMode: options.printFitMode,
      offsetXmm: options.offsetXmm,
      offsetYmm: options.offsetYmm,
      rotation: options.rotation,
      calibrationMode: options.calibrationMode,
      showDirectPrintGuides: options.showDirectPrintGuides,
      directPrintRasterPreset: options.directPrintRasterPreset,
      debugLayout: options.debugLayout,
      onProgress: options.onProgress,
    })
    const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    return {
      blob: new Blob([pdfBuffer], { type: 'application/pdf' }),
      skippedUrls,
      layoutWarnings: [],
    }
  }

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
