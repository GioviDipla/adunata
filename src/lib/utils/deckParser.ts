export interface ParsedCard {
  name: string
  quantity: number
  board: string
  setCode?: string
}

export function parseDeckList(text: string, defaultBoard = 'main'): ParsedCard[] {
  const lines = text.split('\n')
  const cards: ParsedCard[] = []
  let currentBoard = defaultBoard

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('//')) continue

    if (/^sideboard\s*$/i.test(line) || /^SB:\s*$/i.test(line)) {
      currentBoard = 'sideboard'
      continue
    }
    if (/^maybeboard\s*$/i.test(line)) {
      currentBoard = 'maybeboard'
      continue
    }
    if (/^commander\s*$/i.test(line)) {
      currentBoard = 'commander'
      continue
    }
    if (/^mainboard\s*$/i.test(line) || /^main\s*deck\s*$/i.test(line)) {
      currentBoard = 'main'
      continue
    }

    let workingLine = line
    let board = currentBoard
    if (/^SB:\s*/i.test(workingLine)) {
      board = 'sideboard'
      workingLine = workingLine.replace(/^SB:\s*/i, '')
    }

    const match = workingLine.match(
      /^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\))?(?:\s+\d+)?$/
    )

    if (match) {
      const quantity = parseInt(match[1], 10)
      const name = match[2].trim()
      const setCode = match[3] || undefined
      if (quantity > 0 && name) {
        cards.push({ name, quantity, board, setCode })
      }
    }
  }

  return cards
}
