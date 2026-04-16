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

---

## Step ancora aperti

### [STEP_PERF_DECKS] — Applicare migration `get_my_decks_summary`
Quando: **appena possibile**, per rendere veloce la pagina `/decks`.

Cosa fare: applicare il contenuto di `supabase/migrations/20260416230000_deck_summary_rpc.sql` al DB (via Supabase Dashboard → SQL Editor, oppure via MCP plugin).

Effetto: la pagina `/decks` passa da 2 query + join con tutte le righe `deck_cards` → 1 RPC aggregata in un solo round-trip. Finché la migration non è applicata, il codice ha un fallback sulla vecchia query (funziona lo stesso, ma lento — è lo stato attuale).

Dopo aver applicato: verificare che `/decks` carichi veloce, poi rimuovere il blocco fallback in `src/app/(app)/decks/page.tsx`.

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
