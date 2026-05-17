# Passi Manuali — Adunata

Solo cose ancora da fare. Completati rimossi (tanto git ricorda).

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

## [MPCFILL] — Backend MPCFill per scan HD proxy (opzionale)

Quando: per attivare le scansioni HD community su `/api/mpcfill-image`. Senza, il PDF proxy usa solo Scryfall PNG (~300 DPI massimo).

Contesto: `chilli-axe/mpc-autofill` non hostta un backend pubblico (frontend `mpcfill.com` mostra "Configure Server"). Serve URL di un'istanza Django self-hosted dalla community.

Cosa fare:
1. Trovare un backend pubblico: chiedere su Discord MPCFill (`https://discord.gg/qZyrgaY8MM`) o forum cEDH; oppure self-host (Django + Elasticsearch + Google Drive service account, vedi `https://github.com/chilli-axe/mpc-autofill/wiki/Backend`).
2. Setta env var Vercel:
   - `vercel env add MPCFILL_BACKEND_URL preview` → incolla URL (es. `https://mpc.cubecobra.com` o simile)
   - Ripeti per `development` e `production` se confermato funzionante in preview.
3. Verifica: `curl https://<deploy-url>/api/mpcfill-image?scryfall_id=<id-noto>` deve ritornare JPEG ~500-1000 KB.

Senza env var, la route ritorna 503 e il client fa cascading fallback su Scryfall — feature degrada in silenzio, non rompe nulla.
