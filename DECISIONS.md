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

## Sessione 2026-04-20 — daily bulk sync (nuove carte + prezzi)

- **`/api/cron/daily-sync`** — Nuovo cron giornaliero (`0 3 * * *` UTC = 05:00 Europe/Rome in DST) che scarica il bulk `oracle_cards` da Scryfall (~50MB compresso, ~160MB JSON) e fa `upsert(onConflict=scryfall_id)` di tutte le carte in un colpo solo. Un singolo run copre sia le nuove carte (inserts) sia l'aggiornamento dei prezzi EUR/USD (updates) per TUTTO il catalogo (~35k righe) in ~30s di esecuzione. Motivo: l'approccio precedente `update-prices` via `/cards/collection` era rolling e richiedeva 2-3 notti per coprire tutto; con il bulk è tutto in un run.
- **Short-circuit su `sync_metadata.daily_bulk_sync`**: salva `entry.updated_at` di Scryfall come versione. Se il cron gira e la versione è già presente, esce in ≤1s. Scryfall rilascia un nuovo bulk una volta al giorno, quindi il risparmio è grande sui re-run.
- **`last_price_update = now()` uniforme**: il bulk stamppa il timestamp su tutte le righe aggiornate, rendendo ordini stale-first del vecchio cron coerenti.
- **`update-prices` route deprecata ma NON cancellata**: la route resta nel codice e gestisce ancora la rolling strategy via `/cards/collection`. Non è più nello `crons[]` di `vercel.json`, ma può essere invocata manualmente con `CRON_SECRET` come fallback on-demand.
- **Rischio memoria**: il bulk parse sta sui ~400-500MB RAM peak, comodo su Vercel Pro (3GB) ma stretto su Hobby (1GB). Se il deploy va su Hobby, fallback al rolling update-prices.

## Sessione 2026-04-21 — fase-1 keyword/trigger UI layer (commit `f177d3c`)

> **Rollback checkpoint**: HEAD precedente a queste modifiche = `79a03b7`. Per tornare allo stato pre-keyword-layer: `git revert f177d3c` (sicuro, non tocca la storia) oppure `git reset --hard 79a03b7 && git push --force-with-lease` (distruttivo, evitare se possibile).
>
> **Rollback del DB**: le 6 colonne aggiunte sono additive e `NOT NULL DEFAULT false` — lasciarle in DB non rompe nulla anche se il codice viene revertato. Se proprio servisse smontarle: `ALTER TABLE cards DROP COLUMN has_upkeep_trigger, DROP COLUMN has_etb_trigger, DROP COLUMN has_attacks_trigger, DROP COLUMN has_dies_trigger, DROP COLUMN has_end_step_trigger, DROP COLUMN has_cast_trigger;` (migration `cards_phase_trigger_flags`).

- **Principio**: zero runtime parsing del testo oracolo. Pre-computazione al import-time = lookup O(1) su boolean al render. L'utente ha posto "priorità 1 = non rallentare il motore" — questa scelta elimina ogni regex/parse in hot path.
- **DB (migration `cards_phase_trigger_flags`)**: 6 colonne boolean NOT NULL DEFAULT false su `cards`:
  - `has_upkeep_trigger` — `at the beginning of [^.]*upkeep`
  - `has_etb_trigger` — `(when|whenever) [^.]*enters`
  - `has_attacks_trigger` — `whenever [^.]*attacks`
  - `has_dies_trigger` — `(when|whenever) [^.]*dies`
  - `has_end_step_trigger` — `at the beginning of [^.]*end step`
  - `has_cast_trigger` — `(when|whenever) [^.]*casts?\s`
  Backfill one-shot con gli stessi regex su `oracle_text`. Risultato: 1574 upkeep / 6042 etb / 1804 attacks / 1449 dies / 1253 end_step / 2078 cast su 34959 carte.
- **`scripts/bulk-sync.mjs`** estende `mapCard()` con gli stessi regex applicati a oracle full-text (inclusi `card_faces` per DFC/flip). I future import arrivano già etichettati — nessun re-backfill da lanciare a mano.
- **`CardMap`** (`src/lib/game/types.ts`) esteso con `keywords: string[] | null` + le 6 flag `hasUpkeepTrigger`…`hasCastTrigger`. `keywords` viene da Scryfall (già popolato da anni) e copre Vigilance/Flying/Trample/Deathtouch/Lifelink/Haste/Menace/Reach/Defender/Hexproof/Indestructible/First Strike/Double Strike/Fear/Flash gratis.
- **`toCardMapEntry` single source of truth** (`src/lib/game/card-map.ts`): nuovo helper usato da tutti e 3 i builder (`/api/game/[id]/route.ts`, `(app)/decks/[id]/goldfish/page.tsx`, `(app)/play/[lobbyId]/history/page.tsx`). Evita 3 punti dove un campo nuovo può essere dimenticato — lezione appresa da `isCommander` che era stato propagato solo parzialmente.
- **`CARD_GAME_COLUMNS`** (`src/lib/supabase/columns.ts`) esteso con le 6 flag. La history page che prima selezionava un sottoinsieme custom ora passa anche lei da `CARD_GAME_COLUMNS`.
- **`KeywordBadges`** (`src/components/play/KeywordBadges.tsx`): mappa 15 keyword → icone lucide (Eye/Feather/Footprints/Skull/HeartPulse/Zap/Flame/MoveUp/Shield/ShieldCheck/ShieldPlus/Sword/Swords/Ghost/Sparkles). Max 3 badge per carta in priorità (volo > reach > vigilanza > …). Badge = cerchio nero semi-trasparente con ring bianco sottile + icona tonale, posizionati top-right della carta.
- **`BattlefieldZone`** (`src/components/goldfish/BattlefieldZone.tsx`): card size da 68×95 → 80×112 (stesso rapporto 5/7, +17% superficie, badge leggibili senza zoom). Accetta `phase?: GamePhase`; `phaseTriggerKey()` mappa la fase corrente al campo relativo (`upkeep` → `has_upkeep_trigger`, `end_step` → `has_end_step_trigger`, `declare_attackers` → `has_attacks_trigger`) e aggiunge `ring-2 ring-amber-300 ring-offset-1` alle carte il cui flag corrisponde. Le altre fasi non mostrano ring (niente draw/main/combat — meno visually noisy).
- **Defender filter**: `CombatAttackers` e `hasEligibleAttackers` in `PlayGame` escludono le carte con `keywords includes 'defender'`. Se una creatura con Defender è l'unica sul campo, l'overlay viene comunque auto-skippato dalla logica della sessione precedente.
- **Limiti consci**: i regex sono euristici, non un parser vero. Casi limite non coperti:
  - "At the beginning of **the next** end step" (inclinato per alcune transformation) → match
  - "Whenever **a permanent** enters" → match (può risultare in falsi positivi su animations)
  - "Enters tapped" → match (ma non è un trigger vero) — accettato, ring è un *hint*, non una verità
  - Trigger su zone diverse (da cimitero, da esilio) → non distinti — ring può fuorviare
  Il layer è esplicitamente UI, non engine. Serve a ricordare al giocatore di pensare alla fase, non a risolvere automaticamente i trigger.

## Sessione 2026-04-20 — context menu su Card Browser (long-press / right-click)

- **Tabella `card_likes`** — `(user_id, card_id, created_at)`, PK composta, RLS "own only" (SELECT/INSERT/DELETE filtrati da `auth.uid() = user_id`), index `(user_id, created_at desc)` per la list-liked. Motivo: il "Like" è per-user, quindi non può stare come colonna su `cards`.
- **API toggle: `POST /api/cards/[id]/like`** — idempotente a livello utente, legge se la riga esiste → DELETE se sì, INSERT se no. Torna `{ liked: boolean }`. No need per rate limiting (già protetto da RLS e volume naturale).
- **`CardContextMenu` popup** — nuovo componente fixed-position con 3 azioni: "+ Deck" apre il `CardDetail` esistente (ha già il flow Add to Deck), "Like" toggla via API con optimistic update + rollback, "Share" usa `navigator.share` con fallback `clipboard.writeText`. URL di share: `{origin}/cards?open={cardId}` (deep-link al detail modal).
- **Deep-link `?open=<id>`** — `CardBrowser` al mount legge il query param, apre il `CardDetail` sulla carta corrispondente (cerca prima in `initialCards`, altrimenti fetcha). Consente a chi riceve lo share di arrivare al detail.
- **Long-press + right-click coerenti** — `CardItem` integra il `useLongPress` esistente. onContextMenu (right-click) passa `e.clientX/Y`; onLongPress passa il centro del bounding rect della card. Il click normale è soppresso se `wasLongPress()` è true.
- **Filtro "Liked only"** — toggle nel pannello Filters che applica `.in('id', Array.from(likedIds))`. Quando `likedIds.size === 0` usa un UUID impossibile come shortcut (PostgREST non accetta `.in('id', [])`).

## Sessione 2026-04-21 — fix /cards empty after nightly sync (commit su `claude/fix-cards-section-GyA9N`)

- **Rimosso `unstable_cache` dal wrapper "Newest 40 + sets" in `src/app/(app)/cards/page.tsx`.** Diagnosi: dopo il primo run del cron `daily-sync` la pagina `/cards` mostrava 0 carte e 0 set. Root cause: combinazione di due bug.
  1. `revalidateTag('cards', 'max')` in Next.js 16 **non evicta**: con il profilo `'max'` marca l'entry come stale-but-usable per 1 anno (`expire: 31536000`). L'entry resta in cache e viene servita stale mentre una revalidation va in background.
  2. Il wrapper `unstable_cache` faceva `data || []` sia sulla query delle 40 carte che sulla RPC `get_distinct_sets`. Qualunque errore transitorio Supabase durante la revalidation in background → `data = null` → `[]` persistito in cache → ogni visitatore vede pagina vuota fino al TTL di 1h.
- **Fix minimale**: query inline su ogni request. 40 righe + GROUP BY su 34k con indice → costi trascurabili rispetto al valore di avere sempre dati corretti. Gli errori Supabase ora loggano invece di essere swallowati in un empty array.
- **`revalidateTag(...)` rimossi** da entrambi i cron (`daily-sync`, `update-prices`) visto che non c'è più un bundle cached da invalidare. Se in futuro si riaggiunge la cache, usare `'use cache'` con profilo esplicito o wrappare la cache SOLO sul ramo success (non cachare mai risultati vuoti).
- **Lezione generica**: ogni `unstable_cache(fn)` dove `fn` fa fallback silenzioso su `[]/null` in caso di errore è una trappola — il primo errore transitorio avvelena la cache. Pattern corretto: (a) propagare l'errore e non cacheare, oppure (b) avere una guardia `if (data == null) throw new Error(...)` dentro la funzione cachata, così Next non memorizza il risultato.

2026-04-24 — Deck sections: opted for free-form sections (not fixed columns) + free-form tags (text[]+GIN). Deferred Scryfall Tagger auto_rule to a follow-up — functional_tags ingestion is out of scope.
2026-04-24 — Section preset only for Commander. Other formats hit "Add section" manually — no multi-format preset until we see usage data.
2026-04-24 — Collection overlay aggregates owned quantity across foil/language/condition splits. Users asking "do I own this card?" rarely care about matching condition. Data kept for future valuation/tradelist features.
2026-04-24 — CSV import skips unresolved card names silently (returned as `skipped` count). No fuzzy match — rely on Scryfall canonical names. Surface a remediation UI as a follow-up if user feedback demands it.
