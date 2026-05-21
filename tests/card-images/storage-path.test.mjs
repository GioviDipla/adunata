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

const { buildCardImageStoragePath } = loadTsModule(path.resolve('src/lib/card-images/storage-path.ts'))

test('builds stable front path', () => {
  assert.equal(
    buildCardImageStoragePath({ scryfallId: 'abcdef', faceName: 'front', profile: 'hd-2x' }),
    'scryfall/a/b/abcdef/front@2x.png',
  )
})

test('builds stable back path', () => {
  assert.equal(
    buildCardImageStoragePath({ scryfallId: 'abcdef', faceName: 'back', profile: 'hd-2x' }),
    'scryfall/a/b/abcdef/back@2x.png',
  )
})

test('rejects missing scryfall id', () => {
  assert.throws(
    () => buildCardImageStoragePath({ scryfallId: '', faceName: 'front', profile: 'hd-2x' }),
    /scryfall_id/,
  )
})
