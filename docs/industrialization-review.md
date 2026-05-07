# Adunata Industrialization Review

Updated: 2026-04-28

## Executive Summary

Adunata has a strong product core: deck building, import, card search, collection overlay, goldfish and 1v1 live play. The main risks before treating it as an industrializable product are data correctness, performance predictability, visual polish consistency, and operational observability.

The app should be hardened in four waves:

1. Stabilize card data/search/prices.
2. Remove UI jank and interaction glitches from card-heavy screens.
3. Add production diagnostics, regression tests and DB health checks.
4. Productize onboarding, empty states, mobile flows and failure recovery.

## Critical Technical Findings

### Card Search And Prices

- Add trigram indexes for `cards.name` and `cards.name_it`; `%query%` search cannot rely on btree indexes.
- Use one canonical price policy everywhere: EUR/Cardmarket primary, USD/TCGPlayer fallback, and never label fallback USD as EUR.
- Add a stable DB sort key (`price_sort`) for card browser sorting so cards without EUR but with USD do not disappear from meaningful price ordering.
- Keep daily bulk sync as the main price source, but add a health check showing latest bulk version, last successful sync, row count, null EUR count, and stale rows.
- Make `/api/cards/search` cache-aware and defensive: cap Scryfall fallback, abort duplicate client requests, and return source/latency metadata in development.

### Schema And Types

- Regenerate Supabase types from the live DB. Current hand-maintained types appear inconsistent around `cards.id` and several later columns.
- Add migrations for every column assumed by code (`name_it`, `prices_eur`, `released_at`, `last_price_update`, trigger flags) to make fresh installs reproducible.
- Add DB constraints for enum-like fields: deck card board, card rarity, game lobby status, collection condition.
- Add uniqueness that matches current behavior: deck cards now merge by `(deck_id, card_id, board, is_foil)`, while the initial migration only has `(deck_id, card_id, board)`.

### Rendering And UX Performance

- Keep Supabase browser clients stable with `useMemo` or module-level singletons; recreating clients changes callback identities and can refetch under active filters.
- Avoid localStorage-driven layout shifts by deriving initial grid columns from CSS/responsive defaults and applying persisted overrides after hydration with no skeleton jump.
- Reduce card image overdraw: use `next/image` consistently on browse/detail surfaces, avoid `unoptimized` hover previews where possible, and centralize card preview behavior.
- Virtualize long deck lists and collection lists once they exceed about 100 visual rows.
- Split very large client components (`PlayGame`, `DeckEditor`, `CardBrowser`, `DeckStats`) into smaller state islands to improve React Compiler optimization.

### Reliability And Testing

- Add Playwright smoke tests for: search, add-to-deck, import decklist, switch printing, price display, collection overlay, lobby create/join.
- Add route-handler unit/integration tests for `/api/cards/search`, bulk import, collection merge and deck card update semantics.
- Add DB migration tests on a clean Supabase instance or local Postgres container.
- Track core web vitals and route latency in production; card browser and deck editor need real device telemetry.
- Add structured logging around Scryfall calls, cron runs, import failures and Supabase RPC errors.

## Product And UX Improvements

### Visual Polish

- Define a compact design system: spacing scale, elevation tokens, card surfaces, focus rings, badge colors and modal motion.
- Harmonize “tap vs long-press vs right-click” rules across card browser, deck grid and play surfaces; current gestures are powerful but cognitively heavy.
- Make all price labels explicit: `€12.30 Cardmarket`, `$8.50 TCGPlayer`, or `€12.30 + $8.50` when aggregating mixed fallback currencies.
- Add skeletons that match final layout dimensions to avoid content jumps.
- Improve mobile deck editing with a bottom action sheet as the primary pattern, not a context-menu derivative.

### Functional Productization

- Add import preview before committing: recognized cards, exact printings, unresolved cards, estimated value, duplicates and board assignment.
- Add “data freshness” indicators for prices and card catalog.
- Add recoverable errors: failed Scryfall lookup, failed add-to-deck, failed cron sync and partial bulk import should show actionable retry paths.
- Add account-level preferences: default search language, default deck view, default currency display, preferred board grouping.
- Add admin-only health page behind server-side authorization for sync status, DB counts, recent API errors and cron results.

### Onboarding And Retention

- Add first-run checklist: import first deck, add collection CSV, run goldfish, share public profile.
- Improve empty states with direct actions and examples.
- Add sample/demo deck for unauthenticated exploration.
- Make public deck pages richer: preview image, mana curve, value, commander, import/copy button.

## Suggested Roadmap

### Week 1: Stabilization

- Apply DB migration for search/price indexes and missing card columns.
- Regenerate Supabase types and fix compile fallout.
- Fix price display and sorting across card browser, deck content, stats and overlay.
- Add abort/race protection to all search boxes.

### Week 2: Performance

- Profile `/cards`, `/decks/[id]`, goldfish and 1v1 game on a mid-range mobile device.
- Replace raw `<img>` on user-facing card grids with a consistent image component strategy.
- Split `PlayGame`, `DeckEditor`, and `CardBrowser` into smaller memo-friendly components.
- Add route latency and cron result logging.

### Week 3: Product Polish

- Redesign card action surfaces for mobile and desktop separately.
- Add import preview and failure correction workflow.
- Add data freshness and price source badges.
- Improve onboarding and public deck presentation.

### Week 4: Release Readiness

- Add Playwright smoke suite.
- Add DB migration CI check.
- Add production monitoring dashboards.
- Document operational runbooks for Scryfall outage, failed cron, bad migration and Supabase performance degradation.
