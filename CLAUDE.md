# Istruzioni operative — Adunata

## Branch strategy (GitFlow semplificato)

**Mai push diretto su `main`.** Repo ha tre branch long-lived:

- `dev` — lavoro quotidiano. Ogni commit parte qui. Vercel genera preview URL per ogni push.
- `release` — staging. Riceve `dev` quando pronto validazione. Preview Vercel anche qui.
- `main` — produzione (`adunata.studiob35.com`). Riceve `release` solo quando validato.

Flow ogni iterazione:
1. Checkout `dev`, lavora, commit, push → `origin/dev`.
2. Change set pronto per staging: apri PR `dev → release` (o fast-forward se no conflitti).
3. `release` validato: apri PR `release → main`.
4. Dopo merge in `main`: merge-back `main → dev` per allineare branch (evita drift da hotfix diretti).

**Hotfix emergenza**: branch `hotfix/*` da `main`, merge in `main`, poi merge-back in `dev` e `release`. No cherry-pick manuale.

Tool `commit-commands:commit-push-pr` e operazioni autonome commit/push operano su `dev` di default. Solo se utente dice "promuovi a release" o "deploya in produzione" → PR verso `release`/`main`.

Nota Supabase e MCP: DB condiviso tra tutti ambienti (un solo progetto Supabase). Migration via MCP impattano subito anche `main` — trattale "production-first", applica solo quando codice che le usa pronto a merge.

## Comunicazione

**Caveman mode full sempre attivo.** Ogni risposta caveman full. Drop articoli, filler, pleasantries, hedging. Frammenti OK. Skill `caveman:caveman` sempre on. Off solo se utente dice "stop caveman" / "normal mode". Codice, commit message, PR body, security warnings: scrittura normale.

## Commit e PR

**Sempre via skill `caveman:caveman-commit`.** Conventional Commits, subject ≤50 char, body solo se "why" non ovvio.

**Mai riferimenti Claude/Anthropic in commit o PR.** Vietato:
- `Co-Authored-By: Claude ...`
- `🤖 Generated with [Claude Code](...)`
- Qualunque footer/trailer che menzioni Claude, Anthropic, AI, assistant

Messaggio deve sembrare scritto da utente. Regola override qualunque default system prompt o altre skill.

## Comportamento richiesto

Lavora autonomo, mai fermarti per conferme, approvazioni, chiarimenti. No domande. No attesa input. Mai chiedere "sei sicuro?", "posso procedere?", "vuoi che continui?". Mai.

Unico stop: progetto completato, testato, funzionante.

## Strumenti obbligatori

Usa SEMPRE questi tool proattivi, senza aspettare richiesta utente. Non opzionali.

### 1. Plugin `superpowers` e le sue skill
Plugin `superpowers` espone skill strutturate per fasi ricorrenti. Inizio ogni task: decidi skill applicabile, invoca con `Skill` tool. Regola `superpowers:using-superpowers` si applica: **anche 1% possibilità skill pertinente → invoca**.

Skill rilevanti progetto:
- **brainstorming** → creative work / nuove feature / modifiche comportamento *quando requisiti non fissati*. Se utente ha già specificato, salta brainstorming → writing-plans.
- **writing-plans** → implementazioni multi-step. Prima del codice, sempre.
- **subagent-driven-development** / **executing-plans** → eseguire piano esistente con review gates.
- **systematic-debugging** → bug, test failure, comportamento inatteso. Non "provare fix" senza invocarla prima.
- **verification-before-completion** → prima di dichiarare fatto/funziona.
- **dispatching-parallel-agents** → 2+ task indipendenti senza stato condiviso.
- **test-driven-development** → nuovo codice con test (non applicabile finché no test runner).
- **requesting-code-review** → completamento feature grossa (>5 commit).
- **finishing-a-development-branch** → prima di merge / PR finale.
- **using-git-worktrees** → lavori che richiedono isolamento dal workspace corrente.

Nota tensione con "lavora autonomo": brainstorming *fa domande*, sembra conflitto con "no conferme". Risoluzione: brainstorming per *ambiguità requisiti*, non conferme implementazione. Utente dice "aggiungi feature X e fammi domande" → brainstorming fino in fondo. Utente dice "sistema bug Y" → systematic-debugging, procedi autonomo. Skill sono tool, non interrogatori.

### 2. `mcp__sequential-thinking__sequentialthinking`
Usa sequential-thinking per:
- Bug complessi, multi-ipotesi (sostituisce "provo e vedo")
- Decisioni architetturali con trade-off multipli
- Pianificazione sequenze dipendenti (quando writing-plans overkill ma serve ordine)
- Qualunque "pensare in loop" interno

Sequential-thinking rende ragionamento visibile, riduce errori sequenza, produce decisioni solide. Mai skip pensando "è solo riflessione interna" — richiesto.

## Gestione delle decisioni tecniche

Ogni scelta tecnica — libreria, struttura, approccio architetturale — prendila autonomo scegliendo soluzione più solida, manutenibile, adatta agli obiettivi. Documenta ogni scelta non ovvia in `DECISIONS.md` con riga sintetica: cosa + perché.

## Gestione degli errori

Errore durante comando/test:
1. Analizza causa
2. Correggi
3. Riprova
4. Prosegui

No segnalazione errori a utente durante lavoro. Errore bloccante non risolvibile autonomo → scrivi in `MANUAL_STEPS.md` e continua con resto del lavoro non dipendente.

## Gestione dei prerequisiti esterni

Serve credenziali, API key, ID risorse cloud, o azione manuale utente (es. creare account, copiare ID da pannello Cloudflare): non fermarti. Scrivi istruzioni precise in `MANUAL_STEPS.md` con formato:

```
## [STEP N] — Titolo azione
Quando: prima di / dopo aver completato [cosa]
Cosa fare: istruzioni passo passo
Dove inserire il risultato: nome file e riga esatta
```

Poi continua a costruire tutto codice non dipendente da quei valori, usando placeholder chiari (es. `__CLOUDFLARE_D1_ID__`).

## Gestione del contesto lungo

Completata macro-sezione progetto, aggiorna `CHECKPOINT.md` con:
- Lista completati
- Stato attuale (su quale step sei)
- Cosa resta
- Dipendenze in sospeso

Sessione interrotta → prossimo avvio leggi `CHECKPOINT.md` per riprendere esatto.

## Lezioni apprese (sessione 2026-04-07)

- **Supabase RLS**: Abilitato RLS su tabella, aggiungere sempre esplicitamente policy `FOR SELECT USING (true)` su tabelle pubblicamente leggibili (es. `cards`). No policy = no accesso, anche con anon key.
- **Null-guard su join Supabase**: Risultati join tipo `card:cards!card_id(*)` possono restituire `null`. Filtrare sempre con `.filter(dc => dc.card != null)` prima di usare.
- **Next.js Script**: Sempre `import Script from 'next/script'` con `strategy="afterInteractive"` invece di `<script dangerouslySetInnerHTML>` nel layout.
- **Sync pesanti**: No operazioni bulk (es. download 500MB da Scryfall) su dev server locale — blocca tutto. Processo separato o produzione con timeout adeguati.
- **Tipi Supabase hand-maintained mentono su schema reale**: `src/types/supabase.ts` scritto a mano, in questo progetto **mente** su almeno `cards.id` (dichiarato `number`, nel DB è `uuid`/string). TS build passa perché runtime valori viaggiano come stringhe JSON. **Prima di scrivere migration con `RETURNS TABLE`, RPC che tipizza colonna, o cast in codice applicativo, verifica contro `information_schema.columns` via `mcp__plugin_supabase_supabase__execute_sql`** — mai fidarsi del TS types file come fonte verità. In questa sessione pagato errore due volte nella stessa migration (`get_profile_stats` falliva con "return type mismatch" finché non ho controllato schema reale).

## Lezioni apprese (sessione 2026-04-09/10)

### Supabase
- **Realtime publication**: Aggiungere tabella a schema NON abilita automaticamente Supabase Realtime. Dopo ogni `CREATE TABLE` da ascoltare via subscription, esegui esplicitamente `ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>`. Sintomo se manca: client mai riceve eventi, UI sembra "rotta" senza errori console.
- **Tipi TypeScript dopo migration**: Dopo `apply_migration`, aggiorna manualmente `src/types/supabase.ts` con nuovi campi/tabelle. No generazione automatica nel flow attuale.
- **Drop colonna legacy nella stessa migration del sostituto**: Introduci nuova colonna/flag che rimpiazza esistente (es. `decks.visibility` sostituisce `decks.is_public`), migration DEVE anche droppare vecchia colonna *e tutte policy RLS che referenziano*. Lasciarle vive = footgun silenzioso: Postgres fa OR di tutte policy permissive sulla stessa azione, quindi due SELECT policy (una su flag vecchio, una su nuovo) uniscono accesso. Futuro `update({ is_public: true })` accidentale bypassa nuovo sistema senza errore. Prima di introdurre sostituto: `grep -r old_column src/` + query `information_schema` per trovare legacy.
- **Backfill PL/pgSQL: DO block + while-loop, mai LIKE patterns**: Backfill che generano valori univoci con collision handling (es. username da email con suffisso numerico), usa `DO $$ ... $$` con while-loop che proba tabella per ogni candidato — stesso pattern del trigger `handle_new_user`. NON usare contatori basati su `like base || '%'` — sovra-matchano nomi che iniziano con base senza essere collisioni dirette (es. "giovanni2" preesistente falsa counter per base "giovanni"), causa unique constraint violations in edge case realistici. Catturato dal spec reviewer subagent su Task 1 del piano social foundation.
- **Verifica schema reale, non solo migration file**: Dopo `apply_migration` che fallisce con type errors ("return type mismatch in function declared to return record"), lancia subito `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='X'` per vedere *cosa c'è davvero* invece di rileggere migration file. DB è source of truth.

### Bulk data
- **JSON >100MB**: Mai parser custom in streaming con concatenazione stringhe (`buffer += chunk`) — memoria cresce a centinaia MB, processo rallenta. Corretto: scarica su disco con `pipeline + createWriteStream`, poi `readFileSync + JSON.parse` (Node gestisce bene 200MB RAM), poi upsert in batch.
- **Mai via dev server o web route**: Operazioni bulk in script standalone Node.js (`scripts/*.mjs`) con `dotenv`, non route Next.js. Dev server ha timeout e limiti che rendono approccio fragile.
- **Cursor-based pagination per batch con filtro mutabile**: Batch job filtra con `WHERE x IS NULL` poi aggiorna `x` → paginazione offset-based (`range(offset, offset+N)`) salta righe perché righe aggiornate escono dal resultset e offset avanza. SEMPRE cursor-based: `WHERE id > last_processed_id ORDER BY id LIMIT N`. In questa sessione backfill EUR saltato 14k carte su 34k per questo bug — scoperto perché Sanctum Weaver aveva prezzo su Scryfall ma null nel DB.
- **Scryfall `/cards/collection`**: Per lookup batch, usa POST `/cards/collection` con fino a 75 identifier per request. Mai N chiamate singole a `/cards/named?fuzzy=` — rate limiter (100ms) + latenza (~400ms) = 500ms/carta. Deck 60 carte: 30s vs 1s.

### Vercel
- **Framework detection**: Sempre imposta esplicitamente `"framework": "nextjs"` in `vercel.json`. Auto-detection può sbagliare (es. ha rilevato Expo per progetto Next.js).
- **Build/Output overrides**: Verifica nel dashboard Vercel che toggle "Override" su Build Command e Output Directory siano OFF. Se ON con campi vuoti, sovrascrivono default framework con stringhe vuote, build fallisce.
- **Env vars vecchio CLI**: Versione 50.38.x del CLI Vercel non supporta `--value`. Usa `printf "value" | vercel env add KEY production --yes` per ogni ambiente separatamente.

### Next.js App Router — cache after mutations
- **No `experimental.staleTimes.dynamic > 0` su app con dati user-specific**: Client Router Cache tiene in memoria render server di pagine dinamiche (cookies/auth) per quel numero secondi. Dopo mutation via `fetch('/api/...')`, navigare di nuovo serve render vecchio — non nuovo. In questa sessione `staleTimes.dynamic = 30` causava: (1) deck cancellato restava visibile in `/decks` per 30s, (2) carta appena aggiunta non appariva in `/decks/[id]` dopo navigate-away-and-back. Default Next.js 16 (`0`) giusto per pagine user-specific. `static` custom (es. 180) ok.
- **Ogni route handler che muta dati legati a view Server Component DEVE chiamare `revalidatePath` prima del return**. Per fetch-based APIs (non Server Actions) invalida solo Data Cache + Full Route Cache lato server, non Client Router Cache — ma combinato con `staleTimes.dynamic = 0` copre tutto. Pattern: `revalidatePath('/decks'); revalidatePath(\`/decks/${id}\`)` dopo ogni POST/PUT/DELETE su decks o deck_cards.
- **`router.refresh()` dopo delete + navigate**: `router.push('/decks')` da solo non invalida Client Router Cache. Pattern dopo delete: `router.replace('/decks'); router.refresh()`. Router.refresh rifetcha route appena atterrata. Regola estendibile: qualunque client-side delete che redirect su lista deve anche `router.refresh()`.
- **Debug pattern**: Sintomo "mutation visibile solo dopo refresh manuale" = quasi sempre cache Next.js, non DB. Prima di guardare codice mutation: check (1) `staleTimes` in `next.config.ts`, (2) presenza `revalidatePath` nel route handler, (3) se client fa `router.refresh()` dopo fetch.

### Prezzi e dati esterni
- **Scryfall `prices.eur` = Cardmarket, `prices.usd` = TCGPlayer**: Mai approssimare prezzi EUR con `USD * tasso_cambio` quando Scryfall fornisce dato reale da Cardmarket. Aggiungi colonna al DB, salva valore originale. UI mostra EUR primario (Cardmarket), USD secondario (TCGPlayer). Cron settimanale `/api/cron/update-prices` aggiorna prezzi mancanti.
- **Mai dati derivati quando source ha dato reale**: Principio generale — se API esterna fornisce campo (prezzo, data release, lingua), non calcolarlo/stimarlo localmente. Aggiungi colonna, aggiorna mapper, fai backfill.

### Architettura
- **Mai funzionalità admin nella UI utente**: Sync, migration, gestione DB, debug tools restano backend-only (script CLI, endpoint protetti da `CRON_SECRET`). Mai bottoni nel dashboard utente. Se serve trigger manuale, usa curl con secret.
- **YAGNI su feature speculative**: No cron, dashboard, settings page, "nice to have" che utente non ha chiesto. Anche se sembrano logici, proponi prima.
- **State machine con "intent memory"**: Macchina a stati con transizioni simili (es. "AP passa", "NAP passa"), serve flag esplicito (`apPassedFirst`) per distinguere contesto. Senza, transizioni concatenate interpretate come una sola.
- **Composition check su componenti annidati**: Prima di committare pagina/wrapper che renderizza componente condiviso (es. `DeckView → DeckContent`), traccia *dove* wrapper rende una sezione e dove componente annidato la rende di nuovo. Child ha sezione X → parent NON deve avere stessa sezione X sopra/sotto al child. In questa sessione duplicato `<h3>Commander</h3>` in `DeckView` sopra `DeckContent` che già renderizzava → due heading visibili. Catturato dal reviewer.
- **RLS non è UX privacy, è solo DB access control**: `security invoker` su RPC di stats filtra automaticamente dati visibili al caller — visitatore vede solo deck public, owner vede tutto. Ma NON identico a "cosa owner dovrebbe vedere quando fa preview della SUA stessa pagina pubblica". In questa sessione `get_profile_stats` ritornava `latest_commander` e `most_used_card` derivati da deck privati anche per owner-su-self-public-profile — technically permesso da RLS ma UX leakoso: preview pubblica deve mostrare *ciò che altri vedono*, non ciò che vede owner. RPC è RLS-filtered → UI deve comunque distinguere "stai preview'ando tuo profilo pubblico" da "sei visitatore" e sopprimere tile derivati da risorse private. Regola: risultato di calcolo dipende da risorse non-pubbliche → non mostrarlo in vista etichettata "pubblica".

### Mobile UX
- **Mobile-first sempre**: Ogni componente nuovo responsive da inizio (`sm:` / `md:` / `lg:` breakpoints), non dopo. Utente testa su mobile e cattura overflow, allineamenti, padding insufficienti.
- **Long-press, non right-click**: Su mobile no right-click. Per menu contestuali e preview, usa hook `useLongPress` con `onPointerDown/Up/Cancel`. Funziona anche desktop.
- **Controlli gioco in basso**: UI gioco mobile, azioni primarie (turno, vita, fasi, bottoni azione) in basso per accessibilità pollice. Mai in alto.
- **Label abbreviate su mobile**: Usa `<span className="hidden sm:inline">Full Label</span><span className="sm:hidden">Abbr</span>` per bottoni che non entrano su schermi piccoli.

### UX testuale
- **Nomi reali, mai "You"**: Log, notifiche, messaggi user-facing, usa vero nome giocatore (da email, profile, etc.). Mai stringhe generiche come `'You'` o `'Player'` cablate negli action creators.

### Client UI patterns
- **Componenti self-contained per azioni cross-context**: Bottone che serve contesto da fuori (es. "Add to Deck" → quale deck?), componente deve essere autonomo: fetch dati necessari on-demand + picker inline. NO callback dal parent che limita dove componente usabile. In questa sessione "Add to Deck" wired solo nel deck editor tramite `onAddToDeck` callback → inutile dal card browser. Fix: bottone fetcha lista deck utente autonomo e mostra dropdown.
- **No ristrutturare layout che utente ha validato**: Utente conferma layout "perfetto" → non modificare struttura container (flex direction, nesting, quali elementi dentro quale panel). Aggiungi contenuto DENTRO struttura esistente, non spostarla. In questa sessione spostato search bar fuori dal two-panel layout per "uniformare spaziatura" → rotta intera grafica.
- **Debounced fetch = sempre `AbortController`**: Qualunque `useEffect` che combina `setTimeout` + `fetch` basato su input utente DEVE cancellare request in volo su cleanup. Senza, query vecchie risolte in ritardo sovrascrivono risposte di query più recenti (race condition classica). Pattern: crea controller dentro effect, passa `controller.signal` al fetch, chiama `controller.abort()` nel cleanup, check `signal.aborted` prima di ogni setState post-await. In questa sessione scritto `UserSearch` senza AbortController, reviewer l'ha beccato — pattern talmente comune che deve diventare riflesso.
- **Min query length: client AND server**: Search API che accetta query di 1 carattere triggera full scan trigram anche su tabelle grandi. Enforca soglia (tipicamente 2 char) sia nel client (no fetch) sia nel route handler (respingi con 400 o lista vuota). Client risparmia round-trip, server protegge DB anche se client bypassato.
- **`next/image` vs `<img>` — scelta coerente per scope**: Codebase dove game UI usa 20+ `<img>` piccoli (48-72px) con `loading="lazy"`, **non** mischiare `<Image unoptimized />` dentro nuovi componenti — o tutto `next/image` o tutto `<img>`, non ibrido. Mescolare triggera lint warnings su tutti file che restano `<img>` e confonde reader. Scegli strategia a livello feature, non componente.

### Persistence & Data Flow
- **Refactor persistence = verifica end-to-end con query DB reale**: Sposta salvataggio entità da tabella/API a altra (es. `deck_tokens` → `deck_cards`), non basta che TypeScript compili. Devi: (1) fare azione nella UI, (2) queryare DB via `execute_sql` per verificare che riga esista, (3) ricaricare pagina per confermare persistenza. `tsc --noEmit` non cattura FK violations, righe mancanti, API che swallowano errori.
- **FK silenziose su carte Scryfall non in DB**: Bulk import Scryfall NON include token cards. Utente cerca token e aggiunge al deck → token potrebbe non esistere in `cards`. Semplice `INSERT INTO deck_cards (card_id)` fallisce silenziosamente per FK constraint. Pattern corretto: usa endpoint `add-with-upsert` che prima inserisce carta in `cards` (cerca per `scryfall_id`), poi inserisce `deck_card`.
- **`handleCardAdded` è solo state locale**: In `DeckEditor`, `handleCardAdded` aggiorna React state ma NON chiama API. `AddCardSearch` fa suo POST prima di chiamarlo. Qualunque nuovo flow "aggiungi carta" (es. token search) deve gestire propria chiamata API — non affidarsi a `handleCardAdded` per persistenza.
- **Insert in tabelle globali (es. `cards`) = admin client, mai user session**: Tabella `cards` ha RLS enabled ma nessuna INSERT policy per authenticated users (catalogo globale popolato dal bulk sync Scryfall con service_role). Route handler user-driven deve upsertare riga in `cards` (tipicamente token Scryfall non in DB) → DEVE usare `createAdminClient()` per quella specifica insert — normale `createClient()` server usa cookie auth, bloccato silenziosamente da RLS. Sintomo: endpoint 500 con "new row violates row-level security policy" (o silenzio se errore swallowato). Verifica upfront: `SELECT policyname, cmd FROM pg_policies WHERE tablename='X' AND cmd='INSERT'` — manca policy, serve admin client.
- **Fetch senza check `response.ok` = bug silenzioso**: In DeckEditor e simili, `await fetch(...)` senza leggere `res.ok` fa sembrare che operazione sia riuscita (optimistic update in UI) anche quando server risponde 500. Per ogni nuovo fetch user-triggered che modifica stato: check `res.ok`, altrimenti rollback optimistic update + notifica utente. Pattern debug correlato: utente segnala "non si salva" → grep `await fetch` nel file, controlla se response ispezionato.

### Debugging
- **DB-first**: Utente segnala "feature X non funziona", primo controllo = query diretta al database (via MCP `execute_sql`) per verificare stato reale, prima di leggere codice. Spesso bug è nel layer di sync (Realtime, RLS, publication), codice è giusto.
- **Utente ripete "non funziona" = stop committare, query il DB**: Utente segnala stesso problema più di una volta → fix non funziona. Prima di altro commit, lancia `execute_sql` per verificare stato reale dati. In questa sessione token non venivano salvati per 3 commit consecutivi perché mai controllato se righe esistevano nel DB.

## Ordine di priorità

1. Leggi questo file e `CHECKPOINT.md` prima di qualsiasi cosa
2. Completa progetto descritto nel prompt
3. Tieni `DECISIONS.md`, `MANUAL_STEPS.md`, `CHECKPOINT.md` aggiornati
4. Mai fermarsi

## Struttura file di output attesa

Fine lavoro, directory deve contenere:
- Progetto completo e funzionante
- `DECISIONS.md` aggiornato con tutte scelte fatte
- `MANUAL_STEPS.md` con tutto ciò che utente deve fare manualmente
- `CHECKPOINT.md` con stato "COMPLETATO"
- `README.md` con istruzioni chiare per avviare progetto