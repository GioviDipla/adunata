create table public.deck_tokens (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  name text not null,
  power text,
  toughness text,
  colors text[] default '{}',
  type_line text not null default 'Token Creature',
  keywords text[] default '{}',
  image_url text,
  created_at timestamptz default now()
);

alter table public.deck_tokens enable row level security;

create policy "Users can view tokens in own or public decks"
  on public.deck_tokens for select to authenticated
  using (deck_id in (select id from public.decks where user_id = auth.uid() or visibility = 'public'));

create policy "Users can insert tokens in own decks"
  on public.deck_tokens for insert to authenticated
  with check (deck_id in (select id from public.decks where user_id = auth.uid()));

create policy "Users can update tokens in own decks"
  on public.deck_tokens for update to authenticated
  using (deck_id in (select id from public.decks where user_id = auth.uid()));

create policy "Users can delete tokens in own decks"
  on public.deck_tokens for delete to authenticated
  using (deck_id in (select id from public.decks where user_id = auth.uid()));
