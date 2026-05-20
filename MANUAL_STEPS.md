# Passi Manuali — Adunata

Solo cose ancora da fare. Completati rimossi (tanto git ricorda).

---

## [STEP R2-1] — Create Cloudflare R2 bucket

Quando: prima di eseguire Task 3 del piano `docs/superpowers/plans/2026-05-19-r2-card-images-migration.md` (gli step di codice/scaffolding sono già committati e non bloccanti; servono però i valori qui sotto per far girare la migrazione, il worker e il route handler in dev/preview/prod).

Cosa fare:
1. Login su https://dash.cloudflare.com. Se non esiste account, crearne uno gratuito con email `gidippi@gmail.com`.
2. Sidebar → "R2 Object Storage" → "Create bucket".
3. Nome bucket: `adunata-card-images-hd`. Location: "Automatic" (eu-prefer). Click Create.
4. Aperto il bucket, tab "Settings" → "Public access" → "Connect Domain". Inserire `cdn.adunata.studiob35.com`. Confermare DNS via Cloudflare (se dominio già su Cloudflare DNS) o copiare il CNAME nella zona DNS attuale.
   - Se il dominio non è su Cloudflare DNS e non lo vuoi spostare, alternativa: abilita "R2.dev subdomain" e prendi nota dell'URL pubblico `https://pub-<hash>.r2.dev`.
5. Tab "R2 API Tokens" (sidebar R2 → Manage R2 API Tokens) → "Create API Token".
6. Token name: `adunata-upscale-worker`. Permissions: `Object Read & Write`. Specify bucket: `adunata-card-images-hd`. TTL: forever. Click "Create API Token".
7. Copia (sono mostrati solo una volta):
   - `Access Key ID`
   - `Secret Access Key`
   - `Endpoint` (formato `https://<account-id>.r2.cloudflarestorage.com`)
   - `Account ID` (presente nell'endpoint)

Dove inserire il risultato: in `.env.local` (e su Vercel dashboard via `vercel env add` per ogni ambiente — Production/Preview/Development):

```
R2_ACCOUNT_ID=<account-id>
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_BUCKET=adunata-card-images-hd
R2_PUBLIC_BASE_URL=https://cdn.adunata.studiob35.com
# Se hai usato r2.dev:
# R2_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev
```

Comandi pronti per sincronizzare su Vercel (CLI 50.x: niente `--value`):

```bash
for ENV in development preview production; do
  printf "%s" "<r2-account-id>" | vercel env add R2_ACCOUNT_ID $ENV --yes
  printf "%s" "<r2-access-key-id>" | vercel env add R2_ACCESS_KEY_ID $ENV --yes
  printf "%s" "<r2-secret-access-key>" | vercel env add R2_SECRET_ACCESS_KEY $ENV --yes
  printf "%s" "adunata-card-images-hd" | vercel env add R2_BUCKET $ENV --yes
  printf "%s" "https://cdn.adunata.studiob35.com" | vercel env add R2_PUBLIC_BASE_URL $ENV --yes
done
```

## [STEP R2-2] — Verifica dominio CDN raggiungibile

Quando: dopo Step R2-1, prima di eseguire Task 3 del piano (migrazione bulk).

Cosa fare:
1. Carica manualmente un file di test via Cloudflare dashboard (bucket → "Upload" → file qualunque, es. `ping.txt` con contenuto "ok").
2. Verifica che `curl -I $R2_PUBLIC_BASE_URL/ping.txt` ritorni HTTP 200. Se 403 / 404: pubblicazione non attiva — rivedi Step R2-1 punto 4.
3. Elimina `ping.txt` dal bucket via dashboard.

Dove inserire il risultato: nessun file — solo conferma del fatto che il CDN serve oggetti pubblicamente.

## [STEP R2-3] — Eseguire migrazione bulk + cleanup Supabase

Quando: dopo Step R2-1 e R2-2 completi, con `.env.local` aggiornato.

Cosa fare:
1. Migrazione:
   ```bash
   node scripts/migrate-card-images-to-r2.mjs 2>&1 | tee /tmp/r2-migration.log
   ```
   Atteso: `Done: total=~832 copied=~832 skipped=0 failed=0`. Re-run idempotente: `skipped=832 copied=0`.
2. Verifica:
   ```bash
   node scripts/verify-r2-migration.mjs
   ```
   Atteso: `mismatches=0` e `absent-in-r2=0`. Se qualcosa non torna, rilancia migrazione.
3. Smoke test route handler in dev:
   ```bash
   pnpm dev
   ```
   Apri deck con upscale ready, controlla che `/api/card-image/upscaled` risponda `302` verso il dominio CDN.
4. Drop bucket Supabase: dashboard Supabase → Storage → `card-images-hd` → Delete bucket (digitare il nome per conferma). Conferma poi che Storage usage scende di ~5.2 GB.

Dove inserire il risultato: nessun file — solo conferma operativa. Quando completo, rimuovere questo blocco e marcare R2-1/R2-2 come `[DONE]` (o cancellarli).

---

## [UPSCALE-WORKER] — Worker asincrono per immagini Ultra

**Comportamento:** in produzione Vercel non genera immagini con Real-ESRGAN. Quando Ultra trova immagini mancanti, accoda righe `queued` in Supabase; un worker locale o dedicato deve processarle.

Per attivare/disattivare l'accodamento automatico:

```bash
CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND=true   # default: accoda missing asset
CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND=false  # disabilita accodamento automatico
```

Su Vercel imposta la variabile in Project Settings → Environment Variables. Per spegnere subito la feature, mettila a `false` e redeploy.

Per consumare la coda dal Mac:

```bash
npm run upscale:card-images:watch -- --limit=10 --poll-interval-sec=30
```

Il Mac deve essere acceso, online e con `REALESRGAN_BIN`/`REALESRGAN_MODEL_PATH` configurati.

---

## [PRINT-ORDER] — Setup Resend per "Print at StudioB35"

**Problema:** bottone "Print at StudioB35" fa fetch a `/api/print-order` che invia email via Resend con PDF allegato a `amministrazione@studiob35.com`. `RESEND_API_KEY` è vuoto in `.env.local` e mancante completamente in Vercel → API risponde 500 → bottone resetta senza feedback (ora UI mostra errore).

Cosa fare:
1. Accedi a https://resend.com (stesso account usato per email auth, se già creato)
2. **Domains** → Aggiungi e verifica `adunata.studiob35.com` (record DNS DKIM/SPF). Il sender configurato in `src/app/api/print-order/route.ts` è `orders@adunata.studiob35.com` — il dominio deve essere verificato altrimenti Resend rifiuta send.
3. **API Keys** → crea chiave "adunata-print-order" con permesso `Sending access` su dominio sopra.
4. Aggiungi la chiave a Vercel (tutti gli ambienti):
   ```bash
   printf "re_xxxxxxxxxxxx" | vercel env add RESEND_API_KEY production --yes
   printf "re_xxxxxxxxxxxx" | vercel env add RESEND_API_KEY preview --yes
   printf "re_xxxxxxxxxxxx" | vercel env add RESEND_API_KEY development --yes
   ```
5. Aggiorna `.env.local` riga 4: `RESEND_API_KEY="re_xxxxxxxxxxxx"` (rimuovi virgolette vuote esistenti).
6. Redeploy: `vercel --prod` (o push su `release`/`main`).
7. Test: apri un deck → "Print Proxy" → seleziona carte → Preview → "Print at StudioB35". Banner verde deve apparire e email arrivare ad `amministrazione@studiob35.com`.

Nota payload: Vercel limita request body a 4.5 MB. PDF base64 di un commander deck full pages può sforare. Se Resend ok ma client vede errore "413" o "Body exceeded", serve refactor: upload PDF su Supabase Storage e passare URL al route handler.

---

## [EMAIL] — Migliorare deliverability email (uscire dallo Spam)

**Problema:** email di conferma iscrizione e reset password finiscono in Spam. Supabase di default usa SMTP condiviso con reputazione variabile. L'iCloud SMTP attuale ha limiti di volume e deliverability scarsa.

**Soluzione raccomandata:** Resend (https://resend.com) — piano free 100 email/giorno, setup 5 minuti.

Cosa fare:
1. Crea account su https://resend.com
2. Aggiungi il dominio `studiob35.com` e verificalo (aggiungi record DNS mostrati da Resend)
3. Vai su Resend → API Keys → crea una chiave
4. Supabase Dashboard → Authentication → Email Templates:
   - SMTP Provider: abilita "Use Custom SMTP"
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: la API key creata al punto 3

Alternativa: AWS SES (più economico su volumi alti ma setup più complesso — verifica dominio, richiesta produzione, policy DKIM/SPF).

Dove mettere chiave: Supabase Dashboard → Authentication → SMTP Settings, non serve variabile in `.env`.

---

## [APPLE] — Apple OAuth (opzionale)

Quando: se vuoi login con Apple ID.

1. Apple Developer → Certificates, Identifiers & Profiles
2. Registra Service ID con "Sign In with Apple"
3. Return URL: `https://wyujskkzqeexvmrwudup.supabase.co/auth/v1/callback`
4. Genera key per Sign In with Apple, scarica `.p8`
5. Supabase Dashboard → Authentication → Providers → Apple → abilita, compila Service ID, Team ID, Key ID, incolla contenuto `.p8`
