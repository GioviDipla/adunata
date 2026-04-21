# Istruzioni operative — Adunata

## Comportamento richiesto

Lavora in modo completamente autonomo, senza mai fermarti per chiedere conferme, approvazioni o chiarimenti. Non fare domande. Non aspettare input dall'utente. Non chiedere "sei sicuro?", "posso procedere?", "vuoi che continui?". Mai.

L'unico momento in cui puoi fermarti è quando l'intero progetto è completato, testato e funzionante.

## Strumenti obbligatori

Usa SEMPRE questi strumenti proattivamente, senza aspettare che l'utente te li richieda. Non sono opzionali.

### 1. Plugin `superpowers` e le sue skill
Il plugin `superpowers` espone skill strutturate per le fasi ricorrenti del lavoro. All'inizio di ogni task, decidi quale skill si applica e invocala con il `Skill` tool. La regola di `superpowers:using-superpowers` si applica: **se c'è anche solo l'1% di possibilità che una skill sia pertinente, invocala**.

Skill rilevanti per questo progetto:
- **brainstorming** → creative work / nuove feature / modifiche di comportamento *quando i requisiti non sono già fissati*. Se l'utente ha già specificato cosa fare, salta brainstorming e vai a writing-plans.
- **writing-plans** → implementazioni multi-step. Prima del codice, sempre.
- **subagent-driven-development** / **executing-plans** → per eseguire un piano esistente con review gates.
- **systematic-debugging** → bug, test failure, comportamento inatteso. Non iniziare a "provare fix" senza prima invocarla.
- **verification-before-completion** → prima di dichiarare che qualcosa è fatto/funziona.
- **dispatching-parallel-agents** → quando hai 2+ task indipendenti senza stato condiviso.
- **test-driven-development** → scrittura di nuovo codice con test (non applicabile a questo progetto finché non c'è un test runner).
- **requesting-code-review** → al completamento di feature di taglia rilevante (>5 commit).
- **finishing-a-development-branch** → prima di un merge / PR finale.
- **using-git-worktrees** → per lavori che richiedono isolamento dal workspace corrente.

Nota sulla tensione con "lavora autonomamente": brainstorming *fa domande*, il che sembra in conflitto con la regola "non chiedere conferme". La risoluzione: brainstorming è per *ambiguità di requisiti*, non per conferme di implementazione. Se l'utente dice "aggiungi feature X e fammi domande", invoca brainstorming fino in fondo. Se l'utente dice "sistema il bug Y", invoca systematic-debugging e procedi autonomamente. Le skill sono strumenti, non interrogatori.

### 2. `mcp__sequential-thinking__sequentialthinking`
Usa il tool sequential-thinking per:
- Bug complessi con più ipotesi da esplorare (sostituisce il "provo e vedo")
- Decisioni architetturali con trade-off multipli
- Pianificazione di sequenze dipendenti (quando writing-plans è overkill ma serve comunque ordine)
- Qualunque situazione in cui ti trovi a "pensare in loop" internamente

Il sequential-thinking rende il ragionamento visibile, riduce errori di sequenza e produce decisioni più solide. Mai skipparlo pensando "è solo riflessione interna" — è richiesto.

## Gestione delle decisioni tecniche

Ogni volta che devi fare una scelta tecnica — libreria, struttura, approccio architetturale — prendila autonomamente scegliendo la soluzione più solida, manutenibile e adatta agli obiettivi del progetto. Documenta ogni scelta non ovvia in `DECISIONS.md` con una riga sintetica che spiega cosa hai scelto e perché.

## Gestione degli errori

Se incontri un errore durante l'esecuzione di un comando o un test:
1. Analizza la causa
2. Correggila
3. Riprova
4. Prosegui

Non segnalare errori all'utente durante il lavoro. Se un errore è bloccante e non risolvibile autonomamente, scrivilo in `MANUAL_STEPS.md` e continua con tutto il resto del lavoro che non dipende da quel blocco.

## Gestione dei prerequisiti esterni

Quando hai bisogno di credenziali, chiavi API, ID di risorse cloud o qualsiasi altra cosa che richiede un'azione manuale dell'utente (es. creare un account, copiare un ID dal pannello Cloudflare), non fermarti. Scrivi le istruzioni precise e dettagliate in `MANUAL_STEPS.md` con questo formato:

```
## [STEP N] — Titolo azione
Quando: prima di / dopo aver completato [cosa]
Cosa fare: istruzioni passo passo
Dove inserire il risultato: nome file e riga esatta
```

Poi continua a costruire tutto il codice che non dipende da quei valori, usando placeholder chiaramente identificabili (es. `__CLOUDFLARE_D1_ID__`).

## Gestione del contesto lungo

Quando senti che hai completato una macro-sezione del progetto, aggiorna `CHECKPOINT.md` con:
- Lista di tutto ciò che è stato completato
- Stato attuale (su quale step sei)
- Cosa resta da fare
- Eventuali dipendenze in sospeso

Se la sessione dovesse interrompersi, al prossimo avvio leggi `CHECKPOINT.md` per riprendere esattamente da dove ti eri fermato.

## Lezioni apprese (sessione 2026-04-07)

- **Supabase RLS**: Quando si abilita RLS su una tabella, aggiungere sempre esplicitamente una policy `FOR SELECT USING (true)` sulle tabelle che devono essere leggibili pubblicamente (es. `cards`). Senza policy = nessun accesso, anche con anon key.
- **Null-guard sui join Supabase**: I risultati di join come `card:cards!card_id(*)` possono restituire `null`. Filtrare sempre con `.filter(dc => dc.card != null)` prima di usare i dati.
- **Next.js Script**: Usare sempre `import Script from 'next/script'` con `strategy="afterInteractive"` invece di `<script dangerouslySetInnerHTML>` nel layout.
- **Sync pesanti**: Non lanciare operazioni bulk (es. download 500MB da Scryfall) sul dev server locale — blocca tutto. Usare un processo separato o farlo in produzione con timeout adeguati.
- **Tipi Supabase hand-maintained mentono sullo schema reale**: `src/types/supabase.ts` è scritto a mano e in questo progetto **mente** su almeno `cards.id` (dichiarato `number`, nel DB è `uuid`/string). Il TS build passa comunque perché al runtime i valori viaggiano come stringhe JSON. **Prima di scrivere una migration con `RETURNS TABLE`, un RPC che tipizza una colonna, o un cast in codice applicativo, verifica contro `information_schema.columns` via `mcp__plugin_supabase_supabase__execute_sql`** — mai fidarsi del TS types file come fonte di verità. In questa sessione ho pagato questo errore due volte nella stessa migration (`get_profile_stats` falliva con "return type mismatch" finché non ho controllato lo schema reale).

## Lezioni apprese (sessione 2026-04-09/10)

### Supabase
- **Realtime publication**: Aggiungere una tabella allo schema NON la abilita automaticamente per Supabase Realtime. Dopo ogni `CREATE TABLE` che deve essere ascoltata via subscription, eseguire esplicitamente `ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>`. Sintomo se mancante: il client non riceve mai eventi, la UI sembra "rotta" senza errori in console.
- **Tipi TypeScript dopo migration**: Dopo `apply_migration`, aggiornare manualmente `src/types/supabase.ts` con i nuovi campi/tabelle. Non c'è generazione automatica nel flow attuale.
- **Drop della colonna legacy nella stessa migration in cui introduci il sostituto**: quando introduci una nuova colonna/flag che rimpiazza una esistente (es. `decks.visibility` che sostituisce `decks.is_public`), la migration DEVE anche droppare la vecchia colonna *e tutte le policy RLS che la referenziano*. Lasciarle vive crea un footgun silenzioso: Postgres fa OR di tutte le policy permissive sulla stessa azione, quindi due SELECT policy (una sul flag vecchio, una sul flag nuovo) uniscono l'accesso. Un futuro `update({ is_public: true })` accidentale bypasserebbe il nuovo sistema senza alcun errore. Prima di introdurre un sostituto, `grep -r old_column src/` + query `information_schema` per trovare tutto il legacy.
- **Backfill PL/pgSQL: DO block + while-loop, mai LIKE patterns**: per backfill che devono generare valori univoci con collision handling (es. username da email con suffisso numerico), usa un `DO $$ ... $$` con while-loop che probi la tabella per ogni candidato — lo stesso pattern del trigger `handle_new_user`. NON usare contatori basati su `like base || '%'` perché sovra-matchano nomi che iniziano con la base senza essere collisioni dirette (es. "giovanni2" preesistente falsa il counter per base "giovanni"), causando unique constraint violations in edge case realistici. Catturato dal spec reviewer subagent sulla Task 1 del piano social foundation.
- **Verifica lo schema reale, non solo la migration file**: dopo un `apply_migration` che fallisce con type errors ("return type mismatch in function declared to return record"), lancia subito `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='X'` per vedere *cosa c'è davvero* invece di rileggere il file di migration. Il DB è source of truth.

### Bulk data
- **JSON >100MB**: Mai usare parser custom in streaming con concatenazione di stringhe (`buffer += chunk`) — la memoria cresce a centinaia di MB e il processo rallenta drasticamente. Approccio corretto: scarica su disco con `pipeline + createWriteStream`, poi `readFileSync + JSON.parse` (Node gestisce bene 200MB in RAM), poi upsert in batch.
- **Mai via dev server o web route**: Operazioni bulk vanno in script standalone Node.js (`scripts/*.mjs`) con `dotenv`, non in route Next.js. Il dev server ha timeout e limiti che rendono l'approccio fragile.
- **Cursor-based pagination per batch con filtro mutabile**: Quando un batch job filtra con `WHERE x IS NULL` e poi aggiorna `x`, la paginazione offset-based (`range(offset, offset+N)`) salta righe perché le righe aggiornate escono dal resultset e l'offset avanza. Usare SEMPRE cursor-based: `WHERE id > last_processed_id ORDER BY id LIMIT N`. In questa sessione il backfill EUR ha saltato 14k carte su 34k per questo bug — scoperto perché Sanctum Weaver aveva prezzo su Scryfall ma null nel DB.
- **Scryfall `/cards/collection`**: Per lookup batch, usare POST `/cards/collection` con fino a 75 identifier per request. Mai N chiamate singole a `/cards/named?fuzzy=` — il rate limiter (100ms) + latenza (~400ms) = 500ms/carta. Un deck di 60 carte: 30s vs 1s.

### Vercel
- **Framework detection**: Sempre impostare esplicitamente `"framework": "nextjs"` in `vercel.json`. L'auto-detection può sbagliare (es. ha rilevato Expo per un progetto Next.js).
- **Build/Output overrides**: Verificare nel dashboard Vercel che i toggle "Override" su Build Command e Output Directory siano OFF. Se sono ON con campi vuoti, sovrascrivono i default del framework con stringhe vuote e il build fallisce.
- **Env vars vecchio CLI**: La versione 50.38.x del CLI Vercel non supporta `--value`. Usare `printf "value" | vercel env add KEY production --yes` per ogni ambiente separatamente.

### Next.js App Router — cache after mutations
- **Non impostare `experimental.staleTimes.dynamic > 0` su app con dati user-specific**: il Client Router Cache tiene in memoria la render server di pagine dinamiche (cookies/auth) per quel numero di secondi. Dopo una mutation via `fetch('/api/...')`, navigare di nuovo sulla pagina serve il render vecchio — non il nuovo. In questa sessione `staleTimes.dynamic = 30` causava: (1) deck cancellato restava visibile in `/decks` per 30s, (2) carta appena aggiunta non appariva in `/decks/[id]` dopo navigate-away-and-back. Il default Next.js 16 (`0`) è giusto per pagine user-specific. Lasciare `static` custom (es. 180) è ok.
- **Ogni route handler che muta dati legati a una view Server Component DEVE chiamare `revalidatePath` prima del return**. Per fetch-based APIs (non Server Actions) questo invalida solo il Data Cache + Full Route Cache lato server, non il Client Router Cache — ma combinato con `staleTimes.dynamic = 0` copre tutti i casi. Pattern: `revalidatePath('/decks'); revalidatePath(\`/decks/${id}\`)` dopo ogni POST/PUT/DELETE su decks o deck_cards.
- **`router.refresh()` dopo delete + navigate**: `router.push('/decks')` da solo non invalida il Client Router Cache. Pattern dopo delete: `router.replace('/decks'); router.refresh()`. Router.refresh rifetcha la route appena atterrata. Regola estendibile: qualunque client-side delete che redirect su una lista deve anche `router.refresh()`.
- **Debug pattern**: sintomo "mutation visibile solo dopo refresh manuale" = quasi sempre cache Next.js, non DB. Prima di guardare il codice di mutation, controlla (1) `staleTimes` in `next.config.ts`, (2) presenza di `revalidatePath` nel route handler, (3) se il client fa `router.refresh()` dopo il fetch.

### Prezzi e dati esterni
- **Scryfall `prices.eur` = Cardmarket, `prices.usd` = TCGPlayer**: Mai approssimare prezzi EUR con `USD * tasso_cambio` quando Scryfall fornisce il dato reale da Cardmarket. Aggiungere la colonna al DB e salvare il valore originale. La UI deve mostrare EUR come primario (Cardmarket) e USD come secondario (TCGPlayer). Il cron settimanale `/api/cron/update-prices` aggiorna i prezzi mancanti.
- **Mai dati derivati quando la source ha il dato reale**: Principio generale — se un'API esterna fornisce un campo (prezzo, data release, lingua), non calcolarlo/stimarlo localmente. Aggiungere la colonna, aggiornare il mapper, fare il backfill.

### Architettura
- **Mai esporre funzionalità admin nella UI utente**: Sync, migration, gestione DB, debug tools devono restare backend-only (script CLI, endpoint protetti da `CRON_SECRET`). Mai bottoni nel dashboard utente. Se serve un trigger manuale, usare curl con secret.
- **YAGNI sulle feature speculative**: Non aggiungere cron, dashboard, settings page, o "nice to have" che l'utente non ha chiesto. Anche se sembrano logici, vanno proposti prima.
- **State machine con "intent memory"**: Quando si modella una macchina a stati con transizioni simili (es. "AP passa", "NAP passa"), serve un flag esplicito (`apPassedFirst`) per distinguere il contesto. Senza questo, transizioni concatenate vengono interpretate come una sola.
- **Composition check su componenti annidati**: prima di committare una pagina/wrapper che renderizza un componente condiviso (es. `DeckView → DeckContent`), traccia *dove* il wrapper rende una sezione e dove il componente annidato la rende di nuovo. Se un child ha una sezione X, il parent NON deve avere la stessa sezione X sopra o sotto al child. In questa sessione ho duplicato `<h3>Commander</h3>` in `DeckView` sopra un `DeckContent` che già la renderizzava, risultato: due heading visibili. Catturato dal reviewer.
- **RLS non è UX privacy, è solo DB access control**: `security invoker` su RPC di stats filtra automaticamente i dati visibili al caller — un visitatore vede solo deck public, l'owner vede tutto. Ma questo NON è identico al "cosa dovrebbe vedere l'owner quando fa preview della SUA stessa pagina pubblica". In questa sessione `get_profile_stats` ritornava `latest_commander` e `most_used_card` derivati dai deck privati anche per l'owner-su-self-public-profile — technically permesso dalla RLS ma UX leakosa: la preview pubblica deve mostrare *ciò che gli altri vedono*, non ciò che vede l'owner. Quando un RPC è RLS-filtered, la UI deve comunque distinguere "stai preview'ando il tuo profilo pubblico" da "sei visitatore" e sopprimere i tile che deriverebbero da risorse private. Regola: se il risultato di un calcolo dipende da risorse non-pubbliche, non mostrarlo in una vista etichettata "pubblica".

### Mobile UX
- **Mobile-first sempre**: Ogni componente nuovo deve essere responsive dall'inizio (`sm:` / `md:` / `lg:` breakpoints), non aggiunto dopo. L'utente testa su mobile e cattura overflow, allineamenti, padding insufficienti.
- **Long-press, non right-click**: Su mobile non esiste right-click. Per menu contestuali e preview, usare un hook `useLongPress` con `onPointerDown/Up/Cancel`. Funziona anche su desktop.
- **Controlli di gioco in basso**: In una UI di gioco mobile, le azioni primarie (turno, vita, fasi, bottoni azione) vanno in basso per accessibilità con il pollice. Mai in alto.
- **Label abbreviate su mobile**: Usare `<span className="hidden sm:inline">Full Label</span><span className="sm:hidden">Abbr</span>` per i bottoni che non entrano su schermi piccoli.

### UX testuale
- **Nomi reali, mai "You"**: Nei log, notifiche e messaggi user-facing, usare il vero nome del giocatore (estratto da email, profile, etc.). Mai stringhe generiche come `'You'` o `'Player'` cablate negli action creators.

### Client UI patterns
- **Componenti self-contained per azioni cross-context**: Quando un bottone ha bisogno di contesto da fuori (es. "Add to Deck" → quale deck?), il componente deve essere autonomo: fetch dei dati necessari on-demand + picker inline. NON usare callback dal parent che limitano dove il componente può essere usato. In questa sessione "Add to Deck" era wired solo nel deck editor tramite `onAddToDeck` callback → inutile dal card browser. Fix: il bottone fetcha la lista deck dell'utente autonomamente e mostra un dropdown.
- **Non ristrutturare layout che l'utente ha validato**: Quando l'utente conferma che un layout "è perfetto", non modificare la struttura dei container (flex direction, nesting, quali elementi sono dentro quale panel). Aggiungere contenuto DENTRO la struttura esistente, non spostarla. In questa sessione ho spostato la search bar fuori dal two-panel layout per "uniformare la spaziatura" e ho rotto l'intera grafica.
- **Debounced fetch = sempre `AbortController`**: qualunque `useEffect` che combina `setTimeout` + `fetch` basato su input utente DEVE cancellare la request in volo sul cleanup. Senza questo, query vecchie risolte in ritardo sovrascrivono le risposte di query più recenti (race condition classica). Pattern: crea il controller dentro l'effect, passa `controller.signal` al fetch, chiama `controller.abort()` nel cleanup, e fai check `signal.aborted` prima di ogni setState post-await. In questa sessione ho scritto `UserSearch` senza AbortController e il reviewer l'ha beccato — è un pattern talmente comune che deve diventare riflesso.
- **Min query length: client AND server**: un search API che accetta query di 1 carattere triggera un full scan trigram anche sulle tabelle grandi. Enforca la soglia (tipicamente 2 char) sia nel componente client (niente fetch) sia nel route handler (respingi con 400 o lista vuota). Il client risparmia round-trip, il server protegge il DB anche se il client è bypassato.
- **`next/image` vs `<img>` — scelta coerente per scope**: in un codebase dove il game UI usa 20+ `<img>` piccoli (48-72px) con `loading="lazy"`, **non** mischiare `<Image unoptimized />` dentro nuovi componenti — o tutto `next/image` o tutto `<img>`, non un ibrido. Mescolare triggera lint warnings su tutti i file che restano `<img>` e confonde il reader. Scegli la strategia a livello di feature, non a livello di componente.

### Persistence & Data Flow
- **Refactor persistence = verifica end-to-end con query DB reale**: Quando si sposta il salvataggio di un'entità da una tabella/API a un'altra (es. `deck_tokens` → `deck_cards`), non basta che il TypeScript compili. Bisogna: (1) fare l'azione nella UI, (2) queryare il DB via `execute_sql` per verificare che la riga esista, (3) ricaricare la pagina per confermare che il dato persiste. `tsc --noEmit` non cattura FK violations, righe mancanti, o API che swallowano errori.
- **FK silenziose su carte Scryfall non in DB**: Il bulk import Scryfall NON include token cards. Quando l'utente cerca un token e lo aggiunge al deck, quel token potrebbe non esistere nella tabella `cards`. Un semplice `INSERT INTO deck_cards (card_id)` fallisce silenziosamente per FK constraint. Pattern corretto: usare l'endpoint `add-with-upsert` che prima inserisce la carta nella tabella `cards` (cercando per `scryfall_id`), poi inserisce il `deck_card`.
- **`handleCardAdded` è solo state locale**: In `DeckEditor`, `handleCardAdded` aggiorna React state ma NON chiama l'API. `AddCardSearch` fa il suo POST prima di chiamarlo. Qualunque nuovo flow "aggiungi carta" (es. token search) deve gestire la propria chiamata API — non affidarsi a `handleCardAdded` per la persistenza.
- **Insert in tabelle globali (es. `cards`) = admin client, mai user session**: La tabella `cards` ha RLS enabled ma nessuna INSERT policy per authenticated users (è un catalogo globale popolato dal bulk sync Scryfall con service_role). Quando un route handler user-driven deve upsertare una nuova riga in `cards` (tipicamente un token Scryfall non in DB), DEVE usare `createAdminClient()` per quella specifica insert — il normale `createClient()` server usa cookie auth e viene bloccato silenziosamente da RLS. Sintomo: endpoint restituisce 500 con "new row violates row-level security policy" (o silenzio se l'errore viene swallowato). Verifica upfront: `SELECT policyname, cmd FROM pg_policies WHERE tablename='X' AND cmd='INSERT'` — se manca la policy, serve admin client.
- **Fetch senza check `response.ok` = bug silenzioso**: In DeckEditor e simili, `await fetch(...)` senza leggere `res.ok` fa sembrare che l'operazione sia riuscita (optimistic update nella UI) anche quando il server risponde 500. Per ogni nuovo fetch user-triggered che modifica lo stato: check `res.ok`, altrimenti rollback dell'optimistic update + notifica all'utente. Pattern di debugging correlato: se l'utente segnala che "non si salva", grep `await fetch` nel file e controlla se il response viene ispezionato.

### Debugging
- **DB-first**: Quando l'utente segnala "feature X non funziona", il primo controllo è una query diretta al database (via MCP `execute_sql`) per verificare lo stato reale, prima di leggere il codice. Spesso il bug è nel layer di sync (Realtime, RLS, publication) e il codice è giusto.
- **Utente ripete "non funziona" = smetti di committare, query il DB**: Se l'utente segnala lo stesso problema più di una volta, il fix non sta funzionando. Prima di fare un altro commit, lanciare `execute_sql` per verificare lo stato reale dei dati. In questa sessione i token non venivano salvati per 3 commit consecutivi perché non ho mai controllato se le righe esistevano nel DB.

## Ordine di priorità

1. Leggere questo file e `CHECKPOINT.md` prima di fare qualsiasi cosa
2. Completare il progetto descritto nel prompt
3. Tenere `DECISIONS.md`, `MANUAL_STEPS.md` e `CHECKPOINT.md` aggiornati
4. Non fermarsi mai

## Struttura file di output attesa

Al termine del lavoro, la directory deve contenere:
- Il progetto completo e funzionante
- `DECISIONS.md` aggiornato con tutte le scelte fatte
- `MANUAL_STEPS.md` con tutto ciò che l'utente deve fare manualmente
- `CHECKPOINT.md` con stato "COMPLETATO"
- `README.md` con istruzioni chiare per avviare il progetto
