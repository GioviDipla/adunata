-- ============================================================
-- The Gathering — Initial Database Schema
-- ============================================================

-- ===================
-- Utility: updated_at trigger function
-- ===================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ===================
-- 1. cards
-- ===================
create table public.cards (
  id             uuid primary key default gen_random_uuid(),
  scryfall_id    text unique not null,
  name           text not null,
  mana_cost      text,
  cmc            numeric,
  type_line      text,
  oracle_text    text,
  colors         text[],
  color_identity text[],
  rarity         text,
  set_code       text,
  set_name       text,
  collector_number text,
  image_small    text,
  image_normal   text,
  image_art_crop text,
  prices_usd     numeric,
  prices_usd_foil numeric,
  legalities     jsonb,
  power          text,
  toughness      text,
  keywords       text[],
  produced_mana  text[],
  layout         text,
  card_faces     jsonb,
  search_vector  tsvector,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Indexes on cards
create index idx_cards_search_vector on public.cards using gin (search_vector);
create index idx_cards_name          on public.cards (name);
create index idx_cards_set_code      on public.cards (set_code);
create index idx_cards_rarity        on public.cards (rarity);
create index idx_cards_cmc           on public.cards (cmc);

-- Auto-populate search_vector
create or replace function public.cards_search_vector_update()
returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.type_line, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.oracle_text, '')), 'C');
  return new;
end;
$$ language plpgsql;

create trigger trg_cards_search_vector
  before insert or update on public.cards
  for each row execute function public.cards_search_vector_update();

-- updated_at trigger
create trigger trg_cards_updated_at
  before update on public.cards
  for each row execute function public.handle_updated_at();

-- ===================
-- 2. sync_log
-- ===================
create table public.sync_log (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  cards_added   integer not null default 0,
  cards_updated integer not null default 0,
  status        text not null default 'running',
  error_message text
);

-- ===================
-- 3. decks
-- ===================
create table public.decks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  description   text,
  format        text,
  cover_card_id uuid references public.cards (id) on delete set null,
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_decks_user_id on public.decks (user_id);

-- updated_at trigger
create trigger trg_decks_updated_at
  before update on public.decks
  for each row execute function public.handle_updated_at();

-- ===================
-- 4. deck_cards
-- ===================
create table public.deck_cards (
  id         uuid primary key default gen_random_uuid(),
  deck_id    uuid not null references public.decks (id) on delete cascade,
  card_id    uuid not null references public.cards (id) on delete cascade,
  quantity   integer not null default 1 check (quantity > 0),
  board      text not null default 'main',
  created_at timestamptz not null default now(),
  unique (deck_id, card_id, board)
);

create index idx_deck_cards_deck_id on public.deck_cards (deck_id);

-- ===================
-- 5. game_lobbies
-- ===================
create table public.game_lobbies (
  id           uuid primary key default gen_random_uuid(),
  host_user_id uuid references auth.users (id) on delete set null,
  lobby_code   text unique not null,
  format       text,
  status       text not null default 'waiting',
  max_players  integer not null default 2,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- updated_at trigger
create trigger trg_game_lobbies_updated_at
  before update on public.game_lobbies
  for each row execute function public.handle_updated_at();

-- ===================
-- 6. game_players
-- ===================
create table public.game_players (
  id            uuid primary key default gen_random_uuid(),
  lobby_id      uuid not null references public.game_lobbies (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  deck_id       uuid references public.decks (id) on delete set null,
  seat_position integer,
  life_total    integer not null default 20,
  joined_at     timestamptz not null default now(),
  unique (lobby_id, user_id)
);

-- ===================
-- 7. game_states
-- ===================
create table public.game_states (
  id               uuid primary key default gen_random_uuid(),
  lobby_id         uuid not null references public.game_lobbies (id) on delete cascade,
  state_data       jsonb,
  turn_number      integer not null default 0,
  active_player_id uuid references auth.users (id) on delete set null,
  phase            text,
  updated_at       timestamptz not null default now()
);

-- updated_at trigger
create trigger trg_game_states_updated_at
  before update on public.game_states
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

-- Enable RLS
alter table public.cards         enable row level security;
alter table public.decks         enable row level security;
alter table public.deck_cards    enable row level security;
alter table public.game_lobbies  enable row level security;
alter table public.game_players  enable row level security;
alter table public.game_states   enable row level security;

-- ----- cards policies -----
create policy "Cards are publicly readable"
  on public.cards for select
  using (true);

-- ----- decks policies -----
create policy "Users can view their own decks"
  on public.decks for select
  using (user_id = auth.uid());

create policy "Users can view public decks"
  on public.decks for select
  using (is_public = true);

create policy "Users can insert their own decks"
  on public.decks for insert
  with check (user_id = auth.uid());

create policy "Users can update their own decks"
  on public.decks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own decks"
  on public.decks for delete
  using (user_id = auth.uid());

-- ----- deck_cards policies -----
create policy "Users can view cards in their own decks"
  on public.deck_cards for select
  using (deck_id in (select id from public.decks where user_id = auth.uid()));

create policy "Users can insert cards in their own decks"
  on public.deck_cards for insert
  with check (deck_id in (select id from public.decks where user_id = auth.uid()));

create policy "Users can update cards in their own decks"
  on public.deck_cards for update
  using (deck_id in (select id from public.decks where user_id = auth.uid()))
  with check (deck_id in (select id from public.decks where user_id = auth.uid()));

create policy "Users can delete cards in their own decks"
  on public.deck_cards for delete
  using (deck_id in (select id from public.decks where user_id = auth.uid()));

-- ----- game_lobbies policies -----
create policy "Anyone can view game lobbies"
  on public.game_lobbies for select
  using (true);

create policy "Users can create their own lobbies"
  on public.game_lobbies for insert
  with check (host_user_id = auth.uid());

create policy "Hosts can update their own lobbies"
  on public.game_lobbies for update
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid());

create policy "Hosts can delete their own lobbies"
  on public.game_lobbies for delete
  using (host_user_id = auth.uid());

-- ----- game_players policies -----
create policy "Users can view players in accessible lobbies"
  on public.game_players for select
  using (
    lobby_id in (select id from public.game_lobbies)
  );

create policy "Users can join lobbies as themselves"
  on public.game_players for insert
  with check (user_id = auth.uid());

create policy "Users can update their own player record"
  on public.game_players for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can remove themselves from lobbies"
  on public.game_players for delete
  using (user_id = auth.uid());

-- ----- game_states policies -----
create policy "Players can view game state of their lobbies"
  on public.game_states for select
  using (
    lobby_id in (
      select lobby_id from public.game_players where user_id = auth.uid()
    )
  );

create policy "Players can update game state of their lobbies"
  on public.game_states for update
  using (
    lobby_id in (
      select lobby_id from public.game_players where user_id = auth.uid()
    )
  );
