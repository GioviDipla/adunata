-- Deck sections + per-card tags
-- P0 from IMPLEMENTATIONS.md: sezioni e tag nei deck

create table public.deck_sections (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now()
);

create index deck_sections_deck_position_idx
  on public.deck_sections (deck_id, position);

-- Augment deck_cards with section link + free-form tag array
alter table public.deck_cards
  add column section_id uuid references public.deck_sections(id) on delete set null,
  add column tags text[] not null default '{}',
  add column position_in_section integer;

create index deck_cards_section_idx on public.deck_cards (section_id);
create index deck_cards_tags_gin_idx on public.deck_cards using gin (tags);

-- RLS
alter table public.deck_sections enable row level security;

create policy deck_sections_select_visible on public.deck_sections
  for select using (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id
        and (d.visibility = 'public' or d.user_id = auth.uid())
    )
  );

create policy deck_sections_mutate_owner on public.deck_sections
  for all using (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id and d.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id and d.user_id = auth.uid()
    )
  );
