# Adunata — Piano Implementazioni

> Stato attuale (2026-05-10). Sezioni completate marcate ✅, resto è backlog pianificato.

**Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + Realtime + Storage), Vercel Fluid Compute, AI SDK v6, Upstash Redis.

---

## Riepilogo stato

| Priorità | Feature | Stato | Note |
|----------|---------|-------|------|
| P0 | Sezioni + tag nei deck | ✅ DONE | Free-form sections, text[] tags + GIN, drag-and-drop, preset Commander |
| P0 | AI rules assistant (GoblinAI) | ✅ DONE | RAG con DeepSeek, @mention chips, citation CR, subdomain |
| P0 | Card scanner AI | ❌ Not started | Pipeline definita, nessuna implementazione |
| P1 | Deck analytics core | ✅ DONE | Mana curve, colors, types, CMC avg, Monte Carlo keep/screw/flood, turn-to-commander |
| P1 | Power level estimator | ❌ Not started | Formula definita, nessuna implementazione |
| P1 | Goldfish simulator | ✅ DONE | Web Worker Monte Carlo, mulligan, 15 turni |
| P1 | Combo detector + synergy graph | ❌ Not started | Schema definito, Commander Spellbook ingestion non fatto |
| P1 | Collection management | ✅ DONE | user_cards, /collection, CSV import, deck overlay, shopping list |
| P2 | Playgroup + ELO + meta | ❌ Not started | |
| P2 | Multiplayer (4-pod, spectator, voice) | 🔶 Partial | 1v1 completo; spectator/replay base fatto; 4-pod, voice no |
| P3 | Social, feed, content | ❌ Not started | |
| P3 | Tournament tools | ❌ Not started | |
| P3 | Deck diff visuale | ❌ Not started | |

---

## ✅ P0 — Sezioni e tag nei deck (COMPLETATO)

Implementato 2026-04-24. Decisioni in `DECISIONS.md`:

- **Sezioni free-form** (non colonne fisse). Ogni deck può definire le proprie sezioni.
- **Tag come `text[]` + GIN index** su `deck_cards.tags`.
- **Preset Commander** con 9 sezioni predefinite.
- **Drag-and-drop** via `@dnd-kit/core` + `@dnd-kit/sortable`.
- **Auto-categorizzazione Scryfall Tagger** rimandata a follow-up.
- **Ordinamento**: manuale (position_in_section) o dinamico (CMC, name, color).

Schema DB implementato:
- `deck_sections` (id, deck_id, name, position, color, is_collapsed)
- `deck_cards.section_id`, `deck_cards.tags`, `deck_cards.position_in_section`

---

## ✅ P0 — AI rules assistant: GoblinAI (COMPLETATO)

Implementato 2026-04/05. Non segue l'architettura RAG descritta nel piano originale — invece usa DeepSeek con context assembly da DB.

Componenti attivi:
- `src/app/goblinai/` — UI chat standalone (PWA installabile come companion)
- `src/app/api/goblinai/` — API endpoint (answer, restatement, rules)
- Subdomain middleware per `goblinai.studiob35.com`
- @mention chips per citare carte nel prompt
- Citation CR numbers con link
- Ingestion rules e rulings da Scryfall

**Non implementato rispetto al piano:**
- pgvector / embedding search (usa keyword matching + DB lookup)
- Modalità locale con Gemma (solo server-side DeepSeek)
- Verification stage automatico delle citazioni

---

## ❌ P0 — AI locale: scanner carte + riconoscimento versione

**Stato:** Non iniziato. Pipeline 9-stage definita nel documento ma nessuna implementazione.

La sezione architetturale completa (OpenCV.js → OCR → Scryfall lookup → CLIP/SigLIP embeddings → frame classifier → finish detector → confirmation UI) è conservata come reference design per quando la feature verrà prioritizzata.

---

## ✅ P1 — Deck analytics (PARZIALE)

### Fatto
- Mana curve histogram
- Color pip distribution + color identity
- Card type breakdown
- Average/median CMC
- Prezzo totale EUR/USD + top 10
- Rarity e set breakdown
- Monte Carlo: opening hand keep rate, mana screw/flood, turn-to-commander, color source count
- UI tab Stats nella pagina deck

### Non fatto
- Ramp/removal/draw/tutor count (richiede Scryfall Tagger)
- Salt score (EDHREC)
- Popularity in format
- Archetype classifier
- Meta matchup win rate
- Mulligan advisor
- Dead card %

---

## ✅ P1 — Goldfish simulator (COMPLETATO)

Implementato con Web Worker isolato. Metriche raccolte:
- Turno medio cast commander
- Turno medio wincon
- Keep rate mulligan
- Mana screw/flood %
- Dead card rate

---

## ❌ P1 — Power level estimator deterministico

**Stato:** Non iniziato. Formula definita (COMBO_SCORE + SPEED_SCORE + TUTOR_SCORE + INTERACTION_SCORE + CONSISTENCY_SCORE) ma richiede prerequisiti non ancora pronti (combo DB, functional tags).

---

## ❌ P1 — Combo detector + synergy graph

**Stato:** Non iniziato. Schema DB definito (`combos`, `combo_cards`, `card_synergies`). L'ingestion da Commander Spellbook API non è stata implementata.

---

## ✅ P1 — Collection management + deck overlay (COMPLETATO)

Implementato:
- `user_cards` table con foil/lingua/condizione/prezzo
- Pagina `/collection` con virtualized grid + filtri + search
- Import CSV (Deckbox, Moxfield, Manabox)
- Deck overlay owned/missing con export shopping list
- Aggiunta rapida da card detail

---

## 🔶 P2 — Multiplayer extensions (PARZIALE)

### Fatto
- Multiplayer 1v1 completo: lobby, realtime, fasi, priorità AP/NAP, mulligan, chat
- Game event log persistente (`game_events`)
- Replay read-only delle partite passate
- Log azioni in-game

### Non fatto
- 4-pod (4 giocatori simultanei)
- Spectator mode (viewer read-only con chat)
- Voice chat (WebRTC)
- Turn order APNAP con 4 players
- Priority passing tra 4
- Combat multi-target

---

## ❌ P2 — Playgroup persistenti, ELO e meta tracking

**Stato:** Non iniziato. Schema DB definito (`playgroups`, `playgroup_members`, `playgroup_matches`, `playgroup_match_players`). Nessuna implementazione.

---

## ❌ P3 — Social, feed e content

**Stato:** Non iniziato. Schema definito (`follows`, `deck_comments`, `deck_likes`). Feature non prioritizzata.

---

## ❌ P3 — Tournament tools

**Stato:** Non iniziato. Swiss pairing, bracket, decklist check, timer — tutto da fare.

---

## ❌ P3 — Deck diff visuale tra versioni

**Stato:** Non iniziato. Schema `deck_versions` definito. Quick-win da 1-2 settimane.

---

## Infrastruttura — stato attuale

| Componente | Stato |
|------------|-------|
| Supabase (Postgres + RLS + Realtime) | ✅ In uso |
| Vercel Fluid Compute | ✅ In uso |
| Vercel AI Gateway | ❌ Non usato (DeepSeek diretto per GoblinAI) |
| pgvector | ❌ Non abilitato |
| Vercel Queues | ❌ Non usato |
| Upstash Redis | ✅ In uso (rate limiting) |
| Vercel Blob | ❌ Non usato |
| Scryfall Tagger ingestion | ❌ Non fatto |
| Cron jobs (daily-sync, update-prices) | ✅ Attivi |
| PWA installabile | ✅ Attivo |

---

## Riferimenti

- Design architetturale completo per feature non ancora iniziate: vedi commit `53b16e4` (`IMPLEMENTATIONS.md` originale) o `git log --oneline` per trovare la versione con tutti i dettagli.
- Decisioni implementative: `DECISIONS.md`
- Stato progetto: `CHECKPOINT.md`
