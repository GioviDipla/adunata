import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const moduleCache = new Map()

function resolveTsModule(specifier, parentPath) {
  const base = path.resolve(path.dirname(parentPath), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return require.resolve(specifier)
}

function loadTsModule(filePath) {
  const absolutePath = path.resolve(filePath)
  const cached = moduleCache.get(absolutePath)
  if (cached) return cached.exports

  const source = fs.readFileSync(absolutePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
  }).outputText
  const compiledModule = { exports: {} }
  moduleCache.set(absolutePath, compiledModule)

  const context = {
    exports: compiledModule.exports,
    module: compiledModule,
    process,
    require: (specifier) => {
      if (specifier.startsWith('.')) return loadTsModule(resolveTsModule(specifier, absolutePath))
      return require(specifier)
    },
  }
  vm.runInNewContext(output, context, { filename: absolutePath })
  return compiledModule.exports
}

const proxyPdf = loadTsModule('src/lib/proxyPdf.ts')

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test('print raster presets keep existing caps and add ultra', () => {
  assert.deepEqual(plain(proxyPdf.PRINT_RASTER_PRESETS.high), {
    dpi: 360,
    jpegQuality: 0.9,
    maxWidthPx: 1000,
    maxHeightPx: 1400,
  })
  assert.deepEqual(plain(proxyPdf.PRINT_RASTER_PRESETS.ultra), {
    dpi: 600,
    jpegQuality: 0.98,
    maxWidthPx: 1900,
    maxHeightPx: 2700,
    bleedJpegQuality: 0.94,
  })
})

test('ultra can use higher limits without inventing pixels beyond the source', () => {
  const highDimensions = proxyPdf.printRasterDimensions({
    bleedWmm: 63,
    bleedHmm: 88,
    dpi: 360,
    jpegQuality: 0.9,
    maxWidthPx: 1000,
    maxHeightPx: 1400,
  })
  assert.deepEqual(plain(highDimensions), { width: 893, height: 1247 })

  const ultraDimensions = proxyPdf.printRasterDimensions({
    bleedWmm: 63,
    bleedHmm: 88,
    ...proxyPdf.PRINT_RASTER_PRESETS.ultra,
  })
  assert.deepEqual(plain(ultraDimensions), { width: 1488, height: 2079 })
})

test('direct poker raster presets target card-sized JPEGs in increasing weight order', () => {
  assert.deepEqual(plain(proxyPdf.DIRECT_PRINT_RASTER_PRESETS.fast), {
    dpi: 240,
    jpegQuality: 0.82,
    maxWidthPx: 800,
    maxHeightPx: 1100,
  })
  assert.deepEqual(plain(proxyPdf.DIRECT_PRINT_RASTER_PRESETS.standard), {
    dpi: 300,
    jpegQuality: 0.88,
    maxWidthPx: 800,
    maxHeightPx: 1100,
  })
  assert.deepEqual(plain(proxyPdf.DIRECT_PRINT_RASTER_PRESETS.high), {
    dpi: 360,
    jpegQuality: 0.9,
    maxWidthPx: 1000,
    maxHeightPx: 1400,
  })
  assert.deepEqual(plain(proxyPdf.DIRECT_PRINT_RASTER_PRESETS.ultra), {
    dpi: 600,
    jpegQuality: 0.98,
    maxWidthPx: 1600,
    maxHeightPx: 2200,
  })

  const fast = proxyPdf.printRasterDimensions({
    bleedWmm: 63,
    bleedHmm: 88,
    ...proxyPdf.DIRECT_PRINT_RASTER_PRESETS.fast,
  })
  const standard = proxyPdf.printRasterDimensions({
    bleedWmm: 63,
    bleedHmm: 88,
    ...proxyPdf.DIRECT_PRINT_RASTER_PRESETS.standard,
  })
  const high = proxyPdf.printRasterDimensions({
    bleedWmm: 63,
    bleedHmm: 88,
    ...proxyPdf.DIRECT_PRINT_RASTER_PRESETS.high,
  })
  const ultra = proxyPdf.printRasterDimensions({
    bleedWmm: 63,
    bleedHmm: 88,
    ...proxyPdf.DIRECT_PRINT_RASTER_PRESETS.ultra,
  })

  assert.deepEqual(plain(fast), { width: 595, height: 831 })
  assert.deepEqual(plain(standard), { width: 744, height: 1039 })
  assert.deepEqual(plain(high), { width: 893, height: 1247 })
  assert.deepEqual(plain(ultra), { width: 1488, height: 2079 })
  assert.ok(fast.width * fast.height < standard.width * standard.height)
  assert.ok(standard.width * standard.height < high.width * high.height)
  assert.ok(high.width * high.height < ultra.width * ultra.height)
})

test('direct poker default raster preset is high, not ultra', () => {
  assert.equal(proxyPdf.defaultDirectPokerRasterPreset(), 'high')
})

test('mmToPt converts physical page size for direct poker PDF pages', () => {
  assert.equal(proxyPdf.mmToPt(25.4), 72)
  assert.equal(Math.round(proxyPdf.mmToPt(89) * 1000) / 1000, 252.283)
})

test('direct poker calibration PDF uses 89x89 mm page and orientation labels', async () => {
  const bytes = await proxyPdf.generateDirectPokerPdf([], {
    calibrationMode: true,
    offsetXmm: 13,
    offsetYmm: 0.5,
    rotation: 0,
  })
  const pdf = new TextDecoder('latin1').decode(bytes)
  const pagePt = proxyPdf.mmToPt(89).toFixed(2).replace('.', '\\.')
  assert.match(pdf, new RegExp(`/MediaBox \\[0 0 ${pagePt}\\d* ${pagePt}\\d*\\]`))
  assert.match(pdf, /TOP/)
  assert.match(pdf, /FRONT/)
  assert.match(pdf, /LEFT/)
  assert.match(pdf, /RIGHT/)
  assert.match(pdf, /BOTTOM/)
  assert.doesNotMatch(pdf, /\/Subtype \/Image/)
})
