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
