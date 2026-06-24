# Card Detail Printing Carousel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the printings dropdown under the card image with an auto-loaded horizontal carousel in place of the Format Legalities section. Selecting a printing updates the main image, prices, and Cardmarket link.

**Architecture:** Single-file change to `CardDetail.tsx`. Auto-fetch printings on mount, render a horizontal scrollable carousel with low-res images (`image_small`), highlight selected printing, remove legalities entirely.

**Tech Stack:** Next.js, React, Tailwind CSS, `next/image`

## Global Constraints

- CardDetail is used in DeckEditor (dynamic import), DeckView (static import), CardBrowser, CollectionView
- `onPrintingSelect` callback must still fire for DeckEditor's card-swap flow
- Must preserve DFC (double-faced card) image display
- Mobile-first: carousel must scroll horizontally via touch/swipe
- Low-res images: use `image_small` (146×204) for carousel tiles

---

### Task 1: Auto-load printings on mount, remove old selector UI

**Files:**
- Modify: `src/components/cards/CardDetail.tsx`

**Interfaces:**
- Produces: `printings` state populated on mount, `showPrintings` state removed, `loadPrintings` function removed

- [ ] **Step 1: Add useEffect to auto-load printings on mount**

Replace the manual `loadPrintings` function with a `useEffect` that auto-fetches printings when the card prop changes (the effect at line 192 already resets `printings` to `[]`, so just add a new effect that loads them).

Add this new `useEffect` right after the existing lazy-hydrate effect (after line 210):

```tsx
// Auto-load printings on mount for the carousel
useEffect(() => {
  let aborted = false
  const load = async () => {
    const typeLine = (card.type_line ?? '').toLowerCase()
    const isToken = /\b(token|emblem|dungeon|plane|scheme)\b/.test(typeLine)
    const url = isToken
      ? `/api/cards/printings?name=${encodeURIComponent(card.name)}&type=token`
      : `/api/cards/printings?name=${encodeURIComponent(card.name)}`
    try {
      const res = await fetch(url)
      if (!res.ok || aborted) return
      const data = await res.json()
      if (!aborted) setPrintings(data.printings ?? [])
    } catch { /* silent */ }
  }
  load()
  return () => { aborted = true }
}, [card.name, card.type_line])
```

- [ ] **Step 2: Remove `showPrintings` state, `loadPrintings` function, and `loadingPrintings` state**

Delete these lines:
- Line 109: `const [showPrintings, setShowPrintings] = useState(false)`
- Lines 297-320: `async function loadPrintings() { ... }` (the entire function)
- Line 108: `const [loadingPrintings, setLoadingPrintings] = useState(false)` (keep or repurpose for carousel loading state)

Actually keep `loadingPrintings` for showing a spinner while printings load:

```tsx
const [loadingPrintings, setLoadingPrintings] = useState(false)
```

Update the useEffect to set loading state:

```tsx
useEffect(() => {
  let aborted = false
  const load = async () => {
    setLoadingPrintings(true)
    const typeLine = (card.type_line ?? '').toLowerCase()
    const isToken = /\b(token|emblem|dungeon|plane|scheme)\b/.test(typeLine)
    const url = isToken
      ? `/api/cards/printings?name=${encodeURIComponent(card.name)}&type=token`
      : `/api/cards/printings?name=${encodeURIComponent(card.name)}`
    try {
      const res = await fetch(url)
      if (!res.ok || aborted) return
      const data = await res.json()
      if (!aborted) {
        setPrintings(data.printings ?? [])
        setLoadingPrintings(false)
      }
    } catch {
      if (!aborted) setLoadingPrintings(false)
    }
  }
  load()
  return () => { aborted = true }
}, [card.name, card.type_line])
```

Also remove `showPrintings` from the reset in the existing useEffect (line 195):

```tsx
// Before (line 192-210):
useEffect(() => {
    setDisplayCard(card)
    setPrintings([])
    setShowPrintings(false)  // ← remove this line
    ...
}, [card])

// After:
useEffect(() => {
    setDisplayCard(card)
    setPrintings([])
    ...
}, [card])
```

- [ ] **Step 3: Remove the printings button and dropdown from the JSX**

Delete lines 463-510 (the entire printings button + dropdown block):

```tsx
// REMOVE this entire block:
{/* Printings selector button */}
<button onClick={loadPrintings} disabled={loadingPrintings} ...>
  ...
</button>

{/* Printings dropdown */}
{showPrintings && printings.length > 0 && (
  <div className="max-h-48 overflow-y-auto ...">
    {printings.map((p) => (...))}
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/cards/CardDetail.tsx
git commit -m "feat(card-detail): auto-load printings on mount, remove dropdown selector"
```

---

### Task 2: Build horizontal carousel, remove legalities

**Files:**
- Modify: `src/components/cards/CardDetail.tsx`

**Interfaces:**
- Consumes: `printings` state (populated in Task 1), `displayCard` state, `selectPrinting` function
- Produces: Carousel UI replacing legalities section

- [ ] **Step 1: Add carousel after the price section, replacing legalities**

Replace the legalities section (lines 727-742) with the carousel. The carousel goes AFTER the `</div>` that closes the md:flex-row (line 724) but inside the `p-6` div — same position as legalities currently:

```tsx
{/* Printings carousel — replaces Format Legalities */}
{loadingPrintings ? (
  <div className="mt-6 flex items-center justify-center gap-2 py-4 text-sm text-font-muted">
    <Loader2 className="h-4 w-4 animate-spin" />
    Loading printings...
  </div>
) : printings.length > 0 ? (
  <div className="mt-6">
    <p className="text-sm text-font-muted mb-3">
      All Printings ({printings.length})
    </p>
    <div className="relative">
      {/* Scrollable container */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {printings.map((p) => {
          const isSelected = p.id === displayCard.id
          return (
            <button
              key={p.id}
              onClick={() => selectPrinting(p)}
              className={`shrink-0 snap-start group rounded-lg transition-all ${
                isSelected
                  ? 'ring-2 ring-bg-accent scale-105'
                  : 'ring-1 ring-border hover:ring-bg-accent/50 hover:scale-[1.02]'
              }`}
            >
              {p.image_small ? (
                <img
                  src={p.image_small}
                  alt={p.set_name ?? 'Printing'}
                  width={146}
                  height={204}
                  loading="lazy"
                  className="h-[180px] w-auto rounded-t-lg object-contain bg-bg-cell"
                />
              ) : (
                <div className="h-[180px] w-[128px] flex items-center justify-center rounded-t-lg bg-bg-cell text-font-muted text-xs">
                  No image
                </div>
              )}
              <div className={`px-2 py-1.5 rounded-b-lg text-left ${
                isSelected ? 'bg-bg-accent/10' : 'bg-bg-card'
              }`}>
                <div className="text-[11px] font-medium text-font-primary truncate max-w-[120px]">
                  {p.set_name}
                </div>
                <div className="text-[10px] text-font-muted">
                  {p.set_code?.toUpperCase()} #{p.collector_number}
                  {p.prices_eur != null && (
                    <span className="ml-1 text-bg-green">€{Number(p.prices_eur).toFixed(2)}</span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  </div>
) : null}
```

- [ ] **Step 2: Remove legalities state reference**

The `legalities` variable is still used in the JSX below. Remove the entire legalities JSX block (the section that was there before, now moved to carousel). Also remove the `legalities` variable if no longer used elsewhere:

The `const legalities = displayCard.legalities as Record<string, string> | null` on line 184 is only used for the legalities section. If we're removing it, we can remove this const too. But wait — let me check if `displayCard.legalities` needs to be in the lazy-hydrate columns. Since we're removing the display, we can keep the data (it doesn't hurt) but remove the display.

Actually, leave the `legalities` const — it's harmless and removing it would require changing the lazy-hydrate columns. Just remove the JSX that renders it.

Delete lines 727-742:

```tsx
{/* REMOVE this entire block */}
{legalities && (
  <div className="mt-6">
    <p className="text-sm text-font-muted mb-2">Format Legalities</p>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {Object.entries(legalities).map(([format, status]) => (
        <div key={format} className={`px-2 py-1 rounded text-xs font-medium capitalize ${LEGALITY_COLORS[status] || 'bg-bg-cell text-font-muted'}`}>
          <span className="text-font-secondary">{format.replace(/_/g, ' ')}</span>
          <span className="ml-1">{status.replace(/_/g, ' ')}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Remove unused LEGALITY_COLORS constant**

Delete lines 82-87:

```tsx
const LEGALITY_COLORS: Record<string, string> = {
  legal: 'bg-bg-green/20 text-bg-green',
  not_legal: 'bg-bg-cell text-font-muted',
  banned: 'bg-bg-red/20 text-bg-red',
  restricted: 'bg-bg-yellow/20 text-bg-yellow',
}
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add src/components/cards/CardDetail.tsx
git commit -m "feat(card-detail): replace legalities with horizontal printing carousel"
```

---

### Task 3: Verify end-to-end flow

**Files:**
- No file changes — verification only

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test with browser**

Navigate to a deck page, click a card to open detail popup. Verify:
- Printings carousel loads automatically under the card details
- Horizontal scroll/swipe works on mobile
- Clicking a printing updates the main card image
- Prices update when switching printings
- Cardmarket link updates when switching printings
- In DeckEditor: switching printing persists via `onPrintingSelect`

- [ ] **Step 3: Commit any fixes if needed**
