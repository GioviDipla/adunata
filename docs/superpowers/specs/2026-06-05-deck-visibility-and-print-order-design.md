# Deck Visibility (tri-state) + Print Order UX Improvements

**Date:** 2026-06-05
**Scope:** Single PR bundling four related improvements around deck sharing and the print-order flow.

## Goals

1. **Tri-state visibility** — add `unlisted` between `private` and `public`, mirroring Moxfield semantics. Public decks remain SEO-indexable and listed on the owner's public profile; unlisted decks are accessible to anyone with the link but not surfaced anywhere.
2. **Anonymous viewer access to `DeckView`** — anyone with the link can read a public or unlisted deck without logging in.
3. **Gate Proxy action for anonymous viewers** — the Proxy button stays visible but, when clicked by an unauthenticated user, surfaces a short call-to-action linking to the login page with a `next` redirect back to the deck.
4. **Replace `Copy list` with the existing `DeckExport` modal in `DeckView`** — reuse the export modal already used in `DeckEditor` so visitors and owners share the same exporter affordances.
5. **Upgrade the print-order email** — set `reply_to` to the requester's email so StudioB35 can reply directly, and emit a Moxfield-compatible decklist (set code, collector number, foil marker).

## Non-Goals

- Deck forking/cloning by visitors (Moxfield's "fork" feature) — out of scope.
- Comments, likes, follow, or any other social actions on visitor view.
- Changing the existing owner-only `DeckEditor` flow.
- Push notifications, in-app inbox for replies, or any extra ingress for StudioB35.

## Current State (verified in code)

- `decks.visibility` column already exists (string, values currently in use: `'private'`, `'public'`).
- RLS migration `20260421170000_rls_public_decks_anon_readable.sql` already allows anon `SELECT` on `decks`/`deck_cards`/`profiles` when `visibility = 'public'`.
- `/app/(app)/decks/[id]/page.tsx` redirects anon users to `/login?next=...` only when the deck is not public; owners get `DeckEditor`, non-owners get `DeckView`.
- `DeckView` (visitor view) has a `Copy list` button (plain text copy) and an inline `Export shopping list` action.
- `DeckEditor` (owner view) renders a richer `<DeckExport>` modal (lazy-loaded via `next/dynamic`).
- `/api/print-order` already wired to Resend, currently `from: amministrazione@studiob35.com`, `to: servizioproxy@studiob35.com`, body uses `buildMoxfieldDecklist(entries)` which today emits only `"{qty} {name}"` lines and (bug) iterates `cards` instead of the `entries` argument.
- `deck_cards.is_foil` boolean exists in the DB but is **not** propagated to `ProxyPrintModal`'s `CardEntry` shape — it has only `{ card, quantity, board }`.

## Design

### 1. Visibility tri-state

**DB migration** (`supabase/migrations/<ts>_deck_visibility_unlisted.sql`):

- Add CHECK constraint on `decks.visibility`: `visibility IN ('private','unlisted','public')`.
- Default remains `'private'`.
- Update RLS `decks_select_public_or_owner` to allow `visibility IN ('public','unlisted')` for the anon read path.
- Update `deck_cards_select_public_or_owner` subquery to mirror the same `IN ('public','unlisted')` condition.
- `deck_tokens` policies that reference "public decks" — extend to `IN ('public','unlisted')` so tokens render on shared unlisted decks too. Verify in migration.
- `/u/[username]` profile listing must keep filtering on `visibility = 'public'` only (unlisted stays unlisted).

**API** (`/api/decks/[id]/visibility`): accept `'private' | 'unlisted' | 'public'`. Reject anything else with 400.

**UI** (`VisibilityToggle`): convert from two-button toggle to a three-option control. Icons: `Lock` (private), `Link` (unlisted), `Globe` (public). Hover/tap shows one-line explainer for each state.

**Page-level access** (`/decks/[id]/page.tsx`):
- `private` → redirect anon to `/login?next=/decks/{id}`; logged-in non-owners get 404.
- `unlisted` and `public` → render `DeckView` for any visitor (anon or logged-in non-owner).

**SEO** (`generateMetadata` in `decks/[id]/page.tsx`):
- `public` → existing OG + canonical (unchanged).
- `unlisted` → return same OG metadata so link previews work in WhatsApp/iMessage/Discord, **but** add `robots: { index: false, follow: false }` so Google does not index.
- `private` → return empty `Metadata` as today.

**`/u/[username]`** — unchanged; already filters `visibility = 'public'`.

### 2. Proxy gate for anonymous viewers

`DeckView` already exposes a Proxy button only to authenticated viewers (verify; if not, add one). For anon visitors:

- Render the button enabled (same visual treatment as auth users).
- `onClick`: if `viewerId == null`, open a small inline dialog ("AuthRequiredDialog") with the message:

  > Funzione riservata agli utenti registrati Adunata.
  > [Clicca qui per registrarti →]

  Link href: `/login?next=/decks/{id}`. Use the existing app login route; the `next` param is already supported by the deck page redirect path.

- Anon viewers never enter `ProxyPrintModal`; the dialog is the only side effect.
- Auth viewers behave exactly as today (open `ProxyPrintModal`).

`AuthRequiredDialog` lives next to `DeckView` (small new component, no shared dialog infrastructure needed). Closes on outside click, ESC, and "X". Reusable for future gated actions but only consumed here in this PR.

### 3. Replace `Copy list` with `DeckExport`

In `DeckView`:

- Remove the `Copy list` button, the `copyDeckList` function, the `copyError` state, and the inline `<>Copy list</>` UI.
- Add an `Export` button mirroring the styling used for the existing `Export shopping list` row (icon + label).
- Render `<DeckExport>` as a lazy `next/dynamic` import, identical to the `DeckEditor` consumption pattern. Wire its props the same way (`deck`, `cards`, `sections`, `onClose`).
- Anon users may use it: export is client-side (clipboard / file download), no auth needed.
- Keep the existing `Export shopping list` action exactly as today — it serves a different use case (Cardmarket-style price-only list) and lives in a different overflow menu.

### 4. Print-order email upgrades

**Route handler** (`src/app/api/print-order/route.ts`):

- Accept additional field `userEmail: string` in the POST body. Validate non-empty string and basic email shape (regex sufficient for our trust boundary — Resend will reject malformed downstream).
- Pass `reply_to: userEmail` to `resend.emails.send`.
- If `userEmail` missing → 400 (caller is our own front-end, easy to fix).

**Caller** (`ProxyPrintModal`):

- Add `userEmail: string` to `ProxyPrintModalProps`.
- Source in `/decks/[id]/page.tsx` from `user.email` (Supabase Auth) and pass through both `DeckEditor → ProxyPrintModal` and `DeckView → ProxyPrintModal`. The prop is required; both consumers gate the modal on `viewerId != null` so `userEmail` is always available when the modal mounts.
- Include `userEmail` in the POST body to `/api/print-order`.

**Moxfield decklist format**:

- Fix the iteration bug in `buildMoxfieldDecklist` — iterate `entries` (the argument), not the outer `cards` prop.
- New line format: `{qty} {name} ({SET}) {collector_number}{ *F* if foil}`. Examples:
  - `1 Sol Ring (CMR) 320`
  - `1 Sol Ring (CMR) 320 *F*`
- Section headers retained: `// Sideboard`, `// Maybeboard`, `// Tokens`.
- Propagate `is_foil` into `CardEntry` inside `ProxyPrintModal`:
  - Extend the interface: `{ card, quantity, board, isFoil: boolean }`.
  - Update the two call sites in `DeckEditor` (and any other passer) to forward `isFoil` from the `deck_cards` row already loaded in the page.
- `groupExpandedToEntries` must also preserve `isFoil` so that expanded-slot regrouping (used when sending from the preview screen) produces the same lines.

### Architecture/data flow summary

```
anon visitor → /decks/{id}
  └─ unlisted/public → DeckView (RLS allows read)
       ├─ Export button → <DeckExport> (client-only)
       └─ Proxy button → AuthRequiredDialog (anon) → /login?next=/decks/{id}

auth visitor (non-owner) → DeckView (same as above; Proxy → ProxyPrintModal)
auth owner → DeckEditor (unchanged)

ProxyPrintModal "Send to StudioB35"
  └─ POST /api/print-order { userName, userEmail, deckName, decklist, shareLink, timestamp }
       └─ resend.send({ from: amministrazione@studiob35.com,
                        to: servizioproxy@studiob35.com,
                        reply_to: userEmail,
                        html: ... })
```

### Error handling

- Invalid visibility value in API → 400.
- Missing `userEmail` in print-order POST → 400.
- DeckExport modal failures already handled by the existing component.
- AuthRequiredDialog has no I/O; nothing to error on.
- RLS denies on private deck for anon → covered by the page redirect, not the dialog.

### Testing

Manual (no automated tests for these flows in the repo today):

- Set a deck to each of `private`/`unlisted`/`public` and verify:
  - Anon viewer: private → login redirect; unlisted → DeckView visible; public → DeckView visible + OG metadata.
  - `/u/{username}` lists public only; unlisted hidden.
  - `robots` meta on unlisted contains `noindex, nofollow`; on public, no such meta.
- DeckView for anon: Proxy → dialog with login link; Export → modal opens.
- DeckView for auth non-owner: Proxy → ProxyPrintModal; Export → modal opens.
- Send a print order; verify the received email:
  - `Reply-To` header equals the requester's email and replying in the mail client targets that address.
  - Decklist body contains `1 Card Name (SET) NNN` and `*F*` for foil entries.

Build verification: `npx tsc --noEmit` after the `CardEntry` shape change to catch any prop-drilling miss.

## Open questions / decisions

- **Backfill of existing rows:** none needed — current values are already `'private'` or `'public'`, both still valid after the CHECK constraint is added.
- **Index on `decks.visibility`:** existing queries already filter on it (e.g., `/u/[username]`), but row counts are still small. No new index in this PR.
- **`DeckExport` props parity in `DeckView` vs `DeckEditor`:** `DeckExport` reads from a normalized card array — verify by file diff that the `DeckView` shape (`{ id, card, quantity, board, isFoil, section_id, tags, position_in_section }`) matches what `DeckEditor` already passes. If not, adapt at the call site, not inside `DeckExport`.
