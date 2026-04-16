# Checkpoint — Adunata

Stato: **COMPLETATO**

---

## Completato

### Infrastruttura
- [x] Progetto Next.js 16 App Router inizializzato
- [x] Tailwind CSS v4 configurato con design system dark-themed
- [x] Supabase client (browser, server, admin, middleware)
- [x] TypeScript types per database completi
- [x] Vercel config con cron mensile per sync carte
- [x] PWA manifest, service worker, installabilità
- [x] Middleware per refresh sessione auth

### Database
- [x] Schema SQL completo con 7 tabelle (cards, sync_log, decks, deck_cards, game_lobbies, game_players, game_states)
- [x] Full-text search con tsvector su carte
- [x] RLS policies per tutte le tabelle
- [x] Trigger updated_at automatici
- [x] Tabelle future-proofing per matchmaking e tavolo virtuale

### Autenticazione
- [x] Login con email/password
- [x] Registrazione con conferma email
- [x] Layout auth centrato
- [x] Redirect automatico basato su stato auth
- [x] Profilo utente con cambio password

### Database Carte
- [x] Client Scryfall con streaming bulk data
- [x] API cron sync mensile (/api/cron/sync-cards)
- [x] Lookup on-demand per carte mancanti (/api/cards/lookup)
- [x] Browser carte con ricerca full-text
- [x] Filtri: colore, tipo, rarità, CMC, set
- [x] Griglia responsive con preview immagini
- [x] Dettaglio carta completo con legalità formati
- [x] Rendering costo mana con simboli colorati

### Gestione Deck
- [x] Lista mazzi con cover art e statistiche
- [x] Creazione nuovo mazzo
- [x] Import da formato testuale (MTGO/Moxfield/Archidekt)
- [x] Editor mazzo con aggiunta/rimozione carte
- [x] Tabs Main Deck / Sideboard / Maybeboard
- [x] Statistiche: curva di mana, distribuzione colori, tipi, valore economico
- [x] Esportazione in più formati (MTGO, Moxfield, lista semplice)
- [x] Ricerca carte con autocomplete per aggiunta al mazzo

### Goldfish Mode
- [x] Simulazione prima pescata (7 carte)
- [x] London Mulligan completo (scelta carte da rimettere sotto)
- [x] Fase tracker (Untap → Cleanup)
- [x] Gioco carte dalla mano al battlefield
- [x] Tap/untap carte
- [x] Zone: lands, creatures, other permanents, graveyard, exile
- [x] Contatori vita con +/-
- [x] Contatore turni

### UI/UX
- [x] Layout responsive (sidebar desktop, bottom tabs mobile)
- [x] Dashboard con statistiche e azioni rapide
- [x] Componenti UI riutilizzabili (Button, Input)
- [x] Navigazione con stato attivo
- [x] Prompt installazione PWA

### Documentazione
- [x] README.md completo
- [x] DECISIONS.md con scelte architetturali
- [x] MANUAL_STEPS.md con 9 step manuali
- [x] CHECKPOINT.md aggiornato
- [x] .env.local.example

## Da fare (azioni manuali dell'utente)
- Creare progetto Supabase e configurare .env.local (STEP 1)
- Eseguire migration database (STEP 2)
- Configurare Storage bucket (STEP 3)
- Creare repo GitHub e push (STEP 4)
- Deploy su Vercel (STEP 5)
- Verificare cron job (STEP 6)
- Generare icone PWA (STEP 7)
- Primo caricamento carte (STEP 8)
- Abilitare Supabase Auth (STEP 9)

## Note
- Build Next.js compila con zero errori TypeScript
- 17 route generate (mix static e dynamic)
- Middleware deprecation warning (Next.js 16 preferisce "proxy") — funziona comunque
- Tabelle game_lobbies, game_players, game_states pronte per fase 2 (multiplayer)

---

<!-- Claude: progetto completato -->
