# Checkpoint — Adunata

Stato: **IN PRODUZIONE** — deployato su Vercel, in uso attivo.

Ultimo aggiornamento: 2026-04-21.

**Commit di riferimento per rollback rapido**: `f177d3c` (post fase-1 keyword/trigger layer). HEAD precedente pulito: `79a03b7`.

---

## Feature attive

### Autenticazione e profilo
- [x] Registrazione email/password con conferma
- [x] Login email/password + Google OAuth
- [x] Profilo utente editabile (username, display name, bio, avatar)
- [x] Profilo pubblico su `/u/[username]`
- [x] Ricerca utenti con trigram

### Catalogo carte
- [x] Bulk sync Scryfall (~30k carte oracle)
- [x] Full-text search su nome + oracle text
- [x] Filtri: colore, tipo, rarità, CMC, set, formato
- [x] Lookup on-demand per carte mancanti in DB
- [x] Prezzi EUR (Cardmarket) e USD (TCGPlayer) aggiornati settimanalmente via cron
- [x] Dettaglio carta con tutte le stampe e legalità per formato

### Gestione deck
- [x] CRUD mazzi con rename, delete, duplicazione
- [x] Editor con tab Main / Sideboard / Maybeboard / **Token**
- [x] Import da MTGO / Moxfield / Archidekt (batch lookup via RPC)
- [x] Export in più formati
- [x] Proxy PDF A4 9-up (stampabile)
- [x] Statistiche: curva di mana, colori, tipi, CMC medio, valore economico
- [x] Sort e filtri (type / name / cmc)
- [x] Visibility toggle (private / public)
- [x] Switch tra stampe diverse della stessa carta
- [x] Commander assignment con RLS-aware public preview
- [x] Deck analytics v1 (Monte Carlo keep/screw/flood, turn-to-commander, sources, rarity, set, top expensive)

### Collezione
- [x] Tabella `user_cards` con foil/lingua/condizione/prezzo acquisto
- [x] Pagina `/collection` con virtualized grid + filtri + search
- [x] Import CSV (Deckbox, Moxfield, Manabox)
- [x] Deck overlay owned/missing + export shopping list

### Goldfish
- [x] Simulazione prima pescata (7 carte)
- [x] London Mulligan completo
- [x] Fasi (Untap → Cleanup) con auto-advance nei combat
- [x] Tap/untap, battlefield, graveyard, exile, command zone
- [x] Contatore vita e turni
- [x] Long-press per preview + azioni contestuali
- [x] Token creator (custom + da deck_cards board='tokens')

### Keyword / trigger UI layer (2026-04-21)
- [x] 6 colonne boolean trigger su `cards` (upkeep/etb/attacks/dies/end_step/cast) backfillate e indicizzate in CardMap
- [x] `KeywordBadges` — 15 icone lucide su battlefield (Vigilance/Flying/Trample/Deathtouch/Lifelink/Haste/Menace/Reach/Defender/Hexproof/Indestructible/First Strike/Double Strike/Fear/Flash)
- [x] Ring ambra su carte con trigger nella fase corrente (upkeep, end_step, declare_attackers)
- [x] Defender escluso dagli attaccanti
- [x] Card battlefield ingrandite a 80×112 (stesso rapporto 5/7)
- [x] Bulk sync script già etichetta i nuovi import via regex su oracle_text

### Multiplayer 1v1
- [x] Lobby con codice condivisibile
- [x] Selezione mazzo e formato per giocatore
- [x] Stato partita in tempo reale via Supabase Realtime
- [x] Log azioni in-game persistente
- [x] Gestione fasi + priorità (AP / NAP)
- [x] Mulligan sincronizzato
- [x] Zone condivise: mano privata, battlefield pubblico, cimitero, esilio
- [x] Scry / Surveil / Peak / Mill / Draw X dal menu Special
- [x] Create Token dal menu Special, con preset del mazzo
- [x] Chat in-game
- [x] Auto-naming e rename delle lobby finite
- [x] Storico partite visualizzabile (replay read-only)

### UX / PWA
- [x] Layout responsive (sidebar desktop, bottom tabs mobile)
- [x] Design system dark-themed coerente
- [x] PWA installabile su iOS/Android
- [x] Loading skeletons su tutte le route autenticate
- [x] Parallel data fetching (Promise.all) su tutte le pagine pesanti
- [x] Pagina /about linkata dalla sidebar

### Ops
- [x] Deploy automatico su Vercel da branch `main`
- [x] Cron mensile sync carte
- [x] Cron settimanale update prezzi EUR/USD
- [x] RLS su tutte le tabelle user-scoped
- [x] Tabelle Realtime pubblicate esplicitamente via `ALTER PUBLICATION`

---

## Backlog aperto

Feature proposte ma non prioritarie al momento. Niente di bloccante.

- Notifiche push per turno avversario (web push)
- Spettatori nelle lobby
- Statistiche aggregate profilo (formati preferiti)
- Migliorare drasticamente la Dashboard
- Profilo dell'utente molto piu bello e descrittivo; immagini dei deck pubblici
- Sezione Decks come su moxfield, con filtro per comandante e like
- Supporto formato Commander con regole specifiche (color identity, lista singleton)
- Deck Analitics molto piu dettagliati e "parlanti"
- Integrazione con EDRECH tramite OpenAPI ("https://apify.com/jungle_synthesizer/edhrec-mtg-commander-meta-scraper/api/openapi")
- miglioramento grafica UI e UX multiplayer

## Bug noti / debiti tecnici

Nessuno bloccante. Vedi `DECISIONS.md` per il log delle lezioni apprese.

---

## 2026-05-06 — Mobile DnD + zone redesign + perf (COMPLETATO)

Branch: `claude/distracted-engelbart-8784db` (tracks origin/dev)
Plan: `docs/superpowers/plans/2026-05-06-mobile-dnd-and-perf.md`

### Implementato
- [x] Hook `useDndSensors` condiviso (Pointer 12px + Touch delay 220 tolerance 8)
- [x] Mano scrollabile su mobile (touch-action pan-x)
- [x] Handle drag visibile su mobile in SidebarCards
- [x] Drop target su graveyard / exile / library / hand
- [x] handleDragEnd dispatcha tutti i from→to via createMoveZone
- [x] ZoneStack widget card-sized 56×78 con preview top card
- [x] Battlefield cards draggabili out
- [x] Section right padding asimmetrico
- [x] Expand/Collapse-all sezioni (PATCH bulk endpoint + toolbar button)
- [x] CardBrowser loadMore stabilizzato (cardsRef + loadMoreAbortRef)
- [x] globals.css: drop scrollbar-gutter + body touch-action

### Saltato consapevolmente
- Drag-out da CardZoneViewer (modal copre drop target — action menu copre la stessa UX)
- `.fixed.inset-0` selector scoping (alta churn, basso valore)
- Library top/bottom split-drop (default top sufficiente, bottom via action menu)

<!-- Claude: stato corrente — piattaforma live, iterazione continua -->
