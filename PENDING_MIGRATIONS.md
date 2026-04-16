# Pending Migrations

Migration SQL scritte ma **NON ancora applicate** al DB Supabase di produzione. Da eseguire appena rientri sul Macbook dove è disponibile il plugin `mcp__plugin_supabase_supabase__*` (oppure tramite Supabase Dashboard → SQL Editor).

Dopo l'applicazione di ciascuna, seguire la nota `Cleanup post-apply` per rimuovere fallback/codice legacy.

---

## 1. `20260416230000_deck_summary_rpc.sql` — RPC aggregata per /decks

**File**: `supabase/migrations/20260416230000_deck_summary_rpc.sql`

**Stato**: codice in prod la chiama già, con fallback alla vecchia query `deck_cards(quantity)` se la RPC non esiste. La pagina `/decks` funziona comunque ma è lenta finché la RPC non è applicata.

**Effetto post-apply**: `/decks` passa da N+1 round-trip a una singola RPC aggregata server-side.

**Cleanup post-apply**: nessuno — il fallback può restare come difesa in profondità. Se vuoi comunque toglierlo, vedi commit `196a676` per la versione "RPC-only".

---

## 2. `20260416240000_decks_card_count_denorm.sql` — denormalize `card_count` + trigger

**File**: `supabase/migrations/20260416240000_decks_card_count_denorm.sql` *(presente nel commit `15465cf`, revertato in `aa0c2bf` per non rompere la prod — vedi sotto come riapplicarlo)*

**Cosa fa**:
1. Aggiunge `decks.card_count integer NOT NULL DEFAULT 0`.
2. Backfilla con `SUM(quantity)` sui board `main` + `commander`.
3. Crea trigger `sync_deck_card_count_trg` su `deck_cards` (INSERT/UPDATE/DELETE) che mantiene il counter aggiornato.

**Stato**: il file SQL è stato revertato dal repo per evitare confusione; è preservato in history nel commit `15465cf`.

**Come procedere al rientro sul Macbook**:

```bash
# 1. Recupera il file SQL dal commit revertato
git show 15465cf:supabase/migrations/20260416240000_decks_card_count_denorm.sql > /tmp/decks_card_count_denorm.sql

# 2. Applica la migration al DB Supabase
#    (tramite MCP plugin o dashboard SQL Editor — incolla il contenuto di /tmp/decks_card_count_denorm.sql)

# 3. Revert del revert per ripristinare il codice applicativo che legge card_count
git revert aa0c2bf --no-edit

# 4. Verifica in locale che la pagina /decks carichi, poi push
git push origin main
```

**Effetto post-apply**: `/decks` diventa istantanea — query SELECT colonna pura, zero aggregate. Scala a N decks con M carte senza penalità.

**Cleanup post-apply**: rimuovere la RPC precedente (non più necessaria) con:
```sql
DROP FUNCTION IF EXISTS public.get_my_decks_summary(uuid);
```
E rimuovere il blocco RPC+fallback in `src/app/(app)/decks/page.tsx` (la `git revert aa0c2bf` del punto 3 sopra fa già questo automaticamente).

---

## Checklist rapida (quando torni al Macbook)

- [ ] Applica `20260416230000_deck_summary_rpc.sql` al DB
- [ ] Applica `20260416240000_decks_card_count_denorm.sql` al DB (contenuto in commit `15465cf`)
- [ ] `git revert aa0c2bf --no-edit` per ripristinare il codice che legge `card_count`
- [ ] Test di `/decks` in produzione — deve caricare istantaneamente
- [ ] (Opzionale) `DROP FUNCTION public.get_my_decks_summary(uuid)` — la RPC non serve più
- [ ] Aggiorna `MANUAL_STEPS.md` mettendo ✅ accanto a `STEP_PERF_DECKS`
- [ ] Cancella questo file `PENDING_MIGRATIONS.md`
