import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const playGameSource = readFileSync(
  fileURLToPath(new URL('../../src/components/play/PlayGame.tsx', import.meta.url)),
  'utf8',
)
const gameLogSource = readFileSync(
  fileURLToPath(new URL('../../src/components/play/GameLog.tsx', import.meta.url)),
  'utf8',
)

describe('multiplayer desktop layout', () => {
  it('keeps the side log out of the vertical game flow and reserves its width', () => {
    expect(playGameSource).toContain("!isGoldfish ? 'lg:pr-80' : ''")
    expect(gameLogSource).toContain('absolute inset-y-0 right-0')
  })
})
