# Premortem - The Gathering / Adunata

**Data revisione:** 2026-05-12  
**Branch osservato:** `dev`  
**Repo:** `/Users/giovannidiplacido/MBPro/CursorProject/TheGathering`

Questo documento e una revisione premortem corroborata contro il sorgente locale. Non e una security audit completa su database live: quando un claim dipende dal DB live lo segnalo esplicitamente. Le evidenze principali vengono da sorgente, migrazioni, tipi Supabase, documenti di stato e comandi di verifica.

## Verifica Eseguita

Comandi eseguiti il 2026-05-12:

| Comando | Esito |
|---|---|
| `npm run build` | Passa. Next segnala la deprecazione `middleware` -> `proxy`. |
| `npm run lint` | Fallisce: 1 errore, 53 warning. Errore in `GoblinAIHistoryDropdown.tsx:42`. |
| `npm run test:game` | Passa: 3 file, 24 test. |
| `npm run test:goblinai` | Passa: 4 file, 19 test. |
| `npm run test:proxy-pdf` | Passa: 14 test. |

Corroborazione statica:

- `cards.id` nasce `uuid` in `supabase/migrations/20240101000000_initial_schema.sql`, ma `src/types/supabase.ts` lo tipizza `number`.
- `src/app/(app)/profile/page.tsx` chiama `DELETE /api/account`, ma non esiste una route `src/app/api/account`.
- `src/app/api/comments/[id]/route.ts` cancella commenti filtrando solo per `id`.
- Le funzioni batch `SECURITY DEFINER` aggiornano righe per ID senza ownership check interno.
- `vercel.json` schedula solo `daily-sync`; `update-prices` resta nel codice come fallback manuale, come spiegato in `DECISIONS.md`.
- I test browser Playwright presenti sono tutti `test.skip()`.

## Tesi

Se Adunata fallisce, probabilmente non sara per assenza di feature. Fallira per una combinazione di:

1. schema e tipi divergenti;
2. route mutative non abbastanza difese;
3. feature real-time complesse non coperte da test end-to-end;
4. operativita fragile su cron, dati Scryfall, Supabase e provider AI;
5. grandi componenti client difficili da modificare senza regressioni.

Il prodotto e gia ampio: deck builder, collection, proxy PDF, goldfish, multiplayer 1v1, profili, social light, GoblinAI. La superficie di rischio e ormai piu grande della rete di test.

## Rischi P0

### 1. Delete commenti senza ownership nel route handler

**Impatto:** potenziale cancellazione di commenti altrui.  
**Evidenza:** `src/app/api/comments/[id]/route.ts:72-75`.

```ts
await supabase
  .from('deck_comments')
  .delete()
  .eq('id', commentId)
```

Il `PATCH` nella stessa route usa `.eq('user_id', user.id)`, quindi l'omissione nel `DELETE` e probabilmente accidentale. Nelle migrazioni locali non ho trovato la creazione o le policy RLS di `deck_comments`; i tipi la conoscono, ma il set di migration non e autosufficiente per verificarne la protezione.

**Fix raccomandato:** aggiungere `.eq('user_id', user.id)` nel delete e aggiungere un test route-level. Verificare sul DB live che `deck_comments` abbia RLS abilitato e policy coerenti.

### 2. Tipi Supabase divergenti dal DB

**Impatto:** bug silenziosi su FK, confronti, RPC e action data.  
**Evidenza:** `cards.id` e `uuid` nella migration iniziale; `src/types/supabase.ts` dice `id: number`.

Il problema non e isolato al file tipi. Nel codice sono gia presenti cast correttivi:

- `src/components/cards/CardBrowser.tsx`: commento "cards.id is uuid at runtime; the TS types claim number".
- `src/app/api/collection/route.ts`: commento analogo.
- `src/lib/game/engine.ts`: action data con `cardId: number` in piu handler, mentre a runtime gli ID carta sono UUID.

**Fix raccomandato:** rigenerare i tipi dal DB live (`supabase gen types`), committarli, poi eliminare cast e tipi inline sbagliati. Questa correzione va fatta prima di refactor grossi del game engine o collection.

### 3. Route account deletion mancante

**Impatto:** UI promette una cancellazione account che non puo funzionare.  
**Evidenza:** `src/app/(app)/profile/page.tsx:182` chiama `/api/account`; `rg --files src/app/api` non mostra nessuna route account.

**Fix raccomandato:** implementare `DELETE /api/account` con service role e cancellazione utente Supabase, oppure rimuovere/disabilitare il bottone finche non esiste. La pagina privacy dice che la cancellazione e richiedibile via email, quindi va allineata anche la UX.

### 4. Lint non verde su codice spedibile

**Impatto:** CI debole e regressioni React/Next non bloccate.  
**Evidenza:** `npm run lint` fallisce con errore `react-hooks/set-state-in-effect` in `src/components/goblinai/GoblinAIHistoryDropdown.tsx:42`.

Build e test passano, ma il lint fallito dovrebbe bloccare merge/deploy. I warning sono anche informativi: molti `<img>` su superfici card-heavy, warning hook in `PlayGame`, unused vars e test Playwright skip.

**Fix raccomandato:** sistemare l'errore lint subito, poi decidere quali warning sono accettati esplicitamente e quali diventano budget tecnico.

## Rischi Alti

### 5. Migrazioni non autosufficienti rispetto ai tipi e al codice

**Impatto:** fresh install, preview DB o recovery da zero possono fallire.  
**Evidenza:** i tipi includono `deck_comments`, `deck_likes`, `card_likes`, `game_log`, `sync_metadata`; nelle migrazioni locali ho trovato indici/alter/RPC che le usano, ma non `create table public.<table>` per quelle tabelle.

Esempi:

- `supabase/migrations/20260508050000_performance_indexes.sql` crea indici su `deck_comments`, `deck_likes`, `card_likes`, `game_log`.
- `supabase/migrations/20260415100000_game_log_type.sql` altera `game_log`.
- nessuna migration locale crea quelle tabelle.

**Fix raccomandato:** fare diff live -> migration, oppure documentare esplicitamente quali tabelle sono state create fuori migration e ricostruirle. Questo e prerequisito per affidabilita operativa.

### 6. RPC `SECURITY DEFINER` senza ownership check interno

**Impatto:** un bug applicativo puo trasformarsi in scrittura cross-user.  
**Evidenza:** `supabase/migrations/20260508060000_batch_update_rpcs.sql`.

Funzioni interessate:

- `batch_update_deck_card_sections`
- `batch_update_user_cards_quantity`
- `batch_update_deck_card_quantities`

Tutte aggiornano per `id` ricevuti da JSON e girano come `SECURITY DEFINER`. Il codice route spesso filtra prima, ma il confine di sicurezza non dovrebbe dipendere solo dal caller.

**Fix raccomandato:** aggiungere parametri `p_user_id` / `p_deck_id` e join/check interni contro owner. In alternativa spostare le funzioni in schema non esposto e restringere grant.

### 7. Route pubbliche usano service role per scrivere `cards`

**Impatto:** abuso di Scryfall fallback, pressione su DB e bypass RLS intenzionale ma ampio.  
**Evidenza:** `createAdminClient()` in:

- `src/app/api/cards/search/route.ts`
- `src/app/api/cards/lookup/route.ts`
- `src/app/api/cards/printings/route.ts`

`cards/search` ha rate limiting. `lookup` e `printings` no. Il pattern e comprensibile per cache locale Scryfall, ma la combinazione "pubblico + service role + upsert" deve avere limiti duri.

**Fix raccomandato:** rate limit su tutte le route Scryfall-backed, cap per richiesta, timeout, logging strutturato e risposta degradabile. Valutare una RPC stretta invece del service role diretto nelle route pubbliche.

### 8. Rate limiting fragile e copertura incompleta

**Impatto:** abuso di endpoint mutativi o costosi.  
**Evidenza:** `src/lib/rate-limit.ts` disabilita tutto se mancano `KV_REST_API_URL` / `KV_REST_API_TOKEN`; in produzione stampa solo warning.

Endpoint mutativi importanti senza rate limiting evidente:

- `POST /api/lobbies`
- `POST /api/lobbies/join`
- `POST /api/lobbies/invite`
- `POST /api/game/[id]/action`
- `POST/PUT/DELETE /api/decks/[id]/cards`
- `POST /api/collection/bulk-add`
- `POST /api/collection/bulk-import`
- likes/commenti

**Fix raccomandato:** rate limiting fail-closed almeno in produzione per endpoint AI/Scryfall/bulk; aggiungere limiti mutativi per user ID.

### 9. Game state real-time difficile da rendere corretto

**Impatto:** partite inconsistenti, azioni perse, log fuori ordine.  
**Evidenza:** `src/components/play/PlayGame.tsx` e circa 2k linee; `src/app/api/game/[id]/action/route.ts` gestisce OCC solo per il percorso normale.

Note corroborate:

- La route usa `process_game_action` con `p_expected_seq` per le azioni normali.
- Le azioni log-only (`library_view`, `peak`, `chat_message`) chiamano la RPC senza `p_expected_seq`.
- `concede` segue un percorso separato dalla RPC OCC.
- `DELETE /api/lobbies/[id]` contiene un secondo percorso di concessione/chiusura partita.

**Fix raccomandato:** unificare tutte le mutazioni di partita dietro una sola transazione/RPC con OCC, incluse chat/log-only/concede. Aggiungere test route-level sulle collisioni.

### 10. Copertura e2e praticamente assente

**Impatto:** regressioni UI e auth non rilevate prima del deploy.  
**Evidenza:** `tests/goblinai/goblinai-ui.spec.ts` contiene solo `test.skip()`.

I test unitari esistenti sono utili e passano, ma coprono un sottoinsieme:

- game: priority/log display helpers, non flussi partita completi;
- GoblinAI: router/keyword/mention, non UI reale;
- proxy PDF: layout/raster.

**Fix raccomandato:** aggiungere una smoke suite Playwright minima: login mock o sessione test, search card, add-to-deck, import decklist, collection import, create/join lobby, one game action.

## Rischi Medi

### 11. GoblinAI: single provider, no timeout esplicito, no streaming

**Impatto:** UX bloccante e disponibilita legata a DeepSeek.  
**Evidenza:** `src/lib/goblinai/deepseek.ts` fa `fetch` diretto a `https://api.deepseek.com/chat/completions`, poi `await res.json()`.

Punti buoni:

- `DEEPSEEK_API_KEY` e server-side.
- Se manca la chiave, torna 503 via `GoblinAINotConfiguredError`.
- I token vengono persistiti.

Rischi:

- nessun `AbortSignal` / timeout applicativo;
- nessuno streaming;
- nessun provider fallback;
- prompt costruiti con interpolazione diretta di input utente e contesto.

**Fix raccomandato:** aggiungere timeout, delimitatori input, fallback provider o AI Gateway, e streaming solo dopo aver stabilizzato le route.

### 12. Prompt injection: rischio comportamentale, non data leak immediato

**Impatto:** risposte fuori policy, step di restatement bypassato, allucinazioni di regole.  
**Evidenza:** `src/lib/goblinai/prompts.ts` interpola direttamente `context.message`, `confirmedRestatement` e `userCorrection`.

Questo non e un confine di sicurezza classico, ma su un rules assistant puo danneggiare fiducia prodotto.

**Fix raccomandato:** delimitatori espliciti, istruzione anti-injection dopo il blocco utente, output validator leggero per citazioni/regole.

### 13. Conversazioni GoblinAI protette da RLS ma senza filtro difensivo

**Impatto:** difesa in profondita insufficiente.  
**Evidenza:** `GET /api/assistant/conversations` seleziona senza `.eq('user_id', user.id)`; `DELETE /api/assistant/conversations/[id]` controlla solo `id`.

La migration `20260508090000_goblinai_rules_assistant.sql` crea policy `goblinai_conversations_owner_all` e `goblinai_messages_owner_all`, quindi con RLS attivo non risulta exploitable dal client normale.

**Fix raccomandato:** aggiungere comunque `.eq('user_id', user.id)` in tutte le route conversazioni.

### 14. `daily-sync` carica il bulk Scryfall in memoria

**Impatto:** OOM futuro o timeout se il payload cresce o il piano hosting cambia.  
**Evidenza:** `src/app/api/cron/daily-sync/route.ts` usa `await dlRes.text()` e `JSON.parse(text)`.

`DECISIONS.md` segnala gia il tradeoff: su memoria alta funziona, su piani piu stretti diventa rischioso. `sync-cards` contiene gia un approccio streaming.

**Fix raccomandato:** portare `daily-sync` allo streaming parser o consolidare i due endpoint.

### 15. Cron e runbook non sono abbastanza espliciti

**Impatto:** dati carte/prezzi stale senza segnale chiaro.  
**Evidenza:** `vercel.json` schedula solo `/api/cron/daily-sync`; `/api/cron/update-prices` resta come fallback manuale. `DECISIONS.md` lo spiega, ma `IMPLEMENTATIONS.md` dice genericamente "daily-sync, update-prices attivi".

**Fix raccomandato:** aggiornare docs operative: quale cron e schedulato, quale e fallback, come verificare freshness, cosa fare se Scryfall o Supabase falliscono.

### 16. Errori DB/API spesso esposti o silenziati male

**Impatto:** UX opaca e dettagli interni al client.  
**Evidenza:** molte route tornano `error.message` direttamente; molte azioni client fanno `console.error` o rollback minimo senza toast globale.

**Fix raccomandato:** normalizzare error responses pubbliche, loggare dettagli server-side con correlation ID, introdurre toast/error banner per mutation failure.

### 17. Next 16: convenzione `middleware` deprecata

**Impatto:** non rompe oggi, ma e debito di upgrade.  
**Evidenza:** `npm run build` mostra warning: "The middleware file convention is deprecated. Please use proxy instead."

**Fix raccomandato:** leggere la guida Next locale in `node_modules/next/dist/docs/` prima di modificare, poi migrare `src/middleware.ts` al nuovo pattern `proxy`.

## Rischi Di Manutenibilita

### 18. `PlayGame.tsx` e troppo grande

**Impatto:** ogni modifica gameplay rischia regressioni.  
**Evidenza:** `wc -l` mostra `src/components/play/PlayGame.tsx` a 2044 linee.

Non va diviso per estetica: va diviso lungo confini comportamentali reali.

Ordine consigliato:

1. estrarre data loading/realtime;
2. estrarre dispatch/sendAction e rollback;
3. estrarre zone actions;
4. estrarre goldfish/bot loop;
5. aggiungere test prima dei refactor successivi.

### 19. Game engine: no-op silenziosi e contatori denormalizzati

**Impatto:** stato incoerente difficile da diagnosticare.  
**Evidenza:** `applyAction` ritorna `s` nel `default`; `handCount` e `libraryCount` sono mantenuti manualmente.

**Fix raccomandato:** azioni sconosciute dovrebbero lanciare `ActionRejectedError`. Aggiungere invariant test che confrontano contatori e array dopo ogni handler.

### 20. Bot loop: limite presente, ma guardia semantica incompleta

**Rettifica rispetto alla bozza precedente:** il loop ha gia un limite a 100 iterazioni in `src/lib/game/bot.ts:30-31`; non va descritto come loop infinito non protetto.

Resta un rischio: durante il turno del bot, il codice auto-passa per l'umano senza controllare `config.type === 'ghost'` nel blocco `activePlayerId === botId && priorityPlayerId !== botId`.

**Fix raccomandato:** restringere quell'auto-pass al ghost o introdurre una policy esplicita per bot non-ghost.

### 21. `apply-preset` ignora davvero il preset ricevuto

**Impatto:** basso oggi, perche esiste solo `commander`; alto se si aggiungono preset.  
**Evidenza:** `src/app/api/decks/[id]/sections/apply-preset/route.ts:12`.

```ts
const key: PresetKey = body.preset === 'commander' ? 'commander' : 'commander'
```

**Fix raccomandato:** validare `body.preset` contro `PRESETS`, tornare 400 per chiavi sconosciute.

### 22. Duplicazione shuffle e tipi action data deboli

**Impatto:** bug minori ma ripetuti.  
**Evidenza:** Fisher-Yates ripetuto in piu handler; action data castata inline in molti punti.

**Fix raccomandato:** helper `shuffleInPlace`, schema/type guard per `GameAction.data` per action critica.

## Rischi UX Mobile

Questi sono meno facili da "provare" staticamente, ma coerenti con la struttura UI e i warning:

- molte superfici card-heavy usano `<img>` invece di `next/image`;
- diverse griglie e action bar sembrano dense per schermi sotto 360px;
- il modello long-press/right-click e potente ma costoso cognitivamente;
- assenza di error UI globale rende le failure mobile particolarmente confuse.

**Fix raccomandato:** test manuale su viewport 360x740 e 390x844, poi Playwright screenshot smoke per card browser, deck editor, game board, GoblinAI.

## Priorita Operativa

| # | Azione | Impatto | Sforzo |
|---|---|---:|---:|
| 1 | Fix delete commenti con ownership + test | Sicurezza dati | Basso |
| 2 | Rigenerare tipi Supabase e correggere `cards.id` | Integrita dati | Medio |
| 3 | Implementare/rimuovere `/api/account` | UX/account trust | Basso |
| 4 | Rendere `npm run lint` verde | Qualita release | Basso |
| 5 | Ricostruire migration mancanti da DB live | Recovery/fresh install | Medio |
| 6 | Hardening RPC `SECURITY DEFINER` | Sicurezza DB | Medio |
| 7 | Rate limit su route mutative/Scryfall-backed | Abuse/DoS | Medio |
| 8 | E2E smoke Playwright minima | Regressioni | Medio |
| 9 | Unificare mutazioni game con OCC | Correttezza multiplayer | Alto |
| 10 | Timeout/fallback/delimitatori per GoblinAI | Affidabilita AI | Medio |
| 11 | Streaming/cron memory cleanup | Operativita | Medio |
| 12 | Refactor guidato da test di `PlayGame` | Manutenibilita | Alto |

## Decisione Finale

Prima di aggiungere nuove feature, fare una fase di hardening breve e misurabile:

1. chiudere i buchi P0;
2. rendere CI verde;
3. riallineare schema/tipi/migration;
4. aggiungere 5-7 smoke e2e;
5. mettere health/freshness su sync carte e AI.

Dopo questi interventi, il progetto diventa molto piu adatto a iterare. Senza questi, ogni nuova feature aumenta il costo di diagnosi dei bug esistenti.
