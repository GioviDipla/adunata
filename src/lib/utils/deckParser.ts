export interface ParsedCard {
  name: string
  quantity: number
  board: string
  setCode?: string
  /** True when the source line carried a Moxfield / ManaBox / Archidekt
      foil or etched marker (`*F*`, `*E*`, trailing bare ` F`/` E`). */
  isFoil?: boolean
}

/**
 * Parse a pasted decklist.
 *
 * Accepted formats (one card per line):
 *   `4 Lightning Bolt`            — bare count
 *   `4x Lightning Bolt`           — `x` suffix
 *   `Lightning Bolt`              — no count → treated as 1
 *   `4 Lightning Bolt (STA) 42`   — Moxfield / Archidekt with set + collector
 *   `4 Lightning Bolt (STA) 42 F` / `*F*` — foil marker (Moxfield / ManaBox)
 *   `SB: 2 Pyroblast`             — explicit sideboard prefix
 *
 * Section headers (`Sideboard`, `Maybeboard`, `Commander`, `Mainboard`,
 * `Main Deck`) on their own line switch the board for subsequent entries.
 */
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

    // Detect foil / etched markers BEFORE stripping — the flag must
    // survive into the parsed entry so the importer can persist it.
    // `*F*` / `*E*` anywhere (case-insensitive) OR a trailing bare ` F` /
    // ` E` (case-sensitive to avoid clipping lowercase letters at the end
    // of a card name) both count.
    const isFoil =
      /\*[FE]\*/i.test(workingLine) ||
      /\s+[FE]\s*$/.test(workingLine)

    workingLine = workingLine
      .replace(/\s+\*[FE]\*(?=\s|$)/gi, '')
      .replace(/\s+\*[FE]\*\s*$/i, '')
      .replace(/\s+[FE]\s*$/, '')
      .trim()

    // Quantity is optional — default to 1 when the line starts with the
    // card name directly (common when users hand-write the list).
    //
    // Collector only appears AFTER a set code — that's how Moxfield /
    // Manabox / Archidekt emit them. Tying the collector to the set
    // group stops the alphanumeric pattern from eating the last word
    // of a card name on lines without a set (e.g. "1 Balin's Tomb"
    // used to parse as name="Balin's" + collector="Tomb").
    //
    // Inside that group the collector accepts alphanumerics plus `★`
    // and `-` so promo variants like `266p` or The-List entries like
    // `KHM-251` don't fall back into the name.
    const match = workingLine.match(
      /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]+)\)(?:\s+[A-Za-z0-9★\-]+)?)?$/
    )

    if (match) {
      const quantity = match[1] ? parseInt(match[1], 10) : 1
      // Moxfield / Manabox / Archidekt export DFCs with ` / ` (single
      // slash); Scryfall — and therefore our `cards` table — stores
      // them as ` // ` (double slash). Normalize here so the lookup
      // matches both locally and at the Scryfall fallback.
      const name = match[2].trim().replace(/\s+\/\s+/g, ' // ')
      const setCode = match[3] || undefined
      if (quantity > 0 && name) {
        cards.push({ name, quantity, board, setCode, isFoil })
      }
    }
  }

  return cards
}
