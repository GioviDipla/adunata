# Import Moxfield Decks

Script standalone per importare mazzi pubblici da Moxfield nel profilo
Adunata. Usa Chromium (Playwright) per superare la protezione Cloudflare
di Moxfield — nessuna API key di terze parti richiesta.

## Prerequisiti

1. **Repo** clonato con `npm install` eseguito.
2. **`.env.local`** configurato con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...  # chiave service_role
   ```
3. **Chromium** auto-installato al primo run (lo script chiama
   `npx playwright install chromium` se mancante).

## Usage

```bash
# Scoprire il proprio user_id
node scripts/import-moxfield-decks.mjs --find-user=giovanni

# Import di 12 deck pubblici (default)
node scripts/import-moxfield-decks.mjs --user=<uuid>

# 50 deck, solo Commander, visibilità unlisted
node scripts/import-moxfield-decks.mjs --user=<uuid> --count=50 --format=commander --visibility=unlisted

# Dry-run: fetch + risolvi carte ma NON creare deck (test sicuro)
node scripts/import-moxfield-decks.mjs --user=<uuid> --count=5 --dry-run

# Help
node scripts/import-moxfield-decks.mjs --help
```

## Opzioni

| Flag | Default | Descrizione |
|------|---------|-------------|
| `--user=<uuid>` | *richiesto* | ID profilo target. Usa `--find-user` per trovarlo. |
| `--count=<n>` | 12 | Numero deck da importare. |
| `--format=<f>` | *any* | Filtro formato (es. `commander`, `duelCommander`). |
| `--visibility=<v>` | `public` | `public` \| `unlisted` \| `private`. |
| `--find-user=<q>` | — | Cerca profili per username/display_name, stampa id, esce. |
| `--dry-run` | — | Fetch + resolve ma non inserisce nel DB (test). |
| `--help` | — | Mostra help. |

## Come funziona

1. Avvia Chromium → naviga Moxfield `/decks/public` (passa Cloudflare
   perché è un browser reale).
2. Estrae gli ID deck pubblici dalla pagina.
3. Per ogni deck, fetch `api.moxfield.com/v2/decks/all/<id>` dal page
   context (ha clearance Cloudflare) → estrae nome, formato, autore,
   lista carte (commander + mainboard + sideboard + maybeboard).
4. Risolve ogni carta per `scryfall_id` nella tabella `cards`. Se non
   trovata, fetch Scryfall `/cards/<id>` + upsert.
5. Crea deck (visibilità scelta, description credita autore Moxfield
   originale) + deck_cards via client `service_role`.
6. **Idempotente**: se lo stesso deck (URL Moxfield) è già stato
   importato, lo salta. Puoi ri-eseguire senza creare duplicati.

## Note

- I deck importati hanno `description` con credit all'autore originale
  Moxfield e URL del deck (es. `Imported from Moxfield — original:
  Speedmetal594 (https://moxfield.com/decks/<id>)`).
- `card_count` è aggiornato dal trigger `sync_deck_card_count`.
- Il formato deck è quello restituito da Moxfield (es. `commander`,
  `duelCommander`, `standard`).
- Rate limit: 450ms tra fetch deck, 120ms tra richieste Scryfall.
