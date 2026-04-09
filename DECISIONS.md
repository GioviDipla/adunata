# Decision Log — The Gathering

Questo file viene aggiornato automaticamente da Claude Code durante lo sviluppo.
Ogni riga documenta una scelta tecnica autonoma con la relativa motivazione.

---

## Architettura

- **Next.js 15 App Router** — Framework principale. App Router per Server Components, streaming, e layout nesting. Deploy nativo su Vercel con zero config.
- **Supabase** — Auth (email/password), PostgreSQL database, Storage (immagini carte). Free tier copre la fase iniziale.
- **Tailwind CSS v4** — Già usato nei mockup Pencil. Design system dark-themed con CSS variables.
- **PWA con next-pwa** — Service worker per offline support e installabilità su iOS/Android. Architettura compatibile con future build native (Capacitor).
- **Lucide React** — Iconografia già presente nei mockup.
- **TypeScript strict** — Type safety su tutto il codebase.

## Database

- **Carte MTG in Supabase PostgreSQL** — Tabella `cards` con full-text search via `tsvector`. Immagini referenziate da URL Scryfall.
- **Popolamento on-demand** — Le carte vengono scaricate da Scryfall solo quando servono (import decklist, ricerca). Nessun bulk sync. Il DB si riempie progressivamente con l'uso.
- **RLS (Row Level Security)** — Ogni utente vede solo i propri deck. Tabella `cards` leggibile pubblicamente. Policy Supabase native.

## Gestione Deck

- **Import multi-formato** — Parser per MTGO, Moxfield, Archidekt. Regex-based con fallback su nome carta.
- **Statistiche real-time** — Calcolate client-side dal contenuto del deck, no denormalizzazione.
- **Goldfish mode** — Simulazione prima pescata e mulligan. Logica shuffle Fisher-Yates client-side.

## Future-proofing

- **Schema `game_lobbies` e `game_states` predisposti** — Tabelle create ma non popolate. Pronti per matchmaking e tavolo virtuale.
- **Supabase Realtime** — Channel-based per future game sessions. Nessun WebSocket custom necessario.
- **Struttura componenti modulare** — Componenti game (battlefield, hand, zones) già separati nei mockup. Riutilizzabili per il tavolo virtuale.
