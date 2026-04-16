# Proxy Print PDF — Design Spec

## Summary

Add a "Print Proxies" feature to DeckEditor and DeckVisualizer. Users click a button, see a modal with all deck cards pre-selected (basic lands deselected by default), configure print options, and generate a downloadable PDF with card images laid out in a 3×3 grid at standard MTG card size (63×88mm).

## Entry Points

- **DeckEditor**: Button next to the existing Export button in the toolbar
- **DeckVisualizer** (read-only deck view): Same button placement

Both pass the same data: array of `{ card: CardRow, quantity: number, board: string }`.

## Modal: `ProxyPrintModal`

### Props

```typescript
interface ProxyPrintModalProps {
  cards: { card: CardRow; quantity: number; board: string }[]
  onClose: () => void
}
```

### Card Selection Grid

- Displays all cards from main, sideboard, maybeboard (NOT tokens/commander-only if they have no image)
- Each card shown as a small thumbnail (`image_small`) with name, quantity badge, and a checkbox
- All cards start **selected**, except basic lands when "Skip basic lands" is ON
- Toggling "Skip basic lands" OFF re-selects basic lands; toggling ON deselects them
- User can click individual cards to toggle selection
- "Select All" / "Deselect All" buttons at top

### Options Bar (bottom of modal)

| Option | Type | Values | Default |
|--------|------|--------|---------|
| Skip basic lands | Toggle | ON/OFF | ON |
| Paper | Dropdown | A4 (210×297mm), Letter (215.9×279.4mm) | A4 |
| Gap | Dropdown | 0.0mm, 0.2mm, 0.5mm, 1.0mm | 0.0mm |
| Scale | Dropdown | 100%, 95%, 90% | 100% |

### Generate Button

- Label: "Generate PDF"
- Shows spinner during generation
- Downloads file as `{deckName}-proxies.pdf`

## PDF Generation

### Library

`jspdf` — client-side PDF generation. No server needed.

### Layout Math

- Card base size: 63×88mm (standard MTG)
- Actual card size: 63×scale × 88×scale mm
- Grid: 3 columns × 3 rows = 9 cards per page
- Page margins: centered. Compute horizontal margin = (pageWidth - 3×cardWidth - 2×gap) / 2, same for vertical
- Cards placed left-to-right, top-to-bottom
- When a card has quantity N, it appears N times in the PDF

### Image Handling

- Use `image_normal` (480×680px) from the DB — already available, no extra fetch
- Cards without `image_normal`: skip (don't leave blank space, just don't include)
- Images fetched as blob → converted to base64 data URL for jsPDF `addImage()`
- Fetch all images before generating (show progress bar)

### Basic Land Detection

A card is a basic land if `type_line` contains "Basic Land".

## File Structure

- `src/components/deck/ProxyPrintModal.tsx` — the modal component (selection grid + options + generate)
- `src/lib/proxyPdf.ts` — PDF generation logic (pure function: takes cards + options, returns PDF blob)

## Edge Cases

- Deck with 0 selected cards → disable Generate button
- Card with no `image_normal` → silently skip
- Very large decks (200+ cards after quantity expansion) → progress bar during image fetch + generation
- CORS on Scryfall images: `image_normal` URLs are from Scryfall CDN which allows cross-origin. If CORS fails, fall back to fetching via a proxy route (unlikely needed).
