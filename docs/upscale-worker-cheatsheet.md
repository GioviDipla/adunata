# Upscale Worker — Manuale Operativo

Tutto quello che serve sapere per accendere/spegnere il worker e accodare lavoro. Vai direttamente alla ricetta che ti serve.

> Tutti i comandi si lanciano dalla root del repo: `~/MBPro/CursorProject/TheGathering`.

---

## Come funziona (30 secondi)

```
[Client web] ──POST──> [Vercel /api/card-image/upscaled]
                                │
                                │ INSERT card_image_assets (status='queued')
                                ▼
                       [Tabella Supabase: coda]
                                ▲
                                │ SELECT queued / claim / UPDATE ready
                                │
                          [Worker sul Mac]
                                │
                                ▼
                       [Real-ESRGAN 2x → PNG]
                                │
                                ▼
                        [Upload su Cloudflare R2]
                                │
                                ▼
              [Client riceve 302 verso cdn.adunata...]
```

Due cose indipendenti, entrambe devono essere "on" perché un utente ottenga un'immagine HD nuova:

1. **Server (Vercel)** — `CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND=true` → quando un client chiede un'immagine HD non ancora pronta, viene messa in coda.
2. **Worker (Mac)** — script Node.js che gira sul tuo Mac, polla la coda Supabase, fa girare Real-ESRGAN, carica il PNG su R2.

Se il server è on ma il worker non gira → la coda cresce ma nessuno lavora.
Se il worker gira ma il server è off → la coda non cresce, ma se ci sono job vecchi residui vengono comunque processati.

---

## Worker locale (sul Mac)

### Accendi il worker — modalità on-demand continua (caso normale)

Il worker resta in piedi, polla ogni 30 secondi, processa fino a 10 carte per ciclo.

```bash
npm run upscale:card-images:watch -- --limit=10 --poll-interval-sec=30
```

Lascialo in un terminale aperto. Il Mac deve essere acceso e online.

### Spegni il worker

Dal terminale dove gira:

```
Ctrl+C
```

Da un altro terminale (se hai chiuso quella finestra):

```bash
pkill -f upscale-card-images.mjs
```

### Verifica che sia vivo

```bash
pgrep -fl upscale-card-images.mjs
```

Vedi un PID + comando = vivo. Output vuoto = spento.

---

## Upscale di un singolo set

Il worker non filtra per set. Il flow è:

> 1. accoda le carte del set in coda Supabase
> 2. lascia che il worker (o un run one-shot) le processi

### Accoda tutto un set (senza limite)

```bash
npm run queue:card-images -- --set=fdn --limit=10000
```

Il `--limit` qui è il numero di carte considerate dal DB `cards`, non un cap reale. Mettilo grande quanto basta a coprire il set (Final Fantasy = ~400 carte, set normali 250–300, supplementari fino a 700).

Verifica conteggio:

```bash
npm run queue:card-images -- --set=fdn --limit=10000 --dry-run
```

`--dry-run` non scrive niente, stampa cosa farebbe.

### Accoda un set con limite reale

```bash
npm run queue:card-images -- --set=fdn --limit=50
```

Accoda le **prime 50** carte del set (ordine alfabetico per `name asc`).

### Processa il set appena accodato (one-shot, poi esci)

```bash
npm run upscale:card-images -- --limit=400
```

Il worker prende fino a 400 asset dalla coda (qualunque set), li processa, esce. Se vuoi *solo* quel set, accoda solo quel set prima (la coda contiene solo carte di quel set se così è stata popolata).

### Processa il set in background (modalità watch)

Se è un set grosso e vuoi che vada per ore:

```bash
npm run upscale:card-images:watch -- --limit=20 --poll-interval-sec=15
```

Aumenta `--limit` se hai GPU potente (più job per ciclo) e riduci `--poll-interval-sec` se vuoi reazione più veloce.

### Solo accoda (senza processare)

```bash
npm run queue:card-images -- --set=fdn --limit=10000
```

Stop. Le righe restano `status='queued'` finché un worker (o un run one-shot) le pesca.

---

## Filtri di accodamento

`scripts/queue-card-images.mjs` accetta:

| Flag | Esempio | Significato |
|---|---|---|
| `--set=<code>` | `--set=fdn` | Tutti i 3-letter Scryfall set code (vedi `select distinct set_code from cards`) |
| `--collector-number=<n>` | `--collector-number=001 --set=fdn` | Singola carta numerata, combinato con `--set` |
| `--q=<sostringa>` | `--q="dragon"` | `name ILIKE '%dragon%'` |
| `--type=<sostringa>` | `--type=elf` | `type_line ILIKE '%elf%'` (subtype o supertipo) |
| `--upscaled=<bool>` | `--upscaled=false` | Solo carte senza upscale ready (`has_upscaled_2x = false`) |
| `--card-id=<uuid>` | `--card-id=abc...` | Riga `cards.id` esatta |
| `--scryfall-id=<uuid>` | `--scryfall-id=def...` | Riga `cards.scryfall_id` esatta |
| `--include-basic-lands` | (flag) | Default ESCLUDE Plains/Island/Swamp/Mountain/Forest |
| `--limit=<N>` | `--limit=500` | Quante carte considerare dal DB (default 25) |
| `--offset=<N>` | `--offset=500` | Salta le prime N (per paginare) |
| `--dry-run` | (flag) | Stampa righe che inserirebbe, NON scrive |

### Ricette pronte

```bash
# Tutte le carte di Foundations
npm run queue:card-images -- --set=fdn --limit=10000

# Tutti i dragoni (qualunque set)
npm run queue:card-images -- --q=dragon --limit=10000

# Una singola carta da Scryfall ID
npm run queue:card-images -- --scryfall-id=2b7e8e07-b3ff-496e-923f-42d703f20a1e

# Foundations escluse basic lands
npm run queue:card-images -- --set=fdn --limit=10000  # già esclude di default

# Foundations INCLUSE basic lands
npm run queue:card-images -- --set=fdn --limit=10000 --include-basic-lands

# Solo basic Plains di Foundations
npm run queue:card-images -- --set=fdn --q=plains --include-basic-lands

# Tutti gli elfi (qualunque set)
npm run queue:card-images -- --type=elf --limit=10000

# Tutti gli incantesimi (Enchantment)
npm run queue:card-images -- --type=enchantment --limit=10000

# Solo carte NON ancora upscalate (daily catch-up)
npm run queue:card-images -- --upscaled=false --limit=10000
```

L'upsert ignora duplicati: ri-accodare un set non rifa due volte le carte già `ready`.

---

## Server-side: on/off accodamento on-demand

Master switch su Vercel. Se è `false`, gli utenti che chiedono un'immagine HD non ancora pronta ricevono `disabled` invece di vedere la carta aggiunta in coda.

### Spegni (es. durante manutenzione, niente nuovi job)

```bash
vercel env rm CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND production --yes
printf "false" | vercel env add CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND production --yes
vercel --prod  # redeploy
```

### Riaccendi

```bash
vercel env rm CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND production --yes
printf "true" | vercel env add CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND production --yes
vercel --prod
```

In locale: edita `.env.local` riga `CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND=true|false` e ricarica il dev server.

**Nota**: questo NON ferma il worker. Le carte già in coda continuano a essere processate. Per stop totale → spegni anche il worker (vedi sopra).

---

## Ispezione coda (SQL veloci)

Da `mcp__plugin_supabase_supabase__execute_sql` o Studio:

```sql
-- Conteggio per stato
SELECT status, count(*) FROM public.card_image_assets GROUP BY status ORDER BY 2 DESC;

-- Cosa c'è da fare
SELECT count(*) FROM public.card_image_assets WHERE status = 'queued';

-- Cosa è in lavorazione adesso
SELECT id, locked_by, locked_at, attempts FROM public.card_image_assets
WHERE status = 'processing';

-- Conta ready per set (richiede join su cards)
SELECT c.set_code, count(*) FROM public.card_image_assets a
JOIN public.cards c ON c.id = a.card_id
WHERE a.status='ready' GROUP BY 1 ORDER BY 2 DESC LIMIT 20;

-- Top errori
SELECT last_error, count(*) FROM public.card_image_assets
WHERE status='failed' GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
```

---

## Riprovare i fallimenti

Il worker salta gli asset con `attempts >= 3`. Per rimetterli in coda:

```sql
-- Tutti i failed
UPDATE public.card_image_assets
SET status='queued', attempts=0, last_error=null, locked_at=null, locked_by=null
WHERE status='failed';

-- Solo failed di un set
UPDATE public.card_image_assets a
SET status='queued', attempts=0, last_error=null, locked_at=null, locked_by=null
FROM public.cards c
WHERE a.card_id=c.id AND a.status='failed' AND c.set_code='fdn';

-- Solo failed con errore di timeout
UPDATE public.card_image_assets
SET status='queued', attempts=0, last_error=null, locked_at=null, locked_by=null
WHERE status='failed' AND last_error ILIKE '%timeout%';
```

### Sbloccare asset stuck in "processing"

Capita se il worker crasha senza rilasciare il lock. Aspetti 30 minuti (auto-stale), oppure forzi:

```sql
UPDATE public.card_image_assets
SET status='queued', locked_at=null, locked_by=null
WHERE status='processing';
```

---

## Tutti i flag del worker (`scripts/upscale-card-images.mjs`)

| Flag | Default | Cosa fa |
|---|---|---|
| `--watch` | off | Modalità daemon, polla all'infinito |
| `--poll-interval-sec=N` | `30` | Pausa tra cicli quando coda vuota |
| `--limit=N` | `25` | Max asset per ciclo |
| `--profile=hd-2x` | `hd-2x` | Unico profilo supportato |
| `--asset-id=<uuid>` | — | Forza esattamente quell'asset, ignora coda |
| `--dry-run` | off | Mostra cosa farebbe, non scrive |
| `--keep-temp` | off | Non cancella `.tmp/upscale-card-images/<id>/` |
| `--stale-after-min=N` | `30` | Soglia per ri-claimare asset stuck |
| `--max-attempts=N` | `3` | Salta asset oltre N tentativi |
| `--worker-id=<str>` | `<hostname>-<pid>` | Tag in `locked_by` per identificare worker |
| `--concurrency=N` | `1` | **Ignorato** — worker è sequenziale |

---

## Troubleshooting

| Sintomo | Causa | Fix |
|---|---|---|
| Worker logga `Missing R2 env` | `.env.local` non caricato o vars mancanti | `grep ^R2_ .env.local` — devono esserci 5 valori |
| Worker logga `Missing REALESRGAN_BIN` | binario non configurato | Verifica path in `.env.local` |
| `realesrgan exited 1: vkAllocateMemory failed` | GPU OOM | In `.env.local`: `REALESRGAN_TILE_SIZE=256` (o 128) |
| `source download failed: HTTP 404` | URL Scryfall stale | Lascia che `--max-attempts` lo marchi failed, poi rilancia bulk sync (`npm run sync:cards`) |
| Tutti `failed: write EPROTO ... SSL alert 40` | Account ID R2 errato | Sostituisci `R2_ACCOUNT_ID` in `.env.local` con il vero Account ID hex 32-char (non Token ID `cfat_...`) |
| Client riceve 404 su carta `ready` | Oggetto R2 mancante | `node scripts/verify-r2-migration.mjs` poi `node scripts/migrate-card-images-to-r2.mjs` se ci sono gap |
| Asset bloccato in `processing` per ore | Worker crashato senza rilasciare lock | Aspetta 30 min (auto-stale) o UPDATE manuale (sopra) |
| Coda cresce ma nessuno processa | Worker spento | `pgrep -fl upscale-card-images.mjs` per verificare |
| Worker processa ma coda non scende | Stai accodando più velocemente di quanto processa | Aumenta `--limit` del worker o aspetta |

---

## Costi / throughput

- Real-ESRGAN 2x su Apple Silicon: ~2–4 s per carta con `realesr-animevideov3` (default), ~10–20 s con `realesrgan-x4plus`.
- Output PNG ~6 MB per carta.
- R2: $0.015/GB·mese storage, **zero egress**. 5 GB = $0.08/mese.
- Catalogo intero (30k carte): ~30–60 ore worker continuo, ~180 GB storage = $2.70/mese.
