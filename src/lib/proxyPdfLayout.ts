export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type BleedMode = 'crop' | 'preserve' | 'none'
export type ImageFitMode = 'cover' | 'contain'
export type PrintFitMode = 'preserve' | 'crop'

export interface CardImageLayout {
  imageDrawBox: Rect
  mainImageDrawBox: Rect
  mainFitMode: ImageFitMode
  bleedImageDrawBox?: Rect
  bleedFitMode?: ImageFitMode
}

export interface GridLayoutOptions {
  pageW: number
  pageH: number
  cols: number
  rows: number
  cardW: number
  cardH: number
  gapX: number
  gapY: number
}

export interface TrimBox extends Rect {
  col: number
  row: number
}

export interface CropMarkSettings {
  length: number
  offset: number
  printableInset?: number
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface LayoutWarning {
  code: 'gap-too-small' | 'layout-overflow'
  message: string
}

export interface PageSlot {
  pageIndex: number
  slotIndex: number
}

export interface DirectPokerBoxOptions {
  offsetXmm?: number
  offsetYmm?: number
  bleedMm?: number
  printFitMode?: PrintFitMode
}

const ROUNDING_FACTOR = 100

function round2(value: number): number {
  return Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR
}

function segmentKey(segment: Segment): string {
  return [
    round2(segment.x1),
    round2(segment.y1),
    round2(segment.x2),
    round2(segment.y2),
  ].join(':')
}

function pushUniqueSegment(segments: Segment[], seen: Set<string>, segment: Segment): void {
  if (Math.abs(segment.x1 - segment.x2) < 0.01 && Math.abs(segment.y1 - segment.y2) < 0.01) return
  const key = segmentKey(segment)
  if (seen.has(key)) return
  seen.add(key)
  segments.push({
    x1: round2(segment.x1),
    y1: round2(segment.y1),
    x2: round2(segment.x2),
    y2: round2(segment.y2),
  })
}

function internalMarkLength(gap: number, offset: number, maxLength: number): number {
  return Math.max(0, Math.min(maxLength, gap / 2 - offset))
}

export function computeGridLayout(options: GridLayoutOptions): TrimBox[] {
  const cols = Math.max(1, Math.floor(options.cols))
  const rows = Math.max(1, Math.floor(options.rows))
  const gridW = cols * options.cardW + (cols - 1) * options.gapX
  const gridH = rows * options.cardH + (rows - 1) * options.gapY
  const startX = (options.pageW - gridW) / 2
  const startY = (options.pageH - gridH) / 2
  const boxes: TrimBox[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      boxes.push({
        col,
        row,
        x: round2(startX + col * (options.cardW + options.gapX)),
        y: round2(startY + row * (options.cardH + options.gapY)),
        w: options.cardW,
        h: options.cardH,
      })
    }
  }

  return boxes
}

export function computeBleedBoxes(trimBoxes: Rect[], bleedMm: number): Rect[] {
  return trimBoxes.map((box) => ({
    x: round2(box.x - bleedMm),
    y: round2(box.y - bleedMm),
    w: round2(box.w + 2 * bleedMm),
    h: round2(box.h + 2 * bleedMm),
  }))
}

export function computeCardImageLayout(
  trimBox: Rect,
  bleedMm: number,
  bleedMode: BleedMode,
): CardImageLayout {
  const bleedBox = computeBleedBoxes([trimBox], bleedMm)[0]

  if (bleedMode === 'crop') {
    return {
      imageDrawBox: bleedBox,
      mainImageDrawBox: bleedBox,
      mainFitMode: 'cover',
    }
  }

  if (bleedMode === 'preserve' && bleedMm > 0) {
    return {
      imageDrawBox: trimBox,
      mainImageDrawBox: trimBox,
      mainFitMode: 'contain',
      bleedImageDrawBox: bleedBox,
      bleedFitMode: 'cover',
    }
  }

  return {
    imageDrawBox: trimBox,
    mainImageDrawBox: trimBox,
    mainFitMode: 'contain',
  }
}

export function computeDirectPokerTrimBox(options: DirectPokerBoxOptions = {}): Rect {
  return {
    x: round2(options.offsetXmm ?? 13),
    y: round2(options.offsetYmm ?? 0.5),
    w: 63,
    h: 88,
  }
}

export function computeDirectPokerImageBox(options: DirectPokerBoxOptions = {}): Rect {
  const trimBox = computeDirectPokerTrimBox(options)
  if ((options.printFitMode ?? 'preserve') === 'crop') {
    const bleedMm = Math.max(0, options.bleedMm ?? 0)
    return computeBleedBoxes([trimBox], bleedMm)[0]
  }
  return trimBox
}

export function paginateCards<T>(cards: T[], cardsPerPage: number): T[][] {
  if (cardsPerPage <= 0) return []
  const pages: T[][] = []
  for (let start = 0; start < cards.length; start += cardsPerPage) {
    pages.push(cards.slice(start, start + cardsPerPage))
  }
  return pages
}

export function getPageSlotIndex(globalIndex: number, cardsPerPage: number): PageSlot {
  if (cardsPerPage <= 0) {
    throw new Error('cardsPerPage must be greater than zero')
  }
  return {
    pageIndex: Math.floor(globalIndex / cardsPerPage),
    slotIndex: globalIndex % cardsPerPage,
  }
}

export function generateCropMarks(
  trimBoxes: TrimBox[],
  layout: Pick<GridLayoutOptions, 'pageW' | 'pageH' | 'cols' | 'rows' | 'gapX' | 'gapY'>,
  settings: CropMarkSettings,
): Segment[] {
  const segments: Segment[] = []
  const seen = new Set<string>()
  const cols = Math.max(1, Math.floor(layout.cols))
  const rows = Math.max(1, Math.floor(layout.rows))
  const internalX = internalMarkLength(layout.gapX, settings.offset, settings.length)
  const internalY = internalMarkLength(layout.gapY, settings.offset, settings.length)
  const inset = Math.max(0.01, settings.printableInset ?? settings.length)

  for (const box of trimBoxes) {
    const left = box.x
    const right = box.x + box.w
    const top = box.y
    const bottom = box.y + box.h
    const leftLen = box.col === 0 ? settings.length : internalX
    const rightLen = box.col === cols - 1 ? settings.length : internalX
    const topLen = box.row === 0 ? settings.length : internalY
    const bottomLen = box.row === rows - 1 ? settings.length : internalY
    const o = settings.offset

    if (leftLen > 0) {
      const x1 = box.col === 0 ? inset : left - o - leftLen
      pushUniqueSegment(segments, seen, { x1, y1: top, x2: left - o, y2: top })
      pushUniqueSegment(segments, seen, { x1, y1: bottom, x2: left - o, y2: bottom })
    }
    if (rightLen > 0) {
      const x2 = box.col === cols - 1 ? layout.pageW - inset : right + o + rightLen
      pushUniqueSegment(segments, seen, { x1: right + o, y1: top, x2, y2: top })
      pushUniqueSegment(segments, seen, { x1: right + o, y1: bottom, x2, y2: bottom })
    }
    if (topLen > 0) {
      const y1 = box.row === 0 ? inset : top - o - topLen
      pushUniqueSegment(segments, seen, { x1: left, y1, x2: left, y2: top - o })
      pushUniqueSegment(segments, seen, { x1: right, y1, x2: right, y2: top - o })
    }
    if (bottomLen > 0) {
      const y2 = box.row === rows - 1 ? layout.pageH - inset : bottom + o + bottomLen
      pushUniqueSegment(segments, seen, { x1: left, y1: bottom + o, x2: left, y2 })
      pushUniqueSegment(segments, seen, { x1: right, y1: bottom + o, x2: right, y2 })
    }
  }

  return segments
}

export function generateAdjacentGridCutGuides(
  trimBoxes: TrimBox[],
  layout: Pick<GridLayoutOptions, 'pageW' | 'pageH'>,
  settings: Pick<CropMarkSettings, 'offset' | 'printableInset'>,
): Segment[] {
  const segments: Segment[] = []
  const seen = new Set<string>()
  if (trimBoxes.length === 0) return segments

  const gridLeft = Math.min(...trimBoxes.map((box) => box.x))
  const gridTop = Math.min(...trimBoxes.map((box) => box.y))
  const gridRight = Math.max(...trimBoxes.map((box) => box.x + box.w))
  const gridBottom = Math.max(...trimBoxes.map((box) => box.y + box.h))
  const cutXs = [...new Set(trimBoxes.flatMap((box) => [round2(box.x), round2(box.x + box.w)]))].sort((a, b) => a - b)
  const cutYs = [...new Set(trimBoxes.flatMap((box) => [round2(box.y), round2(box.y + box.h)]))].sort((a, b) => a - b)
  const o = settings.offset
  const inset = Math.max(0.01, settings.printableInset ?? 3)

  for (const cutX of cutXs) {
    pushUniqueSegment(segments, seen, {
      x1: cutX,
      y1: inset,
      x2: cutX,
      y2: gridTop - o,
    })
    pushUniqueSegment(segments, seen, {
      x1: cutX,
      y1: gridBottom + o,
      x2: cutX,
      y2: layout.pageH - inset,
    })
  }

  for (const cutY of cutYs) {
    pushUniqueSegment(segments, seen, {
      x1: inset,
      y1: cutY,
      x2: gridLeft - o,
      y2: cutY,
    })
    pushUniqueSegment(segments, seen, {
      x1: gridRight + o,
      y1: cutY,
      x2: layout.pageW - inset,
      y2: cutY,
    })
  }

  return segments
}

export function computeLayoutWarnings(
  options: GridLayoutOptions & { bleed: number; cropMarkLength: number; cropMarkOffset: number },
): LayoutWarning[] {
  const warnings: LayoutWarning[] = []
  if (options.gapX <= 2 * options.bleed || options.gapY <= 2 * options.bleed) {
    warnings.push({
      code: 'gap-too-small',
      message: 'Gap too small for selected bleed: bleed areas may overlap.',
    })
  }

  const trimBoxes = computeGridLayout(options)
  const bleedBoxes = computeBleedBoxes(trimBoxes, options.bleed)
  const cropMarks = generateCropMarks(trimBoxes, options, {
    length: options.cropMarkLength,
    offset: options.cropMarkOffset,
  })
  const rects = [...bleedBoxes]
  const minX = Math.min(...rects.map((r) => r.x), ...cropMarks.map((s) => Math.min(s.x1, s.x2)))
  const minY = Math.min(...rects.map((r) => r.y), ...cropMarks.map((s) => Math.min(s.y1, s.y2)))
  const maxX = Math.max(...rects.map((r) => r.x + r.w), ...cropMarks.map((s) => Math.max(s.x1, s.x2)))
  const maxY = Math.max(...rects.map((r) => r.y + r.h), ...cropMarks.map((s) => Math.max(s.y1, s.y2)))

  if (minX < 0 || minY < 0 || maxX > options.pageW || maxY > options.pageH) {
    warnings.push({
      code: 'layout-overflow',
      message: 'Layout exceeds the selected page size.',
    })
  }

  return warnings
}
