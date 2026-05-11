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
    dpi: 480,
    jpegQuality: 0.95,
    maxWidthPx: 1500,
    maxHeightPx: 2100,
    allowUpscale: false,
    bleedJpegQuality: 0.9,
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
  }, 745, 1040)
  assert.deepEqual(plain(ultraDimensions), { width: 745, height: 1040 })
})
