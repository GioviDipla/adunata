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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, strict: true },
  }).outputText
  const compiledModule = { exports: {} }
  vm.runInNewContext(output, { exports: compiledModule.exports, module: compiledModule, require }, { filename: filePath })
  return compiledModule.exports
}

const { readPngDimensions, sha256Hex } = loadTsModule(path.resolve('src/lib/card-images/image-metadata.ts'))

const oneByOnePng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfab5d0000000049454e44ae426082',
  'hex',
)

test('reads PNG dimensions', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(readPngDimensions(oneByOnePng))), { width: 1, height: 1 })
})

test('hashes bytes as sha256 hex', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('rejects non-PNG input', () => {
  assert.throws(() => readPngDimensions(Buffer.from('nope')), /Invalid PNG/)
})
