# Adunata — Piano Implementazioni Future

> Documento di design e analisi strategica per estendere Adunata oltre Moxfield / Manabox / Archidekt. Ogni sezione include descrizione dettagliata, architettura tecnica, tradeoff considerati, difficoltà realistica, e impatto atteso su utente, retention e moat competitivo.

**Versione:** 1.0 — 2026-04-23
**Stack di riferimento:** Next.js 16 App Router, Supabase (Postgres + RLS + Realtime + Storage + pgvector), Vercel Fluid Compute, Vercel AI Gateway, Vercel Queues, Upstash Redis, AI SDK v6.

---

## Indice

1. [Executive Summary e roadmap](#executive-summary-e-roadmap)
2. [P0 — Sezioni e tag nei deck (priorità assoluta)](#p0--sezioni-e-tag-nei-deck-priorità-assoluta)
3. [P0 — AI locale: scanner carte + riconoscimento versione](#p0--ai-locale-scanner-carte--riconoscimento-versione)
4. [P0 — AI rules assistant: regole e interazioni tra carte](#p0--ai-rules-assistant-regole-e-interazioni-tra-carte)
5. [P1 — Deck analytics avanzate (statistiche)](#p1--deck-analytics-avanzate-statistiche)
6. [P1 — Power level estimator deterministico](#p1--power-level-estimator-deterministico)
7. [P1 — Goldfish simulator (Monte Carlo)](#p1--goldfish-simulator-monte-carlo)
8. [P1 — Combo detector + synergy graph](#p1--combo-detector--synergy-graph)
9. [P1 — Collection management + deck overlay](#p1--collection-management--deck-overlay)
10. [P2 — Playgroup persistenti, ELO e meta tracking](#p2--playgroup-persistenti-elo-e-meta-tracking)
11. [P2 — Multiplayer extensions (spectator, replay, 4-pod, voice)](#p2--multiplayer-extensions-spectator-replay-4-pod-voice)
12. [P3 — Social, feed e content](#p3--social-feed-e-content)
13. [P3 — Tournament tools](#p3--tournament-tools)
14. [P3 — Deck diff visuale tra versioni](#p3--deck-diff-visuale-tra-versioni)
15. [Infrastruttura trasversale](#infrastruttura-trasversale)
16. [Appendice — Schema DB changes aggregato](#appendice--schema-db-changes-aggregato)
17. [Glossario difficoltà e impatto](#glossario-difficoltà-e-impatto)

---

## Executive Summary e roadmap

Adunata oggi compete in uno spazio affollato (Moxfield, Archidekt, Manabox, TappedOut, Deckstats). Per diventare **uno scalino sopra** serve un moat difendibile, non un clone migliorato. Le tre leve disponibili sono:

1. **Depth tecnologica** — funzionalità che gli altri non possono copiare rapidamente perché richiedono investimento infrastrutturale serio (AI multimodale locale, analytics profonde, simulazioni Monte Carlo).
2. **UX integrata end-to-end** — il gioco live esiste già in Adunata. Integrando collezione, deck building, analytics e gioco in un'unica esperienza coesa si crea un loop che nessun competitor ha (Moxfield è read-only, Manabox è solo collection).
3. **AI-native workflow** — card scanner con riconoscimento preciso di versione e un assistente di regole che ragiona sulle interazioni, trasformano Adunata da "app deckbuilding" a "companion Magic" quotidiano.

### Priorità e roadmap consigliata

| Priorità | Feature | Settimane stimate | Impatto |
|----------|---------|-------------------|---------|
| **P0** | Sezioni + tag nei deck | 2–3 | Alto (retention, differenziatore UX immediato) |
| **P0** | Card scanner AI (scan + versione + collezione + prezzo) | 6–10 | Molto alto (moat, viralità, entry point collezione) |
| **P0** | Rules assistant AI (Q&A regole e interazioni) | 4–6 | Alto (engagement, differenziatore unico) |
| **P1** | Deck analytics core (statistiche base + power level) | 4–6 | Alto (utilità quotidiana deckbuilder) |
| **P1** | Goldfish simulator + combo detector | 3–5 | Medio-alto (deckbuilder serio) |
| **P1** | Collection management + deck overlay | 4–6 | Alto (cattura use case Manabox) |
| **P2** | Playgroup persistenti + ELO + meta | 3–4 | Medio (retention forte per utenti loyal) |
| **P2** | Multiplayer 4-pod + spectator + replay | 6–10 | Medio-alto (feature flagship se Adunata vive) |
| **P3** | Social feed + follow + discussioni | 4–8 | Medio (growth, network effects) |
| **P3** | Tournament tools (Swiss, bracket, decklist check) | 3–5 | Medio (cattura organizzatori locali) |
| **P3** | Deck diff visuale | 1–2 | Basso (quick-win nice-to-have) |

Il documento è ordinato per priorità. Ogni sezione è auto-contenuta e può essere pianificata in un proprio worktree separato.

### Raccomandazione strategica

I primi 90 giorni concentrarsi su **P0 in full**: sezioni/tag + scanner AI + rules AI. Se consegnati con qualità eccellente, diventano i tre messaggi marketing che differenziano Adunata. I P1 arrivano subito dopo per sostenere l'acquisizione con utility quotidiana. I P2/P3 sono investimenti di lungo periodo, da non iniziare prima di validare che i P0 tengono metriche.

---

## P0 — Sezioni e tag nei deck (priorità assoluta)

### Descrizione e user story

Oggi un deck in Adunata è una lista piatta di carte divise solo in `mainboard` / `sideboard` / `commander`. Un giocatore di Commander serio organizza mentalmente il deck in **categorie funzionali**: Ramp, Removal, Card Draw, Tutors, Wincons, Combo Pieces, Protection, Utility, Lands. Costruire e refinare un deck senza queste categorie è lento e soggetto a errori (classico sintomo: "quanto ramp ho?" → conto manuale).

**Tag** coprono un livello ortogonale: un giocatore può voler marcare carte con "Tested ✅", "Possible cut", "Playtesting", "Pet card", "Budget", "Upgrade target", "Commander-specific synergy (zombie tribal)". Tag sono liberi, multipli per carta, e utili sia per filtro che per note personali.

**User story principale:**
> *Come deckbuilder, voglio raggruppare le carte del mio deck per funzione (ramp, removal, draw…) e aggiungere tag arbitrari su singole carte, così posso vedere a colpo d'occhio la distribuzione funzionale del deck, individuare lacune (es. "solo 6 ramp, sotto la norma"), e marcare carte da testare o tagliare.*

**User story secondarie:**
- Drag-and-drop tra sezioni per riorganizzare.
- Auto-suggerimento della sezione al momento dell'aggiunta della carta (basato sulla funzione riconosciuta).
- Filtri combinati: "mostrami tutte le carte nel deck con tag 'combo piece'".
- Template preset ("Commander standard layout") per creare un deck con le sezioni già pronte.
- Ordinamento automatico dentro sezione (per CMC, alfabetico, colore).
- Statistiche per sezione: count, totale costo €, avg CMC.

### Architettura tecnica

**Schema Postgres (migration):**

```sql
-- Nuova tabella per definire le sezioni di un deck
create table public.deck_sections (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text, -- hex opzionale per colorare il header della sezione in UI
  auto_rule jsonb, -- regola opzionale di auto-assegnazione (vedi sotto)
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now()
);

create index deck_sections_deck_position_idx
  on public.deck_sections (deck_id, position);

-- deck_cards acquisisce riferimento a sezione + array di tag
alter table public.deck_cards
  add column section_id uuid references public.deck_sections(id) on delete set null,
  add column tags text[] not null default '{}',
  add column position_in_section integer; -- ordering within section

create index deck_cards_section_idx on public.deck_cards (section_id);
create index deck_cards_tags_gin_idx on public.deck_cards using gin (tags);

-- RLS policies (rispecchiare policy esistenti di deck_cards)
alter table public.deck_sections enable row level security;

create policy deck_sections_select_visible on public.deck_sections
  for select using (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id
      and (d.visibility = 'public' or d.user_id = auth.uid())
    )
  );

create policy deck_sections_mutate_owner on public.deck_sections
  for all using (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id and d.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id and d.user_id = auth.uid()
    )
  );
```

**Auto-categorizzazione (`auto_rule` jsonb):**

Una sezione può avere una regola che, quando una carta nuova viene aggiunta al deck, decide se assegnarla automaticamente. Formato suggerito:

```json
{
  "type": "all_of",
  "conditions": [
    { "field": "functional_tags", "op": "contains_any", "values": ["ramp", "mana-rock"] },
    { "field": "card_type", "op": "not_contains", "values": ["Land"] }
  ]
}
```

I `functional_tags` arrivano da Scryfall Tagger (servizio community-driven). L'ingestion dei tag funzionali è un backfill one-shot (vedi sezione [Infrastruttura trasversale](#infrastruttura-trasversale)).

**Preset di sistema:**

Un utente può creare un deck "vuoto con layout Commander" che inizializza subito 9 sezioni: Commander, Ramp, Card Draw, Removal, Tutors, Wincons, Protection, Utility, Lands. Preset memorizzati come seed nel DB (`deck_section_templates` opzionale) oppure hardcoded in un modulo TypeScript lato server (più semplice da versionare).

**API (route handlers Next.js App Router):**

- `POST /api/decks/:id/sections` — crea sezione
- `PATCH /api/decks/:id/sections/:sectionId` — rinomina, riordina, colore, auto_rule
- `DELETE /api/decks/:id/sections/:sectionId` — cancella (le carte associate tornano senza sezione)
- `POST /api/decks/:id/sections/reorder` — batch reorder (array di `{id, position}`)
- `PATCH /api/decks/:id/cards/:cardId` — aggiorna `section_id`, `tags`, `position_in_section`
- `POST /api/decks/:id/cards/bulk-tag` — aggiunge/rimuove tag a N carte in una chiamata
- `POST /api/decks/:id/sections/auto-apply` — ri-valuta tutte le carte contro le `auto_rule` di ogni sezione (utile dopo import)

Ogni mutation deve chiamare `revalidatePath` sulla pagina del deck e sulla lista deck (regola Next.js 16 già documentata in CLAUDE.md).

**Componenti UI:**

- `DeckSectionGroup` — header con nome, count, costo totale, avg CMC, action menu (rename, delete, collapse, colore)
- `DeckSectionCardList` — lista carte ordinate, con drag handle
- `SectionPicker` — dropdown per assegnare sezione al volo durante l'add (con "Auto" come default se la carta ha una regola matchante)
- `TagEditor` — pill editor con autocomplete dai tag già usati nel deck
- `DeckFiltersBar` — filtro per sezione e per tag (multi-select)

Drag-and-drop: usare `@dnd-kit/core` + `@dnd-kit/sortable` (già presente in ecosistema React, accessibile, mobile-friendly con touch).

**Mobile UX:**

Su schermi piccoli, la sezione diventa collapsible di default. Long-press su una carta apre un bottom-sheet con "Sposta in sezione…" e "Modifica tag". Drag-and-drop su mobile è frustrante — preferire il bottom-sheet come input primario e drag come "nice to have" desktop.

### Alternatives considerate e tradeoff

1. **Colonne fisse vs sezioni dinamiche** — Archidekt ha colonne fisse. Vantaggio: semplicità. Svantaggio: rigidità, impossibile avere "Commander-specific tribal" come propria sezione. **Scelta: sezioni dinamiche**, più flessibili e più allineate col modello mentale utenti Commander.

2. **Tag come string array vs tabella normalizzata** — Array con GIN index è più semplice, meno JOIN, abbastanza scalabile fino a ~50 tag per card e ~10k card per deck (Commander limit è 100, quindi comodamente sotto). Tabella normalizzata permette analytics cross-deck più potenti. **Scelta: array**, con materialized view per analytics aggregate se servirà.

3. **Auto-categorizzazione on-write vs on-demand** — On-write (il server riassegna section_id all'INSERT) è reattivo ma vincola il POST di card-add a conoscere tutte le regole. On-demand (endpoint `auto-apply`) è più semplice da evolvere. **Scelta: on-demand + suggerimento lato client**: il client interroga `/api/cards/suggest-section?card_id=X&deck_id=Y` e pre-seleziona la sezione, l'utente conferma. Evita magia e permette override.

4. **Ordinamento dentro la sezione** — Supportare sia `position_in_section` manuale sia ordinamento calcolato (by CMC, by name, by color) come "view option" senza toccare il DB. **Scelta: entrambi**: se l'utente ha trascinato manualmente almeno una carta, rispetta `position_in_section`; altrimenti applica ordinamento dinamico scelto dall'utente nella view.

### Difficoltà

**M (medium) — 2-3 settimane** per un engineer full-stack. Breakdown:
- Migration + types Supabase (1 giorno)
- API route handlers + test (3 giorni)
- Componenti UI base (section header + list) (3 giorni)
- Drag-and-drop + mobile bottom-sheet (3 giorni)
- Tag editor + filtri (2 giorni)
- Auto-categorizzazione + ingestion functional_tags Scryfall (3 giorni)
- Preset templates + import migration (deck esistenti senza sezioni) (2 giorni)

Prerequisiti: nessuno. Può partire immediatamente.

### Impatto

- **User value:** 5/5 — feedback diretto dell'utente, gap conosciuto.
- **Retention:** 4/5 — chi organizza bene un deck torna a raffinarlo, la UI crea engagement.
- **Growth/viral:** 2/5 — feature non virale di per sé ma nei decklist pubblici le sezioni sono visibili → impressione di professionalità.
- **Moat:** 3/5 — Archidekt ha qualcosa di simile, Moxfield no. Adunata può vincere con auto-categorizzazione AI-assisted migliore.
- **Revenue:** 2/5 — non monetizzabile direttamente ma è table-stakes per utenti paganti.

### Rischi e mitigazioni

- **Rischio:** migrazione dati esistenti. I deck attuali non hanno sezioni. *Mitigazione:* backfill script che assegna `null` (carta "senza sezione"), UI tratta `null` come "Uncategorized" e mostra CTA "Categorize with AI" → chiama l'auto-apply endpoint.
- **Rischio:** utenti non capiscono il concetto. *Mitigazione:* onboarding tooltip sulla prima visita, template preset "Commander standard".
- **Rischio:** performance su deck con 100+ carte e 20+ sezioni. *Mitigazione:* virtualizzazione della lista con `react-virtuoso`, query paginata lato API se serve.

---

## P0 — AI locale: scanner carte + riconoscimento versione

### Descrizione e user story

L'utente vuole fotografare una carta fisica con la webcam o la fotocamera del telefono e vederla automaticamente aggiunta alla propria collezione Adunata, con:

1. **Identificazione del nome** della carta (anche con foto storta, luce subottimale, carta scontornata a mano).
2. **Identificazione precisa della versione**: set + collector number + lingua + frame type (regular / showcase / borderless / extended art / retro / etched foil), e possibilmente **finish** (foil / non-foil / etched / gilded / oil-slick…).
3. **Prezzo corrente** (EUR da Cardmarket, USD da TCGPlayer — già presenti nello schema `cards`).
4. **Aggiunta alla collezione** con un tap.

Il requisito dell'utente è che il modello sia **locale** (tipo Gemma 3/4 o 3n), con le motivazioni implicite: privacy, offline, zero costo marginale per query, indipendenza da provider.

**User story principale:**
> *Voglio scannerizzare un pacco di carte nuove appena aperto e avere tutto nella mia collezione Adunata in 30 secondi, senza dover cercare manualmente set code o art variant.*

**User story secondaria:**
> *Voglio scannerizzare una carta in mano al mio avversario per curiosità o per verificare che sia quella giusta.*

### Architettura tecnica

**Il singolo modello VLM (Vision-Language Model) NON è la soluzione giusta da solo.** Gemma 3n 4B / 8B in modalità zero-shot non è stato trainato specificamente su Magic: The Gathering, quindi confonderà facilmente "Showcase" da "Extended Art", sbaglierà collector number (specie su versioni promo), e non conosce set ristampati recentemente. La scelta architetturale corretta è una **pipeline ibrida multi-stage** dove Gemma (o un altro piccolo VLM locale) è usato solo in stage specifici.

**Pipeline proposta — 9 stage:**

```
[camera] → [detect card] → [perspective correct] → [crop ROI]
   ↓
[OCR name/set/number] → [Scryfall candidate lookup]
   ↓
[visual verify with embeddings] → [frame type classifier]
   ↓
[finish detector (foil glare)] → [confirmation UI with top-3 candidates]
```

**Stage 1 — Capture.**
`MediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })`. Su mobile funzione nativa. In-browser frame grabber con `<video>` + `<canvas>`.

**Stage 2 — Card detection + perspective correction.**
OpenCV.js compilato in WASM. Pipeline classica:
- Convert to grayscale
- Gaussian blur (rimuove textura del tavolo)
- Canny edge detector
- `findContours` con `RETR_EXTERNAL`
- Filtra il contour più grande con 4 vertici (quadrilatero = carta)
- `getPerspectiveTransform` + `warpPerspective` per ottenere un 488×680px rettangolare (proporzioni standard Magic 2.5"×3.5")

Fallback: se OpenCV non rileva la carta, presenta un viewfinder con guide visive e chiede all'utente di allineare.

**Stage 3 — ROI extraction.**
Sul rettangolo 488×680 le regioni sono fisse per frame Magic moderno:
- Name: top ~8% altezza, 70% larghezza
- Type line: ~50% altezza
- Set symbol: ~45% altezza, 8% larghezza (destra)
- Collector number + set code: bottom sinistra per frame post-2020
- Artist: bottom, 60% larghezza

Ogni ROI viene croppata e salvata come ImageData per lo stage successivo.

**Stage 4 — OCR multi-target.**
Due opzioni:
- **Tesseract.js (WASM)**: semplice, già maturo, funziona offline, buono per testo stampato su sfondo pulito. Accuratezza sul nome ~95% in condizioni buone, ~75% con glare. Slow (~1-2s per ROI su mobile).
- **PaddleOCR ONNX via ONNX Runtime Web + WebGPU**: più accurato, più veloce, ma setup più complesso e modello più grosso (~15MB). Accuratezza ~98%.

**Scelta consigliata:** PaddleOCR ONNX con fallback Tesseract, con il modello caricato lazy al primo uso dello scanner (service worker cache).

OCR su 3 ROI: name, set code, collector number. Set code è 3-4 lettere alpha, collector number è digits (spesso con `/` separator); confidence score per ciascuno.

**Stage 5 — Scryfall candidate lookup.**
Query a `/cards/search` con sintassi:
```
name:"Lightning Bolt" set:M21 cn:162
```
Se nome non matcha esattamente, usa `name:/^lightning bol/` (fuzzy regex). Se set code non è riconosciuto, drop il filtro e cerca solo per nome → ordina candidati per release_date desc (la versione più recente è statisticamente la più probabile).

Lookup lato client (Scryfall CORS-friendly) oppure lato server-routed via `/api/scryfall-proxy` se si vuole caching Upstash Redis (evita rate limit Scryfall 10 req/sec).

Output: array di 1-10 candidati Scryfall con immagine URL.

**Stage 6 — Visual verification con image embeddings.**
Il candidato OCR-based può ambiguare tra versioni visivamente diverse (showcase vs regular) ma con stesso nome/set. Qui entrano gli embedding visuali:

- Modello: **SigLIP** o **CLIP ViT-B/32** in ONNX Runtime Web (~90MB, runnabile su WebGPU).
- Embedding della foto catturata.
- Embedding delle `image_uris.normal` dei top 5 candidati (scaricate + cached in IndexedDB).
- Cosine similarity → rank candidates per somiglianza visiva.
- Se top-1 confidence > 0.92 → auto-select.
- Se < 0.92 → mostra UI con top 3 per conferma utente.

Questo risolve il 90% dei casi ambigui (showcase, borderless, extended art, retro frame) senza bisogno di Gemma.

**Stage 7 — Frame type classifier.**
Caso edge: il nome + set sono identici ma esistono varianti (es. "Commander Masters" stesso card ha normal / etched / foil-etched / showcase). Qui si può usare:
- **Opzione A:** Gemma 3n 4B con prompt strutturato: *"Guarda questa immagine di una carta Magic. Classifica il frame type tra: regular, showcase, borderless, extended art, retro, etched. Rispondi solo con il token."* Output token-level; modello runna in-browser via `transformers.js` + WebGPU, richiede 4-8GB VRAM → desktop-class. Mobile: fallback server-side o skippa.
- **Opzione B:** Classifier custom small CNN (~5MB) trainato su frame type. Dataset: scrape di Scryfall con filtro `frame:` e `border:`, 50k+ images per classe. Più veloce e small del VLM, più specifico.

**Scelta consigliata:** Opzione B per MVP, Opzione A come aggiornamento futuro quando WebGPU è ubiquo.

**Stage 8 — Finish detector (foil / non-foil).**
Foil detection da singola foto statica è difficile (il bagliore dipende dall'angolo). Approccio:
- Durante la cattura, registra 2-3 frame a angolazioni diverse (micro-movimento della mano naturale).
- Analizza la variazione di luminanza hue lungo l'asse della carta: foil ha rainbow shift, non-foil no.
- Se rilevato rainbow → flag foil.
- Se incerto → default non-foil con prompt "Questa è una versione foil?" in confirmation UI.

Per etched, gilded, oil-slick: richiede training specifico, non prioritario al lancio. Messo in backlog.

**Stage 9 — Confirmation UI.**
Mostra top-3 candidati con thumbnail, set icon, collector number, prezzo attuale EUR/USD, toggle foil. L'utente tappa quello giusto. Latency totale target: **< 2.5s** dalla pressione del bottone alla UI di conferma.

### Dove vive Gemma 3n in questa pipeline

**Uso limitato ma strategico:**

1. **Stage 7** — frame type classification con VLM zero-shot (Opzione A sopra) se non vogliamo trainare classifier custom.
2. **Fallback generale** — quando la pipeline fallisce (no contour trovato, OCR confidence bassa, no candidate match), chiamata a Gemma con prompt: *"Identifica questa carta Magic. Output JSON: { name, set, collector_number, frame_type }."* → uso l'output come seed per una nuova query Scryfall.
3. **Modalità offline pura** — un utente senza connessione usa solo Gemma + dump Scryfall preloadato come fallback. Latenza maggiore ma funziona.

**Runtime per Gemma 3n in browser:**
- `@huggingface/transformers` v3 supporta WebGPU.
- Modello: `google/gemma-3n-4b-it` quantizzato Q4 (~2.5GB download, cached in OPFS via service worker).
- Primo caricamento: ~30s su connessione rapida, poi istantaneo.
- Inferenza: ~3-8s per prompt su M1/M2 desktop, ~10-20s su mobile high-end, non usabile su mobile budget.

**Realtà mobile:** la maggior parte di utenti mobile non può runnare Gemma 4B localmente oggi. Opzioni:
- **Opzione X:** stesso modello server-side via Vercel AI Gateway → `google/gemma-3-4b-it`. Non è "locale" ma privacy-adjacent se il provider gestito è trusted, ed è molto più veloce.
- **Opzione Y:** app wrapper Capacitor con MediaPipe LLM Inference API che usa NPU/GPU del dispositivo. Richiede native build.

**Raccomandazione:** PWA desktop → Gemma locale. Mobile web → Gemma server-side via AI Gateway con privacy disclaimer. App nativa futura → MediaPipe locale.

### Data pipeline per la collezione

Una volta identificata la carta, l'aggiunta alla collezione richiede:

```sql
-- Schema collezione (nuovo)
create table public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  -- card_id è lo scryfall_id che identifica UNIVOCAMENTE la stampa (set + collector + lang + frame)
  quantity integer not null default 1 check (quantity >= 0),
  foil boolean not null default false,
  language text not null default 'en',
  condition text check (condition in ('M','NM','LP','MP','HP','D')) default 'NM',
  acquired_at timestamptz default now(),
  acquired_price_eur numeric(10,2),
  notes text,
  -- uniqueness: stessa stampa + foil + lingua + condizione = stessa row (incrementa quantity)
  unique (user_id, card_id, foil, language, condition)
);

create index user_cards_user_idx on public.user_cards(user_id);
alter table public.user_cards enable row level security;

create policy user_cards_owner_all on public.user_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Endpoint `POST /api/collection/add` con body `{ card_id, foil, language, condition, quantity }`, fa `INSERT ... ON CONFLICT (user_id, card_id, foil, language, condition) DO UPDATE SET quantity = user_cards.quantity + EXCLUDED.quantity`.

### Alternatives considerate e tradeoff

1. **Solo VLM end-to-end (Gemma + foto → risposta):** bocciato. Gemma senza fine-tuning su Magic non è accurato sulle versioni, e hosted VLM come GPT-4 Vision costa $10/1000 richieste — non sostenibile per scan intensivo.

2. **Solo OCR + Scryfall:** bocciato. Non distingue frame variants, foil, e fallisce su foto di bassa qualità.

3. **Pipeline ibrida come sopra:** scelta. Ogni stage è replaceable indipendentemente. OCR+embeddings risolvono il 90%, VLM solo sul long tail.

4. **Inference server-side vs client-side:** client-side per privacy e costo zero marginale. Server-side (Fluid Compute + AI Gateway) come fallback automatico se il device non supporta WebGPU o il modello non è caricato.

5. **Service worker + OPFS per cache modelli:** essenziale. Scaricare 200MB di modelli a ogni session è inaccettabile. Versionare i modelli e fare ETag check.

6. **Fine-tuning specifico Magic:** in roadmap V2. Un Gemma 3n fine-tuned su 100k coppie (foto carta → JSON identificativo) sarebbe drammaticamente migliore. Costo training: ~$500-2000 su H100 rentals, dataset buildable da dump Scryfall + augmentation. Non blocking per il lancio.

### Difficoltà

**XL (extra large) — 6-10 settimane.** Stack multitech, diversi stage, testing su device reali.

Breakdown:
- OpenCV.js integration + card detection tuning (1 settimana)
- OCR stack + Scryfall lookup (1 settimana)
- Image embedding verification (CLIP/SigLIP ONNX) (1.5 settimane)
- Frame type classifier custom CNN + training dataset (1.5 settimane)
- Gemma 3n WebGPU integration + fallback server-side (2 settimane)
- Collection schema + API + UI di conferma (1 settimana)
- Mobile testing + tuning accuracy su device reali (1 settimana)
- Performance optimization + caching (0.5-1 settimana)

Prerequisiti:
- Schema `user_cards` (collezione) — se non esiste già.
- Endpoint Scryfall proxy con cache Upstash.
- pgvector extension abilitata (per eventuale fine-tuning data ingestion).

### Impatto

- **User value:** 5/5 — killer feature, gap enorme nel mercato mobile.
- **Retention:** 5/5 — ogni nuovo pacco = re-engagement.
- **Growth/viral:** 5/5 — "prova a scannerizzare" è una demo virale.
- **Moat:** 5/5 — replica richiede 6+ mesi di R&D, Moxfield non ha scanner, Manabox ha scan ma senza frame variant accuracy.
- **Revenue:** 4/5 — entry point a collection tracking, che è la feature che trasforma casual in power user → conversion tier premium.

### Rischi e mitigazioni

- **Rischio:** accuratezza percepita bassa al lancio. *Mitigazione:* beta chiusa di 2 settimane con 50 utenti, dashboard di monitoring con feedback "correct? yes/no" implicito da `/api/collection/confirm` endpoint, iterate.
- **Rischio:** performance su mobile budget. *Mitigazione:* feature flag per modalità "cloud scan" (server-side via AI Gateway) vs "local scan", scelta automatica con detect WebGPU.
- **Rischio:** Scryfall rate limit. *Mitigazione:* cache Upstash con TTL 7gg su `/cards/search` query, CDN headers.
- **Rischio:** dimensione modelli su mobile (2.5GB+). *Mitigazione:* lazy loading on first use, progress UI durante il download, skippare il local mode su mobile e usare server-side di default.
- **Rischio:** privacy su foto. *Mitigazione:* tutto client-side quando possibile; se server-side, documentare in privacy policy che le foto non vengono memorizzate (solo processate in-memory e scartate).

---

## P0 — AI rules assistant: regole e interazioni tra carte

### Descrizione e user story

Magic: The Gathering ha il regolamento più complesso tra i TCG mainstream. L'utente vuole poter chiedere in linguaggio naturale:

> *"Se ho in campo Anikthea, Hand of Erebos e Parallel Lives e 2 token di Doubling Season, quando attacco e prendo dal cimitero Grim Guardian, cosa succede?"*

> *"Come funziona doppio attacco se attacco con Questing Beast e il difensore ha Glorious Anthem?"*

Un assistente AI specializzato deve:
1. Riconoscere i nomi delle carte menzionate (anche con typo).
2. Recuperare oracle text, rulings ufficiali, e regole pertinenti.
3. Ragionare step-by-step sulla sequenza di trigger, replacement effect, state-based action.
4. Rispondere in italiano (o lingua dell'utente), con esempio concreto e citazione alle rules.

**User story principale:**
> *Durante una partita (anche nel mondo reale) voglio chiedere al companion Adunata "cosa succede se…?" e ricevere una risposta corretta, chiara, con reference alle regole ufficiali, in 5 secondi.*

### Architettura tecnica

Un modello locale piccolo come Gemma 3n 4B **NON è sufficiente da solo** per questa task. Le regole di Magic sono interconnesse e un modello senza contesto ground-truth allucinerà (e allucinare su regole è inaccettabile). La soluzione è **RAG (Retrieval-Augmented Generation)** con un knowledge base di alta qualità e un LLM di buona capacità.

**Pipeline completa:**

```
[user query in italiano]
   ↓
[stage 1: entity extraction + translation]
   ↓
[stage 2: fetch card data per ogni entity]
   ↓
[stage 3: vector search su Comprehensive Rules + rulings]
   ↓
[stage 4: context assembly]
   ↓
[stage 5: LLM reasoning + answer generation]
   ↓
[stage 6: citation footnotes + verify]
```

**Stage 1 — Entity extraction + translation.**
Prompt strutturato (structured output con `generateObject` dell'AI SDK v6) a un LLM piccolo e veloce:

```ts
import { generateObject } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';

const EntitySchema = z.object({
  cards: z.array(z.object({
    raw_name: z.string(),
    normalized_name: z.string(),
  })),
  zones_mentioned: z.array(z.enum(['battlefield', 'graveyard', 'hand', 'library', 'exile', 'stack'])),
  actions: z.array(z.string()), // "attack", "cast", "trigger", "put into play"
  question_type: z.enum(['interaction', 'timing', 'legality', 'combat', 'other']),
});

const { object } = await generateObject({
  model: gateway('google/gemini-2.5-flash'),
  schema: EntitySchema,
  prompt: userQuery,
});
```

Modello: **Gemini 2.5 Flash** o **Claude Haiku 4.5** via AI Gateway per velocità (< 1s). Non serve modello top-tier per questo task.

**Stage 2 — Card data fetching.**
Per ogni `normalized_name`, query al DB locale `cards` table (fuzzy match con `pg_trgm` similarity > 0.6) e recupera:
- Oracle text
- Type line
- Mana cost
- Rulings Scryfall (ingested nel DB)
- Keyword abilities con reminder text

Se non trovato, chiama Scryfall `/cards/named?fuzzy=X` per un name lookup online.

**Stage 3 — Vector search sulle regole.**
Knowledge base ingestata in pgvector:

```sql
create extension if not exists vector;

create table public.mtg_rules (
  id uuid primary key default gen_random_uuid(),
  rule_number text not null, -- "603.2" etc
  section_title text, -- "Handling Triggered Abilities"
  text text not null,
  embedding vector(1536), -- OpenAI text-embedding-3-small
  source_version text not null, -- "2026-01-10 CR"
  created_at timestamptz default now()
);

create index mtg_rules_embedding_idx on public.mtg_rules
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table public.card_rulings (
  id uuid primary key default gen_random_uuid(),
  card_id text references public.cards(id) on delete cascade,
  ruling_date date,
  text text not null,
  embedding vector(1536)
);
create index card_rulings_card_idx on public.card_rulings(card_id);
create index card_rulings_embedding_idx on public.card_rulings
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);
```

Ingestion script:
- Download `MagicCompRules` ufficiale (PDF → text).
- Chunking: una chunk per rule atomica (603.2a, 603.2b…) con parent section come header, ~200-500 token.
- Download rulings da Scryfall `/bulk-data/rulings` (JSON, ~30MB).
- Embedding con `text-embedding-3-small` (via AI SDK `embed()` function, via AI Gateway).
- Batch insert con upsert su `rule_number`.

Query al runtime:
```ts
import { embed } from 'ai';
const { embedding } = await embed({
  model: gateway.textEmbedding('openai/text-embedding-3-small'),
  value: userQuery,
});

// Vector search
const { data: rules } = await supabase.rpc('match_rules', {
  query_embedding: embedding,
  match_threshold: 0.75,
  match_count: 8,
});
```

dove `match_rules` è una SQL function che fa `SELECT ... ORDER BY embedding <=> query_embedding LIMIT match_count`.

**Stage 4 — Context assembly.**
Build prompt con:
```
# Carte coinvolte
## Anikthea, Hand of Erebos
Oracle: <text>
Rulings: <rulings>

## Parallel Lives
Oracle: <text>

## Doubling Season
Oracle: <text>

## Grim Guardian
Oracle: <text>

# Regole pertinenti
603.2 — Whenever a triggered ability's trigger event occurs…
614.1 — Some effects replace a particular event…
603.6a — If a triggered ability has a condition…

# Domanda utente
<query>
```

**Stage 5 — Reasoning + answer.**
LLM ad alta capacità (Claude Sonnet 4.6 o Gemini 2.5 Pro via AI Gateway) con system prompt specializzato:

```
You are an expert Magic: The Gathering rules advisor. Reason step-by-step:
1. Identify the triggering event(s).
2. List all triggered and replacement effects involved.
3. Determine ordering (APNAP, stack resolution).
4. Apply replacement effects (state the CR rule number).
5. Resolve triggered abilities in order.
6. Give final board state.

Write in Italian. Cite CR rules by number. Explain for a player, not a judge.
```

**Stage 6 — Citation + verify.**
Post-process:
- Estrai ogni citazione `CR 603.2` dal testo.
- Verifica che la rule esista nel DB (guardia contro hallucination).
- Linka a rendering locale `/rules/603.2`.
- Salva Q&A nella tabella `rules_qa_history` per analytics e per build di un FAQ nel tempo.

**Modalità locale (Gemma 3n):**
L'utente che vuole solo-locale può scegliere la modalità "Local only". In quel caso:
- Stage 1 (entity extraction) fatto con Gemma 3n structured output.
- Stage 3 (vector search) ancora su pgvector (serve connessione), oppure dump precomputato delle rules + embedding in IndexedDB e vector search client-side.
- Stage 5 (reasoning) fatto con Gemma 3n.

Limiti: Gemma 4B fa ragionamento su catene di 3-4 trigger simultanei ma perde accuratezza oltre. Copre il 70-80% di domande tipiche. Per il 20-30% complex si raccomanda cloud model.

**UI chat:**
- Componente `RulesChat` con streaming via AI SDK `useChat` hook.
- Card chip inline: nei messaggi, quando un nome di carta viene menzionato, renderizza un chip hoverable con preview dell'immagine (usando il componente esistente della card preview).
- Citations al fondo con link cliccabili a `/rules/:number`.
- History salvata (RLS-scoped al user) per ri-consultazione.

### Alternatives considerate e tradeoff

1. **Solo LLM senza RAG:** bocciato. Claude Sonnet 4.6 su query MTG senza contesto ha ~70% accuracy, con RAG arriva a ~95%. Le allucinazioni sui numeri di regola (es. "CR 614.7" che non esiste) sono immediate da smascherare e distruggono fiducia.

2. **RAG con embeddings CR ma no per-card rulings:** bocciato. Le rulings Scryfall contengono eccezioni specifiche per singole carte che le regole generali non coprono ("If Anikthea copies a creature with a +1/+1 counter…"). Ingestarle è essenziale.

3. **Fine-tuning di un modello su Q&A Magic:** interessante ma over-engineering al lancio, ma da tenere molto bene in considerazione!. Dataset scarso pubblicamente, costo training. Raccomando RAG + GPT-tier cloud come V1, fine-tuning come V3.

4. **pgvector vs Pinecone/Qdrant:** pgvector. Integrato con Supabase, no nuovo servizio, scala benissimo a 100k+ rule chunks.

5. **Modelli locali (Gemma/Llama/Phi) vs cloud:** dipende dalla domanda. Per rules complex servono modelli frontier. Soluzione ibrida "Local default con upgrade a Cloud su richiesta o su fallback automatico" è ottimale.

### Difficoltà

**L (large) — 4-6 settimane.**

Breakdown:
- Ingestion script CR + rulings + embeddings (1 settimana)
- pgvector setup + match functions (3 giorni)
- Entity extraction structured output (3 giorni)
- Context assembly + prompt engineering (1 settimana)
- UI chat streaming + card chips (1 settimana)
- Citation verification + safety rails (3 giorni)
- Local Gemma mode + integration con scanner (1 settimana)
- QA testing con set di 200 domande curate (1 settimana)

Prerequisiti:
- pgvector extension.
- Vercel AI Gateway configurato (mai direct provider keys).
- Budget modelli (Haiku 4.5 + embedding-3-small + Sonnet 4.6 stimato $0.01-0.05 per query end-to-end). Rate limiting Upstash per abuse prevention.

### Impatto

- **User value:** 5/5 — risolve pain point quotidiano di ogni giocatore.
- **Retention:** 4/5 — chi usa il chat regolarmente torna.
- **Growth/viral:** 4/5 — risposte shareable, "ho chiesto ad Adunata se…".
- **Moat:** 5/5 — nessuno ha un rules AI dedicato e accurato. Richiede effort + gating (accuracy < 90% affonda prodotto).
- **Revenue:** 3/5 — feature premium potenziale ("Adunata Pro: unlimited AI queries").

### Rischi e mitigazioni

- **Rischio:** allucinazioni catastrofiche (risposta sbagliata con tono confident). *Mitigazione:* guardrail citazioni verificate, prompt "if unsure, say so", feedback utente "this was wrong" che routa a review umana, disclaimer in UI.
- **Rischio:** costo LLM cloud escalation. *Mitigazione:* rate limit per user, caching aggressive su query identiche (hash user query + card set → cache), fallback a modelli più piccoli.
- **Rischio:** regole Magic cambiano con ogni nuovo set (set-specific mechanics). *Mitigazione:* ingestion pipeline automatizzata, cron job mensile che riscarica CR + rulings.
- **Rischio:** latency troppo alta. *Mitigazione:* stream parziale già in Stage 5, mostrare skeleton in Stage 1-4 (< 2s totali).
- **Rischio:** abuso / prompt injection. *Mitigazione:* system prompt chiuso, rejection di richieste off-topic, moderation via AI SDK built-in o layer dedicato.

---

## P1 — Deck analytics avanzate (statistiche)

### Descrizione e user story

Un deckbuilder serio vuole più di "quante creature, quante terre". Vuole rispondere a: "il mio deck è bilanciato? Arrivo a giocare il commander in tempo? Ho abbastanza interaction? Sono ramp-pesante o ramp-leggero per un deck a curva X?".

Le statistiche si dividono in **core** (calcolabili in O(n) su client) e **avanzate** (richiedono simulazione o dati esterni).

### Statistiche core

Calcolate client-side al load del deck, zero latency:

| Statistica | Definizione | Implementazione |
|------------|-------------|------------------|
| **Mana curve** | Distribuzione CMC 0-7+ | Histogram, CMC 7+ aggregato |
| **Color pip distribution** | Pip colorati per simbolo mana | Parse `mana_cost` regex |
| **Color identity** | Set di colori dell'identità commander | Precomputato |
| **Card type breakdown** | Creatures, instants, sorceries, enchantments, artifacts, planeswalkers, lands, battles | Parse `type_line` |
| **Average CMC (senza lands)** | Media aritmetica | Sum/count escludendo Land |
| **Median CMC** | | |
| **Ramp count** | Carte con functional_tag "ramp" | Richiede Scryfall Tagger ingestion |
| **Card draw count** | functional_tag "card-draw" | Idem |
| **Removal count** | functional_tag "removal" (targeted + sweeper) | Idem |
| **Tutor count** | functional_tag "tutor" | Idem |
| **Win condition count** | functional_tag "wincon" (user override abilitato) | Idem |
| **Mana source count** | Lands + mana rocks + mana dorks + rituals | |
| **Color source count** | Per ogni colore, quante fonti possono produrlo | Parse oracle text, preprocess per cards |
| **Price breakdown** | Totale EUR + USD, top 10 carte costose | Sum da `cards.price_eur` |
| **Rarity breakdown** | Count common/uncommon/rare/mythic | |
| **Set breakdown** | Cards per set origine | |

UI: tab `Stats` nella pagina del deck, grafici con Recharts (mana curve) o chart-native con Tailwind (bar chart semplice per breakdown).

### Statistiche avanzate

Calcolate con simulazione o dati derivati:

| Statistica | Descrizione | Implementazione |
|------------|-------------|------------------|
| **Opening hand keep rate** | % hand 7 che sono keep (euristica Karsten) | Monte Carlo 10k samples |
| **Turn-to-commander** | P50 e P90 turno in cui il commander è castato | Monte Carlo con greedy ramp play |
| **Mana screw rate** | % hand + first 3 draws che non hanno 3 source colorate | Monte Carlo |
| **Mana flood rate** | % hand con >5 land in 7 | Monte Carlo |
| **Color fixing score** | 0-100 basato su Karsten's manabase formula | Formula chiusa |
| **Tutor chain depth** | Da ogni tutor, quanti wincon raggiungibili in ≤3 step | Graph traversal |
| **Interaction density per turno** | Quanti permanent di interaction disponibili entro T3/T5/T7 | Probabilistic model |
| **Synergy graph** | Edge weight tra ogni coppia di carte basato su co-mention in deck pubblici del formato | DB aggregato + ML |
| **Combo presence** | Quanti combo noti presenti + min cards to win | Combo DB (vedi sezione Combo) |
| **Threat density** | Quanti permanent minacciano vittoria per turno | Calcolo derivato |
| **Salt score** | EDHREC salt score medio (quanto sono "salty" le carte) | EDHREC API |
| **Popularity in format** | % deck del formato che include la stessa carta | EDHREC + stat calc |
| **Power level 0-10** | Combo + tutor + fast mana + interaction + win turn | Algoritmo deterministico (vedi sezione dedicata) |
| **Archetype classifier** | Aggro / Combo / Control / Midrange / Stax / Voltron | Heuristic iniziale, ML V2 |
| **Meta matchup win rate stimato** | Vs top 10 commander del formato | Simulator vs archetype models |
| **Mulligan advisor** | Dato una mano, keep/mull + reasoning | Rule-based + Monte Carlo |
| **Dead card % in opening hand** | Carte che non hanno effetto utile in T1-3 | Labeled dataset |

### Architettura tecnica

- **Core stats**: calcolate client-side React hook `useDeckStats(deck)`. Zero server cost.
- **Monte Carlo**: Web Worker in client con shared memory, 10k iterazioni ~200ms su desktop, ~500ms mobile. Worker isolato evita UI jank.
- **Synergy graph**: job batch server-side (Vercel Queues) che aggrega tutti i deck pubblici di un commander e calcola co-mention matrix, salvato in `card_synergies` table con TTL rebuild settimanale.
- **EDHREC data**: ingestion settimanale via unofficial API o scrape, cached in `card_meta_stats`.
- **Power level**: formula deterministica (vedi sezione dedicata).

### Schema aggiuntivo

```sql
create table public.card_synergies (
  card_a_id text not null references public.cards(id) on delete cascade,
  card_b_id text not null references public.cards(id) on delete cascade,
  commander_id text references public.cards(id),
  format text not null,
  co_mention_count integer not null,
  synergy_score numeric(4,3) not null, -- normalizzato 0-1
  computed_at timestamptz not null default now(),
  primary key (card_a_id, card_b_id, commander_id, format)
);

create table public.card_meta_stats (
  card_id text primary key references public.cards(id) on delete cascade,
  format text not null,
  salt_score numeric(3,2),
  popularity numeric(5,4), -- % of deck includes
  decks_total integer,
  updated_at timestamptz not null default now()
);
```

### Difficoltà

**L (large) — 4-6 settimane** per la suite completa.

Breakdown:
- Core stats + UI tab (1 settimana)
- Monte Carlo goldfish simulator (vedi sezione dedicata per dettaglio)
- Functional tags ingestion Scryfall Tagger (1 settimana)
- Synergy graph batch job + UI (2 settimane)
- EDHREC ingestion + meta stats (1 settimana)
- Mulligan advisor + dead card model (1-2 settimane)

### Impatto

- **User value:** 5/5 — deckbuilder quotidiano.
- **Retention:** 4/5 — chi affina deck ci passa ore.
- **Moat:** 4/5 — Moxfield ha grafico curve, Archidekt qualche stat, nessuno ha goldfish + synergy + power level integrati.
- **Revenue:** 3/5 — feature premium "Advanced Analytics" giustificata.

---

## P1 — Power level estimator deterministico

### Descrizione e user story

Il "power level" di un deck Commander (scala 1-10 informale) è la metrica più richiesta nel formato, e quella peggio gestita: Moxfield lascia voto community (rumoroso, bias), AetherHub fa heuristic opache. Adunata può vincere con un estimator **trasparente, deterministico, esplicabile**.

**User story:**
> *Voglio sapere se il mio deck è un 6, 7 o 8, e capire esattamente PERCHÉ, per calibrarlo vs il mio playgroup.*

### Formula proposta

Power level = weighted sum su 5 dimensioni:

```
PL = 0.3 * COMBO_SCORE
   + 0.2 * SPEED_SCORE
   + 0.2 * TUTOR_SCORE
   + 0.15 * INTERACTION_SCORE
   + 0.15 * CONSISTENCY_SCORE
```

Ognuna normalizzata 0-10.

**COMBO_SCORE:**
- Conta combo noti presenti (richiede combo DB — vedi sezione Combo Detector).
- 0 combo = 0 score.
- 1 combo di 2 carte = 5-7 a seconda dei card requirements.
- 1 combo instant-win 2-card senza setup = 10.
- Decay logaritmico.

**SPEED_SCORE:**
- Fast mana presente (Mana Crypt, Mana Vault, Chrome Mox, Mox Diamond, Jeweled Lotus…) → +1 per ogni, cap 8.
- Avg turn to cast commander < 4 → +2.
- Goldfish simulated win turn < 6 → +3.

**TUTOR_SCORE:**
- Unconditional tutor (Demonic, Vampiric, Imperial Seal) → +3 each.
- Conditional tutor (Enlightened, Worldly, creature-only) → +1.5 each.
- Cap 10.

**INTERACTION_SCORE:**
- Counterspells → +1 each (cap 8).
- Wipes → +2 each.
- Targeted removal → +0.5 each.
- Stax pieces → +1.5 each.

**CONSISTENCY_SCORE:**
- Card draw count / total cards ratio → normalize.
- Color fixing score > 80 → +3.
- Commander dependency (se il deck dipende dal commander per wincon) → -1.
- Goldfish keep rate > 90% → +2.

### Output UI

Una card che mostra:
- Il valore PL (es. 7.3).
- Breakdown per dimensione con progress bar.
- Top 3 "perché alto" (es. "Combo presente: Thassa's Oracle + Demonic Consultation → +7 combo score").
- Top 3 "perché basso" (es. "Solo 2 tutor → -4 tutor score").
- Bottone "What would it take to reach 8?" che suggerisce cambi.

### Difficoltà

**M (medium) — 1-2 settimane** assumendo i prerequisiti già pronti (combo DB, functional tags, goldfish sim).

### Impatto

- **User value:** 5/5 — metrica più discussa nel formato.
- **Moat:** 4/5 — formula esplicabile + breakdown = trust.
- **Revenue:** 3/5 — leverage per confronto deck, share.

### Rischi

- **Community disagreement sulla formula:** pubblicare la formula apertamente, permettere community feedback tramite GitHub issue o forum, iterare. Rendere i pesi configurabili a livello utente ("my power level" preset) in V2.

---

## P1 — Goldfish simulator (Monte Carlo)

### Descrizione

Simula N partite solitarie ("goldfishing") contro nessun avversario, applicando euristiche di play ottimali. Metrics raccolte:
- Turno medio di prima creature/spell significativa.
- Turno medio di cast commander.
- Turno medio di wincon.
- Keep rate mulligan.
- Mana screw/flood %.
- Dead card rate.

### Architettura

- **Web Worker** isolato dal main thread.
- Deck + shuffle in memoria.
- Per ogni iterazione (default 1000-10000):
  1. Shuffle.
  2. Draw 7.
  3. Apply mulligan heuristic (keep if ≥3 land, ≥2 colored source for commander, ≥1 game-winning card).
  4. Simula 15 turni:
     - Draw.
     - Play land se presente (priorità: fixing > untapped).
     - Cast ramp se disponibile e affordable.
     - Cast commander se possibile (highest priority once affordable).
     - Cast card draw.
     - Pass turn.
  5. Record turn metrics.
- Aggregate over N → distribuzione.

### Libreria e implementazione

- TypeScript puro nel worker (no dependencies pesanti).
- Heuristic di play ispirate a goldfish simulator come Lotus Planner o Manabase che usano approcci simili.
- Deterministic seed opzionale per riproducibilità.

### Difficoltà

**M (medium) — 2 settimane.**

### Impatto

- **User value:** 4/5 — potenti deckbuilder lo usano.
- **Moat:** 4/5 — complesso da implementare bene.
- **Retention:** 3/5 — non daily-use ma high-engagement.

---

## P1 — Combo detector + synergy graph

### Descrizione

Un **combo** in Magic è una combinazione di 2-4 carte che genera un loop o un win diretto (Thassa's Oracle + Demonic Consultation, Heliod + Walking Ballista, Kiki-Jiki + qualsiasi creature che untappa). Un combo detector rileva la presenza di combo noti nel deck, e avverte "attenzione: questo deck ha 3 combo, min cards to combo = 2".

**Synergy graph** è ortogonale: mostra il grafo delle carte con edge weight = quanto sono sinergiche (co-mentioned in deck dello stesso archetype).

### Combo DB

Fonte: Commander Spellbook (`commanderspellbook.com`, API pubblica). Contiene ~7000 combo catalogati con cards coinvolte, setup, result, descrizione.

```sql
create table public.combos (
  id text primary key, -- da Commander Spellbook
  name text not null,
  result text not null, -- "infinite mana", "infinite damage", etc
  color_identity text[], -- [W,U,B,R,G]
  prereq text,
  steps text[],
  created_at timestamptz default now()
);

create table public.combo_cards (
  combo_id text not null references public.combos(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  role text, -- "primary", "enabler"
  primary key (combo_id, card_id)
);

create index combo_cards_card_idx on public.combo_cards(card_id);
```

Ingestion: cron job settimanale da Commander Spellbook API.

### Combo detection query

```sql
-- Dato un deck, trova combo interamente presenti
select c.*
from public.combos c
where not exists (
  select 1 from public.combo_cards cc
  where cc.combo_id = c.id
  and cc.card_id not in (
    select card_id from public.deck_cards where deck_id = $1
  )
);
```

O in TypeScript:
```ts
const deckCardIds = new Set(deck.cards.map(c => c.card_id));
const presentCombos = allCombos.filter(combo =>
  combo.cards.every(cardId => deckCardIds.has(cardId))
);
```

### Partial combo detection

Utile: "ti manca 1 carta per completare questo combo". Query:
```ts
const partialCombos = allCombos
  .map(combo => ({
    ...combo,
    missing: combo.cards.filter(c => !deckCardIds.has(c)),
  }))
  .filter(c => c.missing.length === 1);
```

### Synergy graph

Precompute batch:
- Per ogni coppia (card_a, card_b), conta co-mentions in deck pubblici dello stesso commander/format.
- Normalize: `synergy = (co_mentions_ab / decks_with_a) * idf(card_b)` dove idf penalizza carte onnipresenti (Sol Ring, Command Tower).

UI: graph visualization con `react-force-graph` o `d3-force`. Node size = card popularity, edge weight = synergy. Rendering interattivo: click su nodo → carta highlight + info.

### Difficoltà

**L (large) — 3-4 settimane** per combo detection + synergy graph completi.

### Impatto

- **User value:** 4/5 — combo detection = immediate value, synergy graph è "wow feature" per power user.
- **Moat:** 5/5 — nessun competitor ha entrambi integrati.

---

## P1 — Collection management + deck overlay

### Descrizione

Utente gestisce la propria collezione (carte possedute, quantity, foil, condizione, set, prezzo acquisto). Deck overlay: "di questo deck hai 87/100 carte, ti mancano queste 13 → €47 totali al prezzo attuale".

### Schema

Già definito nella sezione scanner. Ricapitolo:

```sql
create table public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 0),
  foil boolean not null default false,
  language text not null default 'en',
  condition text check (condition in ('M','NM','LP','MP','HP','D')) default 'NM',
  acquired_at timestamptz default now(),
  acquired_price_eur numeric(10,2),
  notes text,
  unique (user_id, card_id, foil, language, condition)
);
```

Aggiungere:
- `user_card_locations` (binder_id, slot) se si vuole tracking fisico.
- `user_wishlists` per "cerco queste carte".
- `price_alerts` per "avvisami se Sol Ring scende sotto €0.50".

### API

- `GET /api/collection` — lista paginata con filtri (color, rarity, set, owned > 0).
- `POST /api/collection/add` — aggiunge N copie di una stampa specifica.
- `POST /api/collection/bulk-import` — CSV upload (Deckbox, Moxfield, Manabox format).
- `DELETE /api/collection/:id` — rimuove.
- `GET /api/decks/:id/overlay` — ritorna per ogni carta del deck `{owned: n, need: m, price_missing_eur: x}`.

### UI

- Pagina `/collection` con virtualized grid/list view, filters, search.
- Overlay nel deck editor: badge "Owned" o "Missing" su ogni card.
- Aggregate summary bar: "87/100 carte posseduti, €47 to complete".
- Bottone "Export shopping list" → PDF o link Cardmarket con tutti gli slot pre-riempiti.

### Cardmarket deep-link (bonus):

Cardmarket permette deep-link di wanted list. Format: `https://www.cardmarket.com/en/Magic/Cards/CardName?rarity=X`. Build link per ogni missing card → clipboard + open all.

### Difficoltà

**L (large) — 4-6 settimane.**

Breakdown:
- Schema + RLS (2 giorni)
- API endpoints (1 settimana)
- Collection UI (virtualized list, filters) (1.5 settimane)
- Import CSV (Deckbox/Moxfield/Manabox parsers) (1 settimana)
- Deck overlay + shopping list export (1 settimana)
- Price tracking + alerts (Upstash queue + cron) (1-2 settimane)

### Impatto

- **User value:** 5/5 — cattura use case Manabox, abilita scanner use case.
- **Retention:** 5/5 — collection è sticky, utente non la porta via facilmente.
- **Moat:** 4/5 — collection + deck + live play in un'app = unicum.
- **Revenue:** 4/5 — unlimited collection sotto tier Pro.

---

## P2 — Playgroup persistenti, ELO e meta tracking

### Descrizione

Un giocatore Commander ha un **playgroup** ricorrente. Vuole:
- Creare un gruppo invitando 3-5 amici.
- Loggare ogni match giocato (vincitore, partecipanti, commander usati, turn count, note).
- Vedere stats: chi vince di più, commander più usati, win rate per commander, streak.
- Definire **banlist custom** del gruppo ("no tutor unconditional", "no infinite combo T4").
- Meta tracking locale: quali archetype vincono nel tuo gruppo.

**User story:**
> *Il mio gruppo di martedì sera vuole sapere chi è il più vincente quest'anno, e se Edgar Markov davvero domina come pensiamo.*

### Schema

```sql
create table public.playgroups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  description text,
  banlist_rules jsonb default '{}'::jsonb, -- custom rules
  visibility text check (visibility in ('private','invite','public')) default 'invite'
);

create table public.playgroup_members (
  playgroup_id uuid not null references public.playgroups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text check (role in ('owner','member')) default 'member',
  joined_at timestamptz default now(),
  elo integer default 1200,
  primary key (playgroup_id, user_id)
);

create table public.playgroup_matches (
  id uuid primary key default gen_random_uuid(),
  playgroup_id uuid not null references public.playgroups(id) on delete cascade,
  played_at timestamptz default now(),
  logged_by uuid references auth.users(id),
  turn_count integer,
  notes text
);

create table public.playgroup_match_players (
  match_id uuid not null references public.playgroup_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  commander_id text references public.cards(id),
  deck_id uuid references public.decks(id),
  is_winner boolean default false,
  placement integer, -- 1st, 2nd, 3rd, 4th
  elo_before integer,
  elo_after integer,
  elo_delta integer,
  primary key (match_id, user_id)
);
```

### ELO system

Variante multi-player ELO (Elo with K=32, pairwise scoring):
- Ogni player vs ogni altro player viene trattato come match 1v1.
- Se A vince, A batte B, C, D → +elo da ognuno.
- Se pareggio (rare), 0 delta.

Formula:
```
expected(A,B) = 1 / (1 + 10^((elo_B - elo_A) / 400))
actual(A,B) = 1 se A winner e B perdente, 0.5 se pareggio, 0 se A perdente

delta(A) = K * sum_over_B (actual(A,B) - expected(A,B))
```

Aggiornamento atomico via RPC Postgres.

### UI

- Pagina `/playgroups/:id` con leaderboard, recent matches, commanders leaderboard, stats charts.
- Form "Log match" con multi-select di player, selezione deck, winner, placement, turn count.
- Stats dashboard: win rate per commander (filterable per player), monthly trends, commander popularity.
- Banlist panel: custom rules editor (es. rules JSON con linter).

### Difficoltà

**M-L (medium-large) — 3-4 settimane.**

### Impatto

- **User value:** 4/5 — per utenti dedicated.
- **Retention:** 5/5 — niche ma chi lo usa non se ne va.
- **Moat:** 4/5 — Moxfield playgroup è statico.
- **Revenue:** 3/5 — Pro feature.

---

## P2 — Multiplayer extensions (spectator, replay, 4-pod, voice)

### Descrizione

Il multiplayer 1v1 già esiste. Estensioni:

1. **Pod-of-4** (4 giocatori simultanei, Commander standard).
2. **Spectator mode** (unlimited viewer read-only con chat).
3. **Voice chat** integrato (WebRTC, opzionale).
4. **Match replay** (full state history navigabile post-match).

### Sfida tecnica principale: 4-pod state sync

Il current state machine Adunata è 1v1. Espandere a 4-pod significa:
- Turn order (APNAP con 4 players).
- Priority passing tra 4.
- Combat con multi-attack targets (attaccare diversi player nello stesso turno).
- Politics (promising no-attack, deal-making) non richiede state ma UI affordance.

Il realtime channel Supabase già usato per 1v1 scala a N player con semplice broadcast.

### Spectator

Nuovo channel `spectator:${gameId}` read-only. Server filtra eventi "hidden info" (hand, library top) prima di broadcast a spectator. Spectator non può agire.

### Replay

Event log persistente:
```sql
create table public.game_events (
  id bigint primary key generated always as identity,
  game_id uuid not null references public.games(id) on delete cascade,
  turn integer,
  phase text,
  event_type text not null,
  payload jsonb not null,
  actor_id uuid,
  created_at timestamptz default now()
);

create index game_events_game_turn_idx on public.game_events(game_id, id);
```

Ogni azione scrive a `game_events`. Replay = read eventi in ordine e applica allo state reducer lato client. Same code path del gioco live ma senza broadcast.

UI replay: timeline scrubber + play/pause + step-forward.

### Voice chat

WebRTC con LiveKit (hosted SFU, free tier generoso). Integration via `@livekit/components-react`. Alternative: Daily.co, Vercel può collaborare via partner.

### Difficoltà

**XL (extra large) — 6-10 settimane** per tutto.

- 4-pod state machine extension (2-3 settimane)
- Spectator mode (1-2 settimane)
- Replay system (2 settimane)
- Voice chat (1-2 settimane)
- Tournament bracket integration (1 settimana)

### Impatto

- **User value:** 4/5 — per playgroup e tournament.
- **Moat:** 5/5 — unicum nel mercato, replica costosa.

---

## P3 — Social, feed e content

### Descrizione

- **Following**: segui utenti, vedi i loro deck pubblici nel feed.
- **Feed**: timeline di deck nuovi, update, analisi pubblicate.
- **Card discussions**: thread per ogni carta con rulings/tech.
- **Deck tech embeds**: link YouTube/Twitch/PrimerDoc.
- **Likes, comments** sui deck.

### Architettura

Pattern social standard. Realtime feed via Supabase Realtime + pull-based.

### Schema

```sql
create table public.follows (
  follower_id uuid references auth.users(id) on delete cascade,
  followed_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followed_id)
);

create table public.deck_comments (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references public.decks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  body text not null,
  parent_id uuid references public.deck_comments(id),
  created_at timestamptz default now()
);

create table public.deck_likes (
  deck_id uuid references public.decks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (deck_id, user_id)
);
```

### Difficoltà

**M-L — 4-8 settimane**.

### Impatto

- **Growth/viral:** 5/5 — network effects.
- **Retention:** 4/5 — feed sticky.
- **Revenue:** 2/5 — indirect.

---

## P3 — Tournament tools

### Descrizione

Per organizzatori locali:
- Swiss pairing generator.
- Single/double elimination bracket.
- Decklist check automatico vs banlist formato.
- Timer + round management.
- Pubblicazione risultati.

### Difficoltà

**M — 3-5 settimane**.

### Impatto

- Niche ma cattura organizer cluster.

---

## P3 — Deck diff visuale tra versioni

### Descrizione

Timeline versioni deck, side-by-side diff visuale (carte aggiunte/rimosse/modificate quantity) con thumbnails.

### Implementazione

`deck_versions` table already exists o va creata:
```sql
create table public.deck_versions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references public.decks(id) on delete cascade,
  version_number integer not null,
  snapshot_json jsonb not null, -- intero deck serializzato
  commit_message text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);
```

Diff = set difference su card_id, con quantity delta.

UI: timeline left, diff view right con thumbnails `added` (green) / `removed` (red) / `changed` (yellow).

### Difficoltà

**S (small) — 1-2 settimane**.

### Impatto

- Nice-to-have.

---

## Infrastruttura trasversale

### Vercel AI Gateway
Tutte le chiamate a LLM (entity extraction, reasoning, embedding, Gemma server-side) via AI Gateway con provider-string pattern `"provider/model"`. Zero provider keys in code, observability nativa, model fallback automatico, zero data retention opt-in.

### pgvector + ivfflat
Abilitato su Supabase. Usato per: rules knowledge base, card rulings embeddings, card description embeddings (per semantic search "show me all removal spells that also draw a card"), card image embeddings (scanner verify).

### Vercel Queues
Durable event streaming per: ingestion batch jobs (Scryfall bulk, CR updates, Commander Spellbook sync), price backfill, synergy graph recompute, ELO updates.

### Upstash Redis
Cache layer: Scryfall proxy cache (TTL 7d), embeddings cache, rate limit, session state per multiplayer.

### Vercel Blob
Storage user-uploaded content: avatar, deck cover images, card scan photos (ephemeral, TTL 1h processing poi delete).

### Scryfall Tagger ingestion
`tagger.scryfall.com` è community-maintained. Usa GraphQL endpoint pubblico (non documentato ufficialmente, ma usato da vari tool). Ingestion job mensile in `card_functional_tags`:

```sql
create table public.card_functional_tags (
  card_id text references public.cards(id) on delete cascade,
  tag text not null,
  source text default 'scryfall_tagger',
  primary key (card_id, tag)
);
create index card_functional_tags_tag_idx on public.card_functional_tags(tag);
```

### Monitoring e observability
- Vercel Analytics + Web Vitals.
- Log structured JSON con pino (già in uso?).
- AI Gateway dashboard per model usage + latency + costi.

---

## Appendice — Schema DB changes aggregato

Le migration da creare, in ordine di dipendenza, quando si esegue tutto:

1. `enable extension vector`
2. `create table deck_sections` + indexes + RLS
3. `alter deck_cards add section_id tags position_in_section`
4. `create table card_functional_tags`
5. `create table user_cards` + RLS
6. `create table mtg_rules` + pgvector index
7. `create table card_rulings` + pgvector index
8. `create table rules_qa_history`
9. `create table combos + combo_cards`
10. `create table card_synergies + card_meta_stats`
11. `create table playgroups + playgroup_members + playgroup_matches + playgroup_match_players`
12. `create table game_events` (se non esiste)
13. `create table follows + deck_comments + deck_likes`
14. `create table deck_versions` (se non esiste)

Tutte con RLS e policy appropriate. Ricorda di aggiungere ad `alter publication supabase_realtime add table X` quando serve realtime (games, playgroup_matches).

Ricorda anche di aggiornare `src/types/supabase.ts` dopo ogni migration (regola CLAUDE.md).

---

## Glossario difficoltà e impatto

**Difficoltà (effort per 1 engineer full-stack):**
- **S (small):** 1-2 settimane, un solo layer (UI o API), zero nuove dipendenze.
- **M (medium):** 2-4 settimane, due layer, minimal new dependencies, schema change semplice.
- **L (large):** 4-6 settimane, stack multi-layer, external data sources, testing approfondito.
- **XL (extra large):** 6-10+ settimane, integrazione multi-stack (AI, WebGPU, realtime), ricerca tecnologica, iterazione con utenti beta.

**Impact rating (1-5 per dimensione):**
- **User value:** quanto risolve un pain point reale dell'utente.
- **Retention:** probabilità che l'utente torni per questa feature.
- **Growth/viral:** capacità di attrarre nuovi utenti.
- **Moat:** difficoltà per un competitor di replicare.
- **Revenue:** potenziale di monetizzazione diretta o indiretta.

---

**Fine documento.** Questo piano è un documento vivo: ogni sezione va rivista quando la feature è prioritizzata per l'esecuzione, e convertita in piano esecutivo con TDD step-by-step (via `superpowers:writing-plans`) nel momento dell'implementazione.
