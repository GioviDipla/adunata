# The Gathering

A web platform for Magic: The Gathering players. Browse cards, build decks, test opening hands, and prepare for future multiplayer features.

## Features

- **Authentication** — Secure email/password auth via Supabase
- **Card Database** — Full MTG catalog from Scryfall with search, filters (color, type, rarity, CMC, set), and full-text search
- **Deck Management** — Create, edit, import (MTGO/Moxfield/Archidekt format), and export decks
- **Deck Statistics** — Mana curve, color distribution, type breakdown, estimated value, average CMC
- **Goldfish Mode** — Simulate opening hands with London mulligan, play cards to battlefield, tap/untap, track life and turns
- **PWA** — Installable on iOS/Android, offline support for visited pages
- **Auto-sync** — Monthly Scryfall data sync via Vercel Cron

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Icons | Lucide React |
| State | Zustand |
| Hosting | Vercel |
| Card Data | Scryfall API |

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase account ([supabase.com](https://supabase.com))
- A Vercel account for deployment ([vercel.com](https://vercel.com))

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/<your-username>/the-gathering.git
   cd the-gathering
   npm install
   ```

2. **Configure environment variables**

   Copy the example file and fill in your Supabase credentials:
   ```bash
   cp .env.local.example .env.local
   ```

   Required variables:
   - `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Your Supabase anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` — Your Supabase service role key
   - `CRON_SECRET` — A random secret for cron job authentication

3. **Set up the database**

   Option A — Using Supabase CLI:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   Option B — Copy the SQL from `supabase/migrations/20240101000000_initial_schema.sql` into the Supabase SQL Editor and run it.

4. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

5. **Load card data**

   Trigger the initial Scryfall sync:
   ```bash
   curl -X POST -H "Authorization: Bearer <your-CRON_SECRET>" http://localhost:3000/api/cron/sync-cards
   ```

   This downloads ~80k cards and may take several minutes.

### Deploy to Vercel

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add environment variables in Vercel project settings
4. Deploy — automatic deploys on push to `main`

The `vercel.json` file configures a monthly cron job for card data sync.

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login & register pages
│   ├── (app)/           # Authenticated app pages
│   │   ├── dashboard/   # User dashboard
│   │   ├── cards/       # Card browser
│   │   ├── decks/       # Deck list, create, edit, import, goldfish
│   │   └── profile/     # User profile
│   └── api/
│       ├── cards/       # Card lookup API
│       ├── cron/        # Scryfall sync cron
│       └── decks/       # Deck CRUD API
├── components/
│   ├── cards/           # Card browser components
│   ├── deck/            # Deck editor components
│   ├── goldfish/        # Goldfish mode components
│   └── ui/              # Shared UI components
├── lib/
│   ├── supabase/        # Supabase client configs
│   ├── hooks/           # Custom React hooks
│   └── scryfall.ts      # Scryfall API client
└── types/
    └── supabase.ts      # Database types
```

## Future Plans

The architecture is designed to support:

- **Multiplayer lobbies** — Database tables (`game_lobbies`, `game_players`, `game_states`) are already in place
- **Virtual tabletop** — Shared game state via Supabase Realtime channels
- **Native apps** — PWA-first approach, ready for Capacitor wrapping

See `DECISIONS.md` for detailed architectural decisions.

## Manual Steps

See `MANUAL_STEPS.md` for required manual configuration steps (Supabase setup, icon generation, etc).

## License

MIT
