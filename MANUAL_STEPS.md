# Passi Manuali — The Gathering

Questo file raccoglie tutto ciò che richiede un'azione da parte tua.
Claude Code lo aggiorna durante lo sviluppo ogni volta che incontra un prerequisito esterno.

Leggi questo file periodicamente. Quando completi un passo, metti ✅ accanto al titolo.

---

## ✅ [STEP 1] — Creare progetto Supabase
Completato. Progetto: wyujskkzqeexvmrwudup

## ✅ [STEP 2] — Eseguire le migration del database
Completato via Supabase MCP plugin.

## ✅ [STEP 3] — Configurare Supabase Storage
Completato. Bucket "card-images" creato con accesso pubblico.

## ✅ [STEP 4] — Creare repository GitHub
Completato. Repo: https://github.com/GioviDipla/the-gathering

## [STEP 5] — Deploy su Vercel
Quando: dopo aver pushato su GitHub
Cosa fare:
1. Vai su https://vercel.com e importa il repo "the-gathering"
2. In Environment Variables, aggiungi:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Il deploy avverrà automaticamente a ogni push su main

## [STEP 6] — Generare icone PWA
Quando: prima del deploy in produzione
Cosa fare:
1. Nella cartella `public/icons/` c'è un file `icon.svg` come base
2. Genera le icone PNG necessarie usando un tool online (es. https://realfavicongenerator.net) o da terminale:
   ```
   convert public/icons/icon.svg -resize 192x192 public/icons/icon-192.png
   convert public/icons/icon.svg -resize 512x512 public/icons/icon-512.png
   convert public/icons/icon.svg -resize 512x512 public/icons/icon-maskable-512.png
   ```

## [STEP 7] — Abilitare Supabase Auth
Quando: prima di testare registrazione e login
Cosa fare:
1. Nel pannello Supabase, vai su Authentication > Providers
2. Assicurati che "Email" sia abilitato
3. In Authentication > URL Configuration, imposta il Site URL al tuo dominio Vercel
4. Opzionale: disabilita "Confirm email" in Authentication > Settings per test rapidi in sviluppo

## [STEP 8] — Popolare il database carte (bulk sync da Scryfall)
Quando: quando vuoi scaricare TUTTE le carte Magic nel database locale
Cosa fare:
1. Configura la variabile `CRON_SECRET` nel tuo `.env.local` e su Vercel:
   ```
   CRON_SECRET=una-stringa-segreta-a-tua-scelta
   ```
2. Lancia il sync con curl (scarica ~30k carte oracle, ~170MB):
   ```bash
   # Locale
   curl -X POST http://localhost:3000/api/sync-cards \
     -H "Authorization: Bearer una-stringa-segreta-a-tua-scelta"

   # Produzione
   curl -X POST https://your-app.vercel.app/api/sync-cards \
     -H "Authorization: Bearer una-stringa-segreta-a-tua-scelta"
   ```
3. Il sync è incrementale: se il bulk data di Scryfall non è cambiato dall'ultimo sync, viene skippato automaticamente.
4. Per forzare un re-sync completo:
   ```bash
   curl -X POST http://localhost:3000/api/sync-cards?force=true \
     -H "Authorization: Bearer una-stringa-segreta-a-tua-scelta"
   ```
5. Le carte singole vengono comunque scaricate on-demand quando cerchi nel deck editor o importi un deck.

## [STEP 9] — Abilitare Google OAuth in Supabase
Quando: prima di testare il login con Google
Cosa fare:
1. Vai su Google Cloud Console → APIs & Services → Credentials
2. Crea un OAuth 2.0 Client ID (tipo: Web application)
3. In "Authorized redirect URIs" aggiungi: `https://wyujskkzqeexvmrwudup.supabase.co/auth/v1/callback`
4. Copia Client ID e Client Secret
5. Vai su Supabase Dashboard → Authentication → Providers → Google
6. Abilita Google, incolla Client ID e Client Secret
7. Salva

## [STEP 10] — Abilitare Apple OAuth in Supabase
Quando: prima di testare il login con Apple
Cosa fare:
1. Vai su Apple Developer → Certificates, Identifiers & Profiles
2. Registra un nuovo Service ID (abilita "Sign In with Apple")
3. Configura dominio e return URL: `https://wyujskkzqeexvmrwudup.supabase.co/auth/v1/callback`
4. Crea una key per Sign In with Apple, scarica il file .p8
5. Vai su Supabase Dashboard → Authentication → Providers → Apple
6. Abilita Apple, incolla Service ID, Team ID, Key ID e il contenuto della .p8 private key
7. Salva
