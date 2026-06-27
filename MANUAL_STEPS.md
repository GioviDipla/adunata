# Passi Manuali — Adunata

Solo cose ancora da fare. Completati rimossi (tanto git ricorda).

---

## [R2-CORS] Configurare CORS sul bucket R2

Quando: dopo aver verificato che l'API key R2 corrente non ha permessi PutBucketCors.
Cosa fare:
1. Vai su Cloudflare Dashboard → R2 → adunata-card-images-hd → Settings → CORS
2. Aggiungi regola CORS:
   - Allowed Origins: `*`
   - Allowed Methods: `GET`, `HEAD`
   - Allowed Headers: `*`
   - Max Age: 86400
Dove inserire il risultato: già applicato — verifica che funzioni con `curl -sI -H "Origin: https://adunata.studiob35.com" "https://cdn.adunata.studiob35.com/scryfall/test" | grep access-control`

Nota: il proxy server-side in `/api/card-image/upscaled` (2026-05-21) ha già risolto il problema CORS lato client. Questo passo è per permettere accesso diretto alle immagini R2 dal browser senza passare per il server Next.js.

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

## [STEP] — Applicare migration `search_my_decks` (My Decks filtri + load more)
Quando: prima di promuovere `dev` → `release`/`main`. La pagina My Decks usa l'RPC `search_my_decks`; finché non è applicata, la lista mostra lo stato vuoto.
Cosa fare: applicare il file `supabase/migrations/20260627160000_search_my_decks.sql` al progetto Supabase condiviso. Due opzioni:
  1. Autorizzare il Supabase MCP (OAuth) e farlo applicare a Claude.
  2. Manuale: SQL Editor del dashboard Supabase → incolla il contenuto del file → Run.
Dove inserire il risultato: nessun valore da copiare; verificare con `select proname from pg_proc where proname='search_my_decks';` (deve restituire 1 riga).
