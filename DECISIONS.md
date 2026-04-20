# Decision Log — Adunata

Questo file viene aggiornato automaticamente da Claude Code durante lo sviluppo.
Ogni riga documenta una scelta tecnica autonoma con la relativa motivazione.

---

## Architettura

- **Next.js 15 App Router** — Framework principale. App Router per Server Components, streaming, e layout nesting. Deploy nativo su Vercel con zero config.
- **Supabase** — Auth (email/password), PostgreSQL database, Storage (immagini carte). Free tier copre la fase iniziale.
- **Tailwind CSS v4** — Già usato nei mockup Pencil. Design system dark-themed con CSS variables.
- **PWA con next-pwa** — Service worker per offline support e installabilità su iOS/Android. Architettura compatibile con future build native (Capacitor).
- **Lucide React** — Iconografia già presente nei mockup.
- **TypeScript strict** — Type safety su tutto il codebase.

## Database

- **Carte MTG in Supabase PostgreSQL** — Tabella `cards` con full-text search via `tsvector`. Immagini referenziate da URL Scryfall.
- **Popolamento on-demand** — Le carte vengono scaricate da Scryfall solo quando servono (import decklist, ricerca). Nessun bulk sync. Il DB si riempie progressivamente con l'uso.
- **RLS (Row Level Security)** — Ogni utente vede solo i propri deck. Tabella `cards` leggibile pubblicamente. Policy Supabase native.

## Gestione Deck

- **Import multi-formato** — Parser per MTGO, Moxfield, Archidekt. Regex-based con fallback su nome carta.
- **Statistiche real-time** — Calcolate client-side dal contenuto del deck, no denormalizzazione.
- **Goldfish mode** — Simulazione prima pescata e mulligan. Logica shuffle Fisher-Yates client-side.

## Future-proofing

- **Schema `game_lobbies` e `game_states` predisposti** — Tabelle create ma non popolate. Pronti per matchmaking e tavolo virtuale.
- **Supabase Realtime** — Channel-based per future game sessions. Nessun WebSocket custom necessario.
- **Struttura componenti modulare** — Componenti game (battlefield, hand, zones) già separati nei mockup. Riutilizzabili per il tavolo virtuale.

## Sessione 2026-04-10 (perf) — navigazione percepita

- **Problema**: utenti in beta lamentano che "ogni click è lentissimo". Audit trovate 4 cause:
  1. **Zero `loading.tsx`** sotto `src/app/(app)/**` → ogni click dava schermata congelata finché il server component non finiva il fetch.
  2. **Data waterfalls**: `dashboard/page.tsx` faceva 3 query sequenziali (decks count → deck ids → deck_cards), `play/page.tsx` sequenziale su decks+players, `decks/[id]/page.tsx` e `goldfish/page.tsx` sequenziale su deck+deck_cards, `play/[lobbyId]/game/page.tsx` sequenziale su lobby+player.
  3. **Triplo `supabase.auth.getUser()`**: middleware + layout + pagina figlia ciascuno chiamava `getUser()` (round-trip auth) per ogni navigazione.
  4. **`<img>` plain**: immagini Scryfall ad alta risoluzione (card detail, deck covers, card browser) senza `next/image` = nessun AVIF/WebP, nessun srcset.
- **Fix**:
  - `src/lib/supabase/get-user.ts` nuovo helper `getAuthenticatedUser()` wrappato in `React.cache()`. Layout + page condividono lo stesso user validato in una singola richiesta. Rimuove 2 round-trip auth per navigazione.
  - 8 nuovi `loading.tsx` sotto `src/app/(app)/**` (root + dashboard + decks + decks/[id] + decks/[id]/goldfish + cards + play + play/[lobbyId]/game) con skeleton che matchano il layout della pagina reale → feedback istantaneo al click.
  - Parallelizzate tutte le query indipendenti con `Promise.all()` in: dashboard, play, decks/[id], decks/[id]/goldfish, play/[lobbyId]/game.
  - Dashboard: eliminata la query separata per `deck_ids` — RLS su `deck_cards` filtra già per utente autenticato (`deck_id in (select id from decks where user_id = auth.uid())`), quindi basta `.from('deck_cards').select('quantity')`.
  - `<a href="/play">` in `PlayGame.tsx` sostituito con `<Link>` (evita full page reload).
  - `next/image` con `fill`/`sizes` per `CardItem`, `CardDetail`, `decks/page.tsx` cover — riduzione pesante sui byte trasferiti nel card browser (40 img × ~100KB → AVIF/WebP responsive).
- **Immagini game UI**: lasciate come `<img>` con `loading="lazy"`. Sono 48–72px wide, Scryfall serve già `image_small` (146×204 ~20KB) ottimale a queste dimensioni. L'overhead di `next/image` su 20+ carte sul battlefield non ripaga.

## Sessione 2026-04-10 (bugfix) — fasi di combat bloccate

- **Bug**: Dopo `declare_attackers` (sia con attaccanti che con "Skip"), l'engine impostava solo `priorityPlayerId` senza far avanzare la fase. L'overlay `CombatAttackers` era renderizzato con la condizione `phase === 'declare_attackers' && isActivePlayer && hasPriority`, quindi restava visibile dopo l'azione e l'utente pensava che il click non facesse nulla. Stessa situazione per `declare_blockers` e `combat_damage` (che lasciava AP con priorità in una fase "morta").
- **Fix**: `handleDeclareAttackers`/`handleDeclareBlockers`/`handleCombatDamage` in `src/lib/game/engine.ts` ora fanno auto-advance delle sub-fasi di combat:
  - `declare_attackers` senza attaccanti → salta direttamente a `main2` (niente dichiarazione blocker, niente damage)
  - `declare_attackers` con attaccanti → avanza a `declare_blockers`, priorità a NAP
  - `declare_blockers` → avanza a `combat_damage`, priorità ad AP (la `useEffect` in `PlayGame` auto-calcola il danno)
  - `combat_damage` → applica danni, sposta creature letali nel graveyard, reset di `combat`, phase → `main2`, priorità ad AP
- **Race condition discard**: `handleDiscard` in `PlayGame` inviava N azioni di scarto in parallelo con `for + sendAction` senza `await`, rischiando letture/scritture concorrenti su `game_states` (perdita di scarti). Ora è sequenziale con `await`.
- **Audit altre fasi**: tutte le altre fasi (untap, upkeep, draw, main1, begin_combat, end_combat, main2, end_step, cleanup) non hanno "blocchi di click" ma usano il normale priority-pass dance (AP passa → NAP passa → advance). I click producono sempre un cambio di stato visibile.

## Sessione 2026-04-10 — parity goldfish/multiplayer, import, sort

- **`CardPreviewOverlay` condiviso** (`src/components/game/CardPreviewOverlay.tsx`) — Estratto dal JSX inline di `GoldfishGame` per essere riusato da `PlayGame`. Riceve uno `PreviewState` e callback per azioni contestuali (battlefield/hand/commandZone). Scelta: componente di presentazione puro con callback esterni, così i due host (goldfish locale vs multiplayer server-driven) possono cablare i propri handler.
- **`isCommander` nel CardMap multiplayer** — Aggiunto campo `isCommander: boolean` a `CardMap` (`src/lib/game/types.ts`) e popolato in `src/app/api/game/[id]/route.ts`. Necessario perché il preview nel multiplayer deve mostrare "Return to Command Zone" solo per carte commander.
- **`move_zone` da library** — Estesa `handleMoveZone` in `src/lib/game/engine.ts` per supportare `from === 'library'`, così il library viewer può rimandare una carta in mano (tutor effect).
- **Bulk import deck via RPC Postgres** — Creato index `idx_cards_name_lower` e RPC `lookup_cards_by_names(text[])` (migration `20260410000000_bulk_card_lookup.sql`). Il route `POST /api/decks/[id]/cards/bulk-import` fa una sola chiamata RPC invece di N+1 lookup, fallback parallel Promise.all su Scryfall per le non trovate, batch insert/update dei `deck_cards`. Rimosso il delay 120ms/carta e la progress bar per-card nel modal. Motivo: 60 carte passavano da ~15s a <1s.
- **Sort/filter deck editor** — `DeckEditor` accetta `sortMode: 'type' | 'name' | 'cmc'` e `typeFilter: Set<string>`. `type` mantiene il raggruppamento esistente (CMC poi nome), `name`/`cmc` producono un singolo gruppo flat. Il filtro toglie carte il cui tipo non è selezionato. `DeckTextView` accetta prop opzionale `groups` per condividere la stessa struttura pre-ordinata.

## Sessione 2026-04-20 — refresh prezzi Cardmarket notturno

- **Rolling stale-first su `last_price_update`** — Aggiunta colonna `last_price_update timestamptz` a `cards` con index `(last_price_update NULLS FIRST)`. Il cron `/api/cron/update-prices` non filtra più `prices_eur IS NULL`, ma ordina per `last_price_update ASC NULLS FIRST` e stampa `now()` su ogni riga processata. Il loop macina fino a scadere il budget Vercel (4.5 min di runtime utili) e alla prossima esecuzione riprende dalle carte più stantie. Motivo: l'utente vuole prezzi aggiornati ogni notte, ma ~80k carte in 5 minuti non si refreshano in un solo run — la sliding window rotante copre l'intero catalogo in 2-3 notti garantendo che nessuna carta resti "vecchia" più del necessario.
- **Schedule cron `0 3 * * *`** — Spostato da settimanale (lunedì) a giornaliero (ogni notte 03:00 UTC = 05:00 Europe/Rome). Scryfall aggiorna i prezzi Cardmarket una volta al giorno, quindi una frequenza maggiore non avrebbe senso.
- **Fix `prices_eur_foil` da Cardmarket** — Il vecchio cron copiava erroneamente `sc.prices.usd_foil` in `prices_eur_foil`. Il nuovo codice legge `sc.prices.eur_foil`. Esteso il tipo `ScryfallCard.prices` per esplicitare `eur` / `eur_foil`.

## Sessione 2026-04-20 — performance pagina Cards

- **Thumbnail `image_small` invece di `image_normal`** — In `CardItem` il grid ora carica la 146×204 (~10KB) invece della 488×680 (~100KB). L'hover preview (desktop) e il `CardDetail` continuano a leggere `image_normal`, quindi il campo resta in `CARD_GRID_COLUMNS`. Riduzione tipica del payload immagini al primo paint: ~85-90%.
- **`CARD_GRID_COLUMNS` slim** — Rimossi `keywords` e `colors`. Il filtro "Rules Text" ora passa per `oracle_text` (non più array keywords), e il filtro Commander usa solo `color_identity`.
- **`unstable_cache` su Newest 40 + sets** — `cards/page.tsx` racchiude le due query shared-across-users in `unstable_cache(..., { revalidate: 3600, tags: ['cards','sets'] })`. La query user-specific `decks` resta fuori dalla cache e parte in parallelo con il wrapper cachato. Motivo: la lista sets (`get_distinct_sets`) è un GROUP BY su 34k righe che non cambia entro l'ora, e le prime 40 carte "Newest" sono identiche per tutti.
- **Cache invalidation da cron prezzi** — `/api/cron/update-prices` chiama `revalidateTag('cards', 'max')` al termine del refresh notturno, così l'HIT successivo serve immediatamente i nuovi prezzi senza attendere il revalidate dell'ora. Firma `(tag, profile)` richiesta da Next.js 16; profilo `'max'` = TTL implicito più lungo.
- **Keyset pagination su sort default** — `CardBrowser.buildQuery` accetta `{ offset?, after? }`. Per `sortBy === 'released_at_desc'` (90% dei casi) usa un cursor `(released_at, id)` con filtro `or(released_at.lt.X, and(released_at.eq.X, id.lt.Y))` + `.limit(PAGE_SIZE)`. Gli altri sort (name/cmc/price/type) restano su `.range(offset, offset+39)` offset-based — tempo di risposta stabile fino a depth tipiche. Motivo: evitare di implementare cursor compound robusto su tutti i 7 sort (null-handling, tie-break multipli), che sarebbe un refactor sproporzionato per una UI di browse. Tempo di Load More profondo sul default: da O(offset) a O(1).
- **Index Postgres a supporto** — Aggiunti `idx_cards_released_at_id_desc` compound su `(released_at DESC NULLS LAST, id DESC)` per il keyset cursor; `idx_cards_color_identity_gin` GIN su `color_identity` per accelerare i filtri `contains/overlaps/containedBy` (incluso il nuovo Commander Color Identity).
