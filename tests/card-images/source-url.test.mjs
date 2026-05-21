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
  vm.runInNewContext(output, { exports: compiledModule.exports, module: compiledModule, require }, { filename: filePath })
  return compiledModule.exports
}

const { resolveCardImageSources } = loadTsModule(path.resolve('src/lib/card-images/source-url.ts'))

const scryfallId = 'abcdef12-3456-7890-abcd-ef1234567890'

test('prefers explicit face PNG', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: scryfallId,
    image_normal: 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg',
    card_faces: [
      { image_uris: { png: 'https://cards.scryfall.io/png/front/a/b/face.png' } },
    ],
  })
  assert.equal(sources[0].sourceUrl, 'https://cards.scryfall.io/png/front/a/b/face.png')
  assert.equal(sources[0].faceIndex, 0)
  assert.equal(sources[0].faceName, 'front')
})

test('derives front PNG for single-faced card', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: scryfallId,
    image_normal: 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg',
    card_faces: null,
  })
  assert.equal(sources[0].sourceUrl, `https://cards.scryfall.io/png/front/a/b/${scryfallId}.png`)
})

test('resolves explicit double-faced front and back URLs', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: scryfallId,
    image_normal: null,
    card_faces: [
      { image_uris: { png: 'https://cards.scryfall.io/png/front/a/b/front.png' } },
      { image_uris: { png: 'https://cards.scryfall.io/png/back/a/b/back.png' } },
    ],
  })
  assert.deepEqual(sources.map((s) => [s.faceIndex, s.faceName, s.sourceUrl]), [
    [0, 'front', 'https://cards.scryfall.io/png/front/a/b/front.png'],
    [1, 'back', 'https://cards.scryfall.io/png/back/a/b/back.png'],
  ])
})

test('does not invent back URLs for multi-face cards without face images', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: scryfallId,
    image_normal: 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg',
    card_faces: [
      { name: 'Spell front' },
      { name: 'Prepared back text' },
    ],
  })
  assert.equal(sources.length, 1)
  assert.equal(sources[0].faceIndex, 0)
  assert.equal(sources[0].faceName, 'front')
  assert.equal(sources[0].sourceUrl, `https://cards.scryfall.io/png/front/a/b/${scryfallId}.png`)
})

test('falls back to image_normal when no better source exists', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: '',
    image_normal: 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg',
    card_faces: null,
  })
  assert.equal(sources[0].sourceUrl, 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg')
})

test('returns no source when no usable image exists', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: '',
    image_normal: null,
    card_faces: null,
  })
  assert.equal(sources.length, 0)
})
