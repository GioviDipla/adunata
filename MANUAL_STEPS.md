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
