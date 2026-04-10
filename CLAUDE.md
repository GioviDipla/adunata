# Istruzioni operative — The Gathering

## Comportamento richiesto

Lavora in modo completamente autonomo, senza mai fermarti per chiedere conferme, approvazioni o chiarimenti. Non fare domande. Non aspettare input dall'utente. Non chiedere "sei sicuro?", "posso procedere?", "vuoi che continui?". Mai.

L'unico momento in cui puoi fermarti è quando l'intero progetto è completato, testato e funzionante.

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
- **Tipi generati da agent multipli**: Quando più agent generano codice interdipendente (schema SQL ↔ TypeScript types), verificare la coerenza dei tipi (es. uuid → string, non number) con un build check dopo l'integrazione.

## Lezioni apprese (sessione 2026-04-09/10)

### Supabase
- **Realtime publication**: Aggiungere una tabella allo schema NON la abilita automaticamente per Supabase Realtime. Dopo ogni `CREATE TABLE` che deve essere ascoltata via subscription, eseguire esplicitamente `ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>`. Sintomo se mancante: il client non riceve mai eventi, la UI sembra "rotta" senza errori in console.
- **Tipi TypeScript dopo migration**: Dopo `apply_migration`, aggiornare manualmente `src/types/supabase.ts` con i nuovi campi/tabelle. Non c'è generazione automatica nel flow attuale.

### Bulk data
- **JSON >100MB**: Mai usare parser custom in streaming con concatenazione di stringhe (`buffer += chunk`) — la memoria cresce a centinaia di MB e il processo rallenta drasticamente. Approccio corretto: scarica su disco con `pipeline + createWriteStream`, poi `readFileSync + JSON.parse` (Node gestisce bene 200MB in RAM), poi upsert in batch.
- **Mai via dev server o web route**: Operazioni bulk vanno in script standalone Node.js (`scripts/*.mjs`) con `dotenv`, non in route Next.js. Il dev server ha timeout e limiti che rendono l'approccio fragile.

### Vercel
- **Framework detection**: Sempre impostare esplicitamente `"framework": "nextjs"` in `vercel.json`. L'auto-detection può sbagliare (es. ha rilevato Expo per un progetto Next.js).
- **Build/Output overrides**: Verificare nel dashboard Vercel che i toggle "Override" su Build Command e Output Directory siano OFF. Se sono ON con campi vuoti, sovrascrivono i default del framework con stringhe vuote e il build fallisce.
- **Env vars vecchio CLI**: La versione 50.38.x del CLI Vercel non supporta `--value`. Usare `printf "value" | vercel env add KEY production --yes` per ogni ambiente separatamente.

### Architettura
- **Mai esporre funzionalità admin nella UI utente**: Sync, migration, gestione DB, debug tools devono restare backend-only (script CLI, endpoint protetti da `CRON_SECRET`). Mai bottoni nel dashboard utente. Se serve un trigger manuale, usare curl con secret.
- **YAGNI sulle feature speculative**: Non aggiungere cron, dashboard, settings page, o "nice to have" che l'utente non ha chiesto. Anche se sembrano logici, vanno proposti prima.
- **State machine con "intent memory"**: Quando si modella una macchina a stati con transizioni simili (es. "AP passa", "NAP passa"), serve un flag esplicito (`apPassedFirst`) per distinguere il contesto. Senza questo, transizioni concatenate vengono interpretate come una sola.

### Mobile UX
- **Mobile-first sempre**: Ogni componente nuovo deve essere responsive dall'inizio (`sm:` / `md:` / `lg:` breakpoints), non aggiunto dopo. L'utente testa su mobile e cattura overflow, allineamenti, padding insufficienti.
- **Long-press, non right-click**: Su mobile non esiste right-click. Per menu contestuali e preview, usare un hook `useLongPress` con `onPointerDown/Up/Cancel`. Funziona anche su desktop.
- **Controlli di gioco in basso**: In una UI di gioco mobile, le azioni primarie (turno, vita, fasi, bottoni azione) vanno in basso per accessibilità con il pollice. Mai in alto.
- **Label abbreviate su mobile**: Usare `<span className="hidden sm:inline">Full Label</span><span className="sm:hidden">Abbr</span>` per i bottoni che non entrano su schermi piccoli.

### UX testuale
- **Nomi reali, mai "You"**: Nei log, notifiche e messaggi user-facing, usare il vero nome del giocatore (estratto da email, profile, etc.). Mai stringhe generiche come `'You'` o `'Player'` cablate negli action creators.

### Debugging
- **DB-first**: Quando l'utente segnala "feature X non funziona", il primo controllo è una query diretta al database (via MCP `execute_sql`) per verificare lo stato reale, prima di leggere il codice. Spesso il bug è nel layer di sync (Realtime, RLS, publication) e il codice è giusto.

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
