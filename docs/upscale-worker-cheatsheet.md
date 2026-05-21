# Upscale Worker — Cheat Sheet

Pipeline che genera immagini HD (Real-ESRGAN 2x) per le carte e le salva su Cloudflare R2.

```
┌─ Client ────────────────────────────────────────────────────────────┐
│  GET /api/card-image/upscaled?...        → 302 redirect a R2 CDN    │
│  POST /api/card-image/upscaled (batch)   → accoda missing in DB     │
└──────────────────────────────────────────────────────────────────────┘
                            │ INSERT card_image_assets(status='queued')
                            ▼
┌─ Supabase Postgres ─────────────────────────────────────────────────┐
│  table card_image_assets: queue + metadata (storage_path canonico)  │
└──────────────────────────────────────────────────────────────────────┘
                            ▲ SELECT queued / processing
                            │ UPDATE status=ready
┌─ Worker locale (Mac) ───────────────────────────────────────────────┐
│  node scripts/upscale-card-images.mjs                               │
│    1) selectAssets → claim                                          │
│    2) download source da Scryfall                                   │
│    3) realesrgan-ncnn-vulkan -s 2                                   │
│    4) PutObject → R2 (chiave = storage_path)                        │
│    5) UPDATE card_image_assets SET status='ready'                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Env vars rilevanti

| Var | Dove | Cosa fa |
|---|---|---|
| `CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND` | Vercel + `.env.local` | Master switch dell'accodamento automatico via API. `true` (default) accoda missing asset al volo, `false` disabilita |
| `REALESRGAN_BIN` | `.env.local` (Mac) | Path assoluto a `realesrgan-ncnn-vulkan` |
| `REALESRGAN_MODEL_PATH` | `.env.local` (Mac) | Path a cartella `models/` |
| `REALESRGAN_MODEL` | opzionale | Default `realesr-animevideov3`. Alternativa "epic": `realesrgan-x4plus` |
| `REALESRGAN_TILE_SIZE` | opzionale | Default `0` (auto). Riduci a 256/512 se GPU OOM |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | tutti | Worker carica su R2 |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY` | tutti | Worker legge/aggiorna queue |

---

## Master switch accodamento on-demand (server-side)

L'accodamento on-demand è ciò che fa il route handler `POST /api/card-image/upscaled` quando il client chiede carte HD non ancora pronte.

### Accendere

```bash
# locale
printf "true" > /dev/stdout && echo CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND=true >> .env.local

# Vercel — un ambiente alla volta
printf "true" | vercel env add CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND production --yes
printf "true" | vercel env add CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND preview --yes
printf "true" | vercel env add CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND development --yes
```

### Spegnere

```bash
# Vercel dashboard → Project Settings → Environment Variables → edit a "false" + redeploy
# OPPURE da CLI: rimuovi e ri-aggiungi
vercel env rm CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND production --yes
printf "false" | vercel env add CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND production --yes
```

Valori riconosciuti come "off": `0` `false` `off` `no` `disabled` (case-insensitive). Tutto il resto = on.

Comportamento quando off:
- `POST /api/card-image/upscaled` risponde con item `status:'disabled'` per ogni richiesta.
- Le carte già `ready` continuano a essere servite normalmente.
- Le carte già `queued`/`processing` continuano (non vengono cancellate).

---

## Worker — run one-shot

Processa N asset poi esce. Usato per drenare backlog senza tenere il processo aperto.

```bash
node scripts/upscale-card-images.mjs --limit=25
# oppure
npm run upscale:card-images -- --limit=25
```

### Flag

| Flag | Default | Cosa fa |
|---|---|---|
| `--limit=N` | `25` | Massimo asset processati per run |
| `--profile=hd-2x` | `hd-2x` | Profilo target (unico supportato) |
| `--asset-id=<uuid>` | — | Forza esatto asset, ignora coda |
| `--dry-run` | off | Stampa cosa farebbe, niente upload/UPDATE |
| `--keep-temp` | off | Non cancella `.tmp/upscale-card-images/<id>/` |
| `--stale-after-min=N` | `30` | Asset `processing` con `locked_at` più vecchio = ri-claimato |
| `--max-attempts=N` | `3` | Asset con `attempts >= N` saltati (status `failed`) |
| `--worker-id=<str>` | `<hostname>-<pid>` | Tag per `locked_by` |
| `--concurrency=N` | `1` | Parsato ma ignorato — worker sequenziale |

---

## Worker — modalità watch (daemon)

Polla la coda all'infinito. Modalità tipica del Mac sempre acceso.

```bash
npm run upscale:card-images:watch -- --limit=10 --poll-interval-sec=30
# equivalente a:
node scripts/upscale-card-images.mjs --watch --limit=10 --poll-interval-sec=30
```

### Flag aggiuntivi

| Flag | Default | Cosa fa |
|---|---|---|
| `--watch` | — | Attiva loop |
| `--poll-interval-sec=N` | `30` | Pausa tra cicli **solo se** ultimo ciclo non ha trovato asset. Se trovati → cicla subito |

### Stop

```
Ctrl+C
```

Asset in `processing` resteranno tali finché `--stale-after-min` non scade e un altro worker li ri-claima. Volendo, query manuale per liberare subito:

```sql
update public.card_image_assets
set status = 'queued', locked_at = null, locked_by = null
where status = 'processing' and locked_by = '<worker-id>';
```

---

## Accodare manualmente — `scripts/queue-card-images.mjs`

Inserisce in `card_image_assets` righe `queued` per carte già nel DB, senza passare dall'API. Utile per pre-warmare un set o uno specifico mazzo.

```bash
node scripts/queue-card-images.mjs --set=fdn --limit=400
# oppure
npm run queue:card-images -- --set=fdn --limit=400
```

### Flag

| Flag | Default | Cosa fa |
|---|---|---|
| `--limit=N` | `25` | Numero carte considerate |
| `--offset=N` | `0` | Offset paginazione su `cards.name asc` |
| `--profile=hd-2x` | `hd-2x` | Solo hd-2x supportato |
| `--q=<str>` | — | `ilike '%str%'` sul nome carta |
| `--set=<code>` | — | Filtra per `set_code` |
| `--collector-number=<n>` | — | Filtra per `collector_number` (combina con `--set`) |
| `--card-id=<uuid>` | — | Single card (PK) |
| `--scryfall-id=<uuid>` | — | Single card (scryfall id) |
| `--include-basic-lands` | off | Default esclude basic land |
| `--dry-run` | off | Stampa righe che inserirebbe, niente write |

Upsert con `onConflict: 'card_id,face_index,target_profile' ignoreDuplicates: true` → non sovrascrive righe esistenti `ready`/`processing`.

---

## Riprovare i `failed`

Worker salta asset con `attempts >= max-attempts`. Per ricondurli in coda:

```sql
update public.card_image_assets
set status = 'queued', attempts = 0, last_error = null, locked_at = null, locked_by = null
where status = 'failed';
```

Filtri utili:
- `and target_profile = 'hd-2x'`
- `and updated_at < now() - interval '1 day'`
- `and last_error ilike '%timeout%'`

---

## Ispezione coda (SQL)

```sql
-- Conteggio per stato
select status, count(*) from public.card_image_assets group by status order by 2 desc;

-- Quanti pronti per il client
select count(*) from public.card_image_assets
where status='ready' and storage_path is not null and target_profile='hd-2x';

-- Asset stuck in processing
select id, locked_by, locked_at, attempts, last_error
from public.card_image_assets
where status='processing' and locked_at < now() - interval '30 min';

-- Top errori
select last_error, count(*) from public.card_image_assets
where status='failed' group by 1 order by 2 desc limit 20;
```

---

## Disabilitare worker temporaneamente

| Cosa fermare | Come |
|---|---|
| Solo accodamento on-demand (server) | `CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND=false` + redeploy Vercel |
| Worker locale (Mac) | `Ctrl+C` sul processo `--watch`, oppure `pkill -f upscale-card-images.mjs` |
| Tutto | combinare le due |

La coda esistente non viene cancellata; alla riaccensione riparte da dove era.

---

## Costo / throughput indicativi

- Real-ESRGAN 2x su Mac (Apple Silicon GPU): ~2–4 s per carta @ `realesr-animevideov3`, ~10–20 s @ `realesrgan-x4plus`.
- Output PNG ~6 MB per carta. 832 carte = ~5 GB.
- R2 storage: $0.015/GB·mese, **zero egress**.
- Backlog 30k carte → ~30–60 ore di worker continuo a model `animevideov3`.

---

## Troubleshooting rapido

| Sintomo | Causa probabile | Fix |
|---|---|---|
| Worker logga `Missing R2 env` | `.env.local` non sourceato o vars mancanti | Controlla `grep ^R2_ .env.local` |
| `realesrgan exited 1: vkAllocateMemory failed` | GPU OOM con tile auto | `REALESRGAN_TILE_SIZE=256` |
| `source download failed: HTTP 404` | URL Scryfall stale per quella carta | Lascia che `--max-attempts` la marchi failed; rilancia bulk sync per ricostruire `image_normal` |
| Tutti `failed: write EPROTO ... SSL alert 40` verso R2 | Account ID errato (es. hai messo Token ID `cfat_...`) | Sostituisci con vero Account ID hex 32-char da dashboard Cloudflare |
| Client 404 su asset `ready` | R2 key mancante (migrazione incompleta) | `node scripts/verify-r2-migration.mjs` poi ri-run `migrate-card-images-to-r2.mjs` |
| Asset bloccato in `processing` | Worker crashato senza release lock | Aspetta `--stale-after-min`, oppure UPDATE manuale (vedi sopra) |
