# Passi Manuali — Adunata

Questo file raccoglie le azioni che richiedono intervento manuale (setup di servizi esterni, chiavi, provider OAuth). Gli step completati restano qui solo come referenza — non rifarli.

Metti ✅ accanto al titolo quando un passo è completato.

---

## ✅ [STEP 1] — Progetto Supabase
Progetto: `wyujskkzqeexvmrwudup`.

## ✅ [STEP 2] — Migration iniziali del database
Applicate via Supabase MCP plugin.

## ✅ [STEP 3] — Supabase Storage
Bucket `card-images` con accesso pubblico (non più usato attivamente — immagini servite direttamente da Scryfall).

## ✅ [STEP 4] — Repository GitHub
`https://github.com/GioviDipla/adunata`

## ✅ [STEP 5] — Deploy su Vercel
Progetto Vercel collegato al branch `main`. Deploy automatico a ogni push.

Environment variables configurate su Vercel (production + preview):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## ✅ [STEP 6] — Icone PWA
Generate le icone 192/512 e maskable-512 in `public/icons/`.

## ✅ [STEP 7] — Supabase Auth
Email provider abilitato. Site URL configurato su dominio Vercel.

## ✅ [STEP 8] — Bulk sync carte Scryfall
Eseguito una prima volta manualmente. Il cron mensile (`/api/cron/sync-cards`) lo ripete in automatico.

Per forzare un re-sync manuale:
```bash
curl -X POST "https://adunata.vercel.app/api/sync-cards?force=true" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## ✅ [STEP 9] — Google OAuth
Client ID + Secret configurati nel pannello Supabase → Authentication → Providers → Google. Redirect URI: `https://wyujskkzqeexvmrwudup.supabase.co/auth/v1/callback`.

## ✅ [STEP 12] — Upstash Redis (rate limiting pre-lancio community)
Integrazione installata via Vercel Dashboard → Storage → Marketplace → **Upstash for Redis** (piano Free, region Frankfurt / eu-west).

Env vars iniettate automaticamente in tutti gli ambienti del progetto (prefisso legacy `KV_*`):
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`
- `KV_URL`

Helper in `src/lib/rate-limit.ts` fa no-op se le env vars mancano (dev senza Redis continua a funzionare). Endpoint protetti:
- `/api/cards/search` → 20 req / 10 s, keyed by IP
- `/api/users/search` → 20 req / 10 s, keyed by user id
- `/api/decks/:id/cards/bulk-import` → 5 req / 60 s, keyed by user id

---

## Step ancora aperti

### [STEP_PERF_DECKS] — Applicare migration `decks_card_count_denorm`
Quando: **prima del prossimo deploy Vercel** — il codice della pagina `/decks` legge già la colonna `card_count` direttamente; se la colonna non esiste nel DB, la pagina va in errore 500.

Cosa fare: applicare il contenuto di `supabase/migrations/20260416240000_decks_card_count_denorm.sql` al DB (Supabase Dashboard → SQL Editor → incolla tutto → Run).

Che cosa fa la migration:
1. Aggiunge `decks.card_count integer NOT NULL DEFAULT 0`.
2. Backfilla tutti i deck esistenti con `SUM(quantity)` sui board `main` + `commander`.
3. Crea il trigger `sync_deck_card_count_trg` su `deck_cards` (INSERT/UPDATE/DELETE) che mantiene `card_count` in sync ad ogni modifica.

Effetto: la pagina `/decks` fa una `SELECT id, name, format, card_count, updated_at FROM decks` — zero aggregate, lettura pura. Istantanea.

Nota: la vecchia RPC `get_my_decks_summary` (migration precedente) rimane nel DB ma non è più chiamata dal codice. Si può droppare se fastidiosa: `DROP FUNCTION public.get_my_decks_summary(uuid);`.

### [STEP 10] — Apple OAuth (opzionale)
Quando: se vuoi aggiungere il login con Apple ID.

Cosa fare:
1. Apple Developer → Certificates, Identifiers & Profiles
2. Registra un Service ID con "Sign In with Apple" abilitato
3. Configura dominio e return URL: `https://wyujskkzqeexvmrwudup.supabase.co/auth/v1/callback`
4. Genera una key per Sign In with Apple, scarica il `.p8`
5. Supabase Dashboard → Authentication → Providers → Apple → abilita, compila Service ID, Team ID, Key ID e incolla il contenuto della `.p8`

### [STEP 11] — Dominio custom (opzionale)
Quando: se vuoi un dominio tuo al posto di `adunata.vercel.app`.

Cosa fare:
1. Vercel → progetto → Settings → Domains → Add
2. Segui le istruzioni DNS (di solito un CNAME o A record)
3. Aggiorna `Site URL` in Supabase → Authentication → URL Configuration
4. Aggiungi il nuovo dominio alle redirect URL autorizzate su Google OAuth

### [STEP 12] — Backfill nomi italiani nel DB
Quando: dopo il deploy della feature "search per nome italiano" — va eseguito una volta per popolare `cards.name_it` su tutto il catalogo. Senza questo passo la search italiana continua a funzionare via fallback Scryfall, ma è più lenta.

Cosa fare (da locale, con `.env.local` contenente `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`):

```bash
node --max-old-space-size=4096 scripts/sync-italian-names.mjs
```

Lo script scarica il bulk `default_cards.json` di Scryfall (~500MB), estrae i `printed_name` italiani via `oracle_id`, e aggiorna `cards.name_it` via la RPC `apply_italian_names`. Attesa: ~2-5 min a seconda della rete. Idempotente — se rilanciato senza `--force` salta quando il bulk non è cambiato.

Ripetibile periodicamente (es. mensilmente o quando Scryfall rilascia set nuovi) per aggiornare le nuove carte.

## [STEP] — Applicare migration `20260424130448_deck_sections.sql`

Quando: **prima di usare la feature "Sezioni e tag nei deck"** (P0 dal piano 2026-04-24). Senza migration, la pagina deck fallisce perché `DECK_CARD_COLUMNS` include `section_id`, `tags`, `position_in_section`.

Cosa fare: aprire Supabase Dashboard → SQL Editor del progetto di produzione, incollare il contenuto di `supabase/migrations/20260424130448_deck_sections.sql`, premere **Run**.

La migration è additive e sicura:
- Crea `public.deck_sections` (FK `decks.id` on delete cascade, index su `(deck_id, position)`).
- Estende `public.deck_cards` con `section_id` (FK on delete set null), `tags text[] default '{}'`, `position_in_section int`.
- Due index nuovi su `deck_cards`: `deck_cards_section_idx` e GIN su `tags`.
- RLS su `deck_sections` con due policy: select se deck pubblico o proprietario, mutate se proprietario.

Verifica a migration applicata:
```sql
select column_name, data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('deck_sections', 'deck_cards')
    and column_name in ('section_id','tags','position_in_section','id','deck_id','name','position','color','is_collapsed')
  order by table_name, ordinal_position;

select tablename, policyname, cmd
  from pg_policies
  where tablename = 'deck_sections';

-- Devono comparire: deck_sections_select_visible (SELECT), deck_sections_mutate_owner (ALL).
```

Dove inserire il risultato: niente — `src/types/supabase.ts` è già stato aggiornato a mano con le nuove Row/Insert/Update.

## [STEP] — Applicare migration `20260424133244_user_cards.sql`

Quando: **prima di usare la feature "Collection" + deck overlay** (P1 dal piano 2026-04-24). Senza migration, le route `/api/collection*` e `/api/decks/:id/overlay` falliscono con "relation public.user_cards does not exist".

Cosa fare: aprire Supabase Dashboard → SQL Editor del progetto di produzione, incollare il contenuto di `supabase/migrations/20260424133244_user_cards.sql`, premere **Run**.

La migration è additive e sicura:
- Crea `public.user_cards` (FK a `auth.users` e `public.cards`, entrambe on delete cascade).
- Unique index implicito su (user_id, card_id, foil, language, condition) per abilitare merge via POST.
- Due index: `user_cards_user_idx`, `user_cards_card_idx`.
- RLS abilitato con due policy: `user_cards_select_own` (SELECT) e `user_cards_mutate_own` (ALL) — entrambe pinnate su `auth.uid()`.

Verifica a migration applicata:
```sql
select column_name, data_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'user_cards'
  order by ordinal_position;

-- Dovrebbero comparire: id, user_id, card_id, quantity, foil, language, condition, acquired_at, acquired_price_eur, notes

select policyname, cmd from pg_policies where tablename = 'user_cards';

-- Devono comparire: user_cards_select_own (SELECT), user_cards_mutate_own (ALL).
```

Dove inserire il risultato: niente — `src/types/supabase.ts` è già stato aggiornato a mano con Row/Insert/Update di `user_cards`.

---

## ✅ [STEP] — Applicare migration `20260421180000_lookup_cards_with_collector_number.sql`

Applicata via Supabase MCP il 2026-04-21. L'RPC `lookup_cards_by_name_and_set` ora accetta un `collector_number` opzionale per pair. Con pair tipo `{name, set_code, collector_number: "689"}`, matcha quella riga esatta invece di lasciare a DISTINCT ON la scelta arbitraria tra printings dello stesso (name, set). Risolve: "Arcane Signet (CMR) 689 *F*" → la riga 689 invece della 297.

## ✅ [STEP] — Applicare migration `20260421170000_rls_public_decks_anon_readable.sql`

Applicata via Supabase MCP il 2026-04-21. Apre la SELECT su `decks`, `deck_cards`, `profiles` al role `anon` per i deck con `visibility='public'` (profiles sempre). Sblocca lo scraper Open Graph di WhatsApp/iMessage/Discord (anon, senza cookie) per renderizzare il rich link preview, e permette a chi riceve un link condiviso di vedere il deck senza login. Deck privati restano owner-only.

## ✅ [STEP] — Applicare migration `20260421160000_rewrite_lookup_rpcs_union_for_flavor_name.sql`

Applicata via Supabase MCP il 2026-04-21. La precedente versione degli RPC usava `lower(name) = ANY (...) OR lower(flavor_name) = ANY (...)` che il planner non riusciva a mappare sugli indici expression → full Index Scan su 36k righe, timeout (`statement_timeout`) sull'import di un deck da 96 carte. Riscritta come UNION tra due rami: uno usa `idx_cards_name_lower`, l'altro il partial `idx_cards_flavor_name_lower`. Query warm passa da ~5s a ~10–30ms. Verifica: `explain analyze select * from public.lookup_cards_by_names(array['sol ring']::text[])` deve mostrare "Index Cond: (lower(name) = ANY (lc.arr))", non "Filter".

## ✅ [STEP] — Applicare migration `20260421150000_cards_flavor_name_for_ub_reprints.sql`

Applicata via Supabase MCP il 2026-04-21. Aggiunge `cards.flavor_name` + indice funzionale `lower(flavor_name)`, ed estende `lookup_cards_by_names` e `lookup_cards_by_name_and_set` a matchare anche sul flavor name. Sblocca l'import di Universes Beyond reprints (Paradise Chocobo → Birds of Paradise, Balin's Tomb → Ancient Tomb) senza round-trip Scryfall su import ripetuti.

## ✅ [STEP] — Applicare migration `20260421140000_drop_ambiguous_process_game_action.sql`

Applicata via Supabase MCP il 2026-04-21. Il DB aveva due overload di `process_game_action` (11 arg senza `p_expected_seq`, 12 arg con). Le chiamate log-only (chat_message / library_view / peak / concede) che non passavano `p_expected_seq` matchavano entrambi gli overload → PostgREST le rifiutava come ambigue. Sintomo: la chat in partita non funzionava, i messaggi non arrivavano mai su `game_log`. Droppato l'overload 11-arg; il 12-arg skippa comunque il check OCC quando `p_expected_seq IS NULL`.

Verifica: `select pronargs from pg_proc where proname='process_game_action'` → deve ritornare una sola riga con `12`.

## ✅ [STEP] — Applicare migration `20260421130000_deck_cards_foil_and_set_lookup.sql`

Applicata via Supabase MCP il 2026-04-21. Verifica eseguita con `information_schema`:
- `deck_cards.is_foil boolean NOT NULL DEFAULT false` aggiunta
- RPC `lookup_cards_by_name_and_set(pairs jsonb)` presente e `STABLE` con `search_path` bloccato

Cosa sblocca: in importazione, una riga come `4 Lightning Bolt (STA) 42 *F*` ora risolve alla stampa STA come foil row separata dalla non-foil. Senza questo passo, l'import torna a risolvere per nome e perde foil+edizione.

## ✅ [STEP] — Applicare migration `20260421120000_lobby_invitations.sql`

Applicata via Supabase MCP il 2026-04-21. Verifica eseguita:
- 7 colonne presenti (id, lobby_id, from_user_id, to_user_id, status, created_at, responded_at)
- 3 policy RLS (select/insert/update participants)
- 4 index (pkey, unique (lobby_id, to_user_id), partial pending su to_user_id, secondario su from_user_id)
- `lobby_invitations` inclusa in `pg_publication_tables` per `supabase_realtime`

Quando: prima di usare la feature "Invite to 1v1" (menu su `/play` e bottone sul profilo di un utente di community).
Cosa fare: aprire il Supabase SQL Editor del progetto di produzione e incollare il contenuto di `supabase/migrations/20260421120000_lobby_invitations.sql`, quindi premere *Run*.

La migration è additive e sicura:
- Crea la tabella `public.lobby_invitations` (FK a `game_lobbies` e `profiles`, tutti con `on delete cascade`).
- Due index: uno parziale sui pending ricevuti, uno secondario sugli inviati.
- Policy RLS: select/update per sender o recipient, insert solo da self come sender.
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.lobby_invitations` — CRITICO per far ricevere in realtime le notifiche in /play. Sintomo se mancante: gli inviti arrivano nel DB ma il client non vede mai l'evento INSERT.

Dove inserire il risultato: niente da inserire — il TypeScript types file (`src/types/supabase.ts`) è già stato aggiornato a mano con la Row/Insert/Update della nuova tabella. Verificato con `npx tsc --noEmit`.

Come verificare a migration applicata:
```sql
select column_name, data_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'lobby_invitations'
  order by ordinal_position;

-- Dovrebbero comparire: id, lobby_id, from_user_id, to_user_id, status, created_at, responded_at

select tablename from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public';

-- Tra i risultati deve apparire `lobby_invitations`.
```
