import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
  }).outputText
  const compiledModule = { exports: {} }
  const context = {
    exports: compiledModule.exports,
    module: compiledModule,
    require,
  }
  vm.runInNewContext(output, context, { filename: filePath })
  return compiledModule.exports
}

const layout = loadTsModule(path.resolve('src/lib/proxyPdfLayout.ts'))

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

const a4Portrait3x3 = {
  pageW: 210,
  pageH: 297,
  cols: 3,
  rows: 3,
  cardW: 63,
  cardH: 88,
  gapX: 4,
  gapY: 5,
}

test('computeGridLayout centers A4 portrait 3x3 on trim boxes', () => {
  const boxes = layout.computeGridLayout(a4Portrait3x3)
  assert.deepEqual(plain(boxes), [
    { col: 0, row: 0, x: 6.5, y: 11.5, w: 63, h: 88 },
    { col: 1, row: 0, x: 73.5, y: 11.5, w: 63, h: 88 },
    { col: 2, row: 0, x: 140.5, y: 11.5, w: 63, h: 88 },
    { col: 0, row: 1, x: 6.5, y: 104.5, w: 63, h: 88 },
    { col: 1, row: 1, x: 73.5, y: 104.5, w: 63, h: 88 },
    { col: 2, row: 1, x: 140.5, y: 104.5, w: 63, h: 88 },
    { col: 0, row: 2, x: 6.5, y: 197.5, w: 63, h: 88 },
    { col: 1, row: 2, x: 73.5, y: 197.5, w: 63, h: 88 },
    { col: 2, row: 2, x: 140.5, y: 197.5, w: 63, h: 88 },
  ])
})

test('computeBleedBoxes expands around trim boxes', () => {
  const boxes = layout.computeBleedBoxes(layout.computeGridLayout(a4Portrait3x3), 1)
  assert.deepEqual(plain(boxes), [
    { x: 5.5, y: 10.5, w: 65, h: 90 },
    { x: 72.5, y: 10.5, w: 65, h: 90 },
    { x: 139.5, y: 10.5, w: 65, h: 90 },
    { x: 5.5, y: 103.5, w: 65, h: 90 },
    { x: 72.5, y: 103.5, w: 65, h: 90 },
    { x: 139.5, y: 103.5, w: 65, h: 90 },
    { x: 5.5, y: 196.5, w: 65, h: 90 },
    { x: 72.5, y: 196.5, w: 65, h: 90 },
    { x: 139.5, y: 196.5, w: 65, h: 90 },
  ])
})

test('generateCropMarks emits short deduplicated segments only', () => {
  const marks = layout.generateCropMarks(layout.computeGridLayout(a4Portrait3x3), a4Portrait3x3, {
    length: 2.5,
    offset: 1.2,
  })
  const keys = marks.map((mark) => `${mark.x1}:${mark.y1}:${mark.x2}:${mark.y2}`)
  assert.equal(new Set(keys).size, marks.length)
  for (const mark of marks) {
    const length = Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1)
    assert.ok(length <= 2.51)
    assert.ok(length > 0)
    assert.ok(mark.x1 === mark.x2 || mark.y1 === mark.y2)
  }
})

test('generateCropMarks can extend outer marks to page edge without duplicating internals', () => {
  const marks = layout.generateCropMarks(layout.computeGridLayout(a4Portrait3x3), a4Portrait3x3, {
    length: 2.5,
    offset: 1.2,
    extendOuterToPageEdge: true,
  })
  const keys = marks.map((mark) => `${mark.x1}:${mark.y1}:${mark.x2}:${mark.y2}`)
  assert.equal(new Set(keys).size, marks.length)
  assert.equal(marks.some((mark) => mark.x1 === 0 || mark.y1 === 0 || mark.x2 === 210 || mark.y2 === 297), true)

  for (const mark of marks) {
    const touchesPageEdge = mark.x1 === 0 || mark.y1 === 0 || mark.x2 === 210 || mark.y2 === 297
    const length = Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1)
    if (!touchesPageEdge) assert.ok(length <= 2.51)
  }
})

test('computeLayoutWarnings reports bleed overlap risk', () => {
  const warnings = layout.computeLayoutWarnings({
    ...a4Portrait3x3,
    gapX: 2,
    gapY: 5,
    bleed: 1,
    cropMarkLength: 2.5,
    cropMarkOffset: 1.2,
  })
  assert.equal(warnings.some((warning) => warning.code === 'gap-too-small'), true)
})

test('computeLayoutWarnings reports page overflow', () => {
  const warnings = layout.computeLayoutWarnings({
    ...a4Portrait3x3,
    pageW: 148,
    pageH: 210,
    bleed: 1,
    cropMarkLength: 2.5,
    cropMarkOffset: 1.2,
  })
  assert.equal(warnings.some((warning) => warning.code === 'layout-overflow'), true)
})

test('default A4 3x3 layout does not overflow', () => {
  const warnings = layout.computeLayoutWarnings({
    ...a4Portrait3x3,
    bleed: 1,
    cropMarkLength: 2.5,
    cropMarkOffset: 1.2,
  })
  assert.deepEqual(plain(warnings), [])
})

test('paginateCards splits cards into expected page sizes', () => {
  const cases = [
    { total: 23, expected: [9, 9, 5] },
    { total: 18, expected: [9, 9] },
    { total: 10, expected: [9, 1] },
    { total: 9, expected: [9] },
    { total: 1, expected: [1] },
    { total: 0, expected: [] },
  ]

  for (const item of cases) {
    const cards = Array.from({ length: item.total }, (_, index) => index)
    assert.deepEqual(plain(layout.paginateCards(cards, 9).map((page) => page.length)), item.expected)
  }
})

test('getPageSlotIndex maps global index to page and slot', () => {
  const cases = [
    { globalIndex: 0, expected: { pageIndex: 0, slotIndex: 0 } },
    { globalIndex: 8, expected: { pageIndex: 0, slotIndex: 8 } },
    { globalIndex: 9, expected: { pageIndex: 1, slotIndex: 0 } },
    { globalIndex: 17, expected: { pageIndex: 1, slotIndex: 8 } },
    { globalIndex: 18, expected: { pageIndex: 2, slotIndex: 0 } },
  ]

  for (const item of cases) {
    assert.deepEqual(plain(layout.getPageSlotIndex(item.globalIndex, 9)), item.expected)
  }
})
