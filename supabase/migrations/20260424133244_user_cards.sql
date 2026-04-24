-- ============================================================
-- Collection (user_cards): per-user owned cards with foil /
-- language / condition splits and optional acquisition price.
-- ============================================================
-- Powers the `/collection` page and the deck owned/missing
-- overlay. RLS is strict owner-only; the only public query
-- surface is through RPCs or the user's own session.
-- Uniqueness on (user, card, foil, language, condition) so the
-- /api/collection POST can merge repeated adds by bumping
-- quantity instead of creating duplicate rows.

create table if not exists public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 0),
  foil boolean not null default false,
  language text not null default 'en',
  condition text check (condition in ('M','NM','LP','MP','HP','D')) default 'NM',
  acquired_at timestamptz default now(),
  acquired_price_eur numeric(10,2),
  notes text,
  unique (user_id, card_id, foil, language, condition)
);

create index if not exists user_cards_user_idx on public.user_cards (user_id);
create index if not exists user_cards_card_idx on public.user_cards (card_id);

alter table public.user_cards enable row level security;

drop policy if exists user_cards_select_own on public.user_cards;
create policy user_cards_select_own on public.user_cards
  for select using (user_id = auth.uid());

drop policy if exists user_cards_mutate_own on public.user_cards;
create policy user_cards_mutate_own on public.user_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
