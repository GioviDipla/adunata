# Passi Manuali — The Gathering

Questo file raccoglie tutto ciò che richiede un'azione da parte tua.
Claude Code lo aggiorna durante lo sviluppo ogni volta che incontra un prerequisito esterno.

Leggi questo file periodicamente. Quando completi un passo, metti ✅ accanto al titolo.

---

## [STEP 1] — Creare progetto Supabase
Quando: prima di avviare l'app in locale
Cosa fare:
1. Vai su https://supabase.com e crea un account (se non ne hai uno)
2. Crea un nuovo progetto chiamato "the-gathering"
3. Scegli la region più vicina (es. eu-central-1 per l'Europa)
4. Annota la password del database
5. Dal pannello del progetto, vai su Settings > API
6. Copia "Project URL" e "anon public key"
Dove inserire il risultato: file `.env.local` nella root del progetto:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

## [STEP 2] — Eseguire le migration del database
Quando: dopo aver configurato le variabili d'ambiente in `.env.local`
Cosa fare:
1. Installa Supabase CLI: `npm install -g supabase`
2. Esegui `npx supabase login`
3. Esegui `npx supabase link --project-ref <il-tuo-project-ref>`
4. Esegui `npx supabase db push` per applicare tutte le migration
In alternativa, copia il contenuto di ogni file in `supabase/migrations/` e incollalo nell'SQL Editor del pannello Supabase.

## [STEP 3] — Configurare Supabase Storage
Quando: dopo aver eseguito le migration
Cosa fare:
1. Nel pannello Supabase, vai su Storage
2. Crea un bucket chiamato "card-images" con accesso pubblico
3. Nelle policy del bucket, aggiungi una policy che permette SELECT a tutti (public read)

## [STEP 4] — Creare repository GitHub
Quando: dopo che il progetto è completo e funzionante in locale
Cosa fare:
1. Crea un nuovo repo su GitHub chiamato "the-gathering"
2. Esegui i comandi git nella root del progetto:
   ```
   git init
   git add .
   git commit -m "Initial commit: The Gathering platform"
   git branch -M main
   git remote add origin https://github.com/<tuo-username>/the-gathering.git
   git push -u origin main
   ```

## [STEP 5] — Deploy su Vercel
Quando: dopo aver pushato su GitHub
Cosa fare:
1. Vai su https://vercel.com e importa il repo "the-gathering"
2. In Environment Variables, aggiungi le stesse variabili di `.env.local`
3. Aggiungi anche `CRON_SECRET` con un valore random sicuro (es. `openssl rand -hex 32`)
4. Il deploy avverrà automaticamente a ogni push su main

## [STEP 6] — Configurare Vercel Cron
Quando: dopo il primo deploy su Vercel
Cosa fare:
1. Il file `vercel.json` contiene già la configurazione cron
2. Verifica che la route `/api/cron/sync-cards` sia accessibile
3. Il sync mensile partirà automaticamente il primo di ogni mese
4. Per il primo sync, chiama manualmente: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<tuo-dominio>/api/cron/sync-cards`

## [STEP 7] — Generare icone PWA
Quando: prima del deploy in produzione
Cosa fare:
1. Nella cartella `public/icons/` c'è un file `icon.svg` come base
2. Genera le icone PNG necessarie usando un tool online (es. https://realfavicongenerator.net) o da terminale:
   ```
   # Con ImageMagick:
   convert public/icons/icon.svg -resize 192x192 public/icons/icon-192.png
   convert public/icons/icon.svg -resize 512x512 public/icons/icon-512.png
   convert public/icons/icon.svg -resize 512x512 public/icons/icon-maskable-512.png
   ```
3. Le icone sono referenziate da `public/manifest.json` e `src/app/layout.tsx`

## [STEP 8] — Primo caricamento carte
Quando: dopo il deploy e la configurazione del cron
Cosa fare:
1. Chiama manualmente l'endpoint di sync con POST:
   ```
   curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<tuo-dominio>/api/cron/sync-cards
   ```
2. Il primo sync scaricherà tutte le carte da Scryfall (~80k carte)
3. Potrebbe richiedere diversi minuti
4. Monitora i log su Vercel per verificare il completamento

## [STEP 9] — Abilitare Supabase Auth
Quando: prima di testare registrazione e login
Cosa fare:
1. Nel pannello Supabase, vai su Authentication > Providers
2. Assicurati che "Email" sia abilitato
3. In Authentication > URL Configuration, imposta il Site URL al tuo dominio Vercel
4. Opzionale: disabilita "Confirm email" in Authentication > Settings per test rapidi in sviluppo
