create extension if not exists pg_trgm;

create table if not exists public.mtg_rules (
  id uuid primary key default gen_random_uuid(),
  rule_number text not null,
  parent_rule_number text,
  section_title text,
  text text not null,
  source_version text not null,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_number, source_version)
);

create index if not exists mtg_rules_rule_number_idx
  on public.mtg_rules (rule_number);

create index if not exists mtg_rules_keywords_gin_idx
  on public.mtg_rules using gin (keywords);

create index if not exists mtg_rules_text_trgm_idx
  on public.mtg_rules using gin (text gin_trgm_ops);

create table if not exists public.card_rulings (
  id uuid primary key default gen_random_uuid(),
  card_id integer not null references public.cards(id) on delete cascade,
  scryfall_oracle_id text,
  ruling_date date,
  text text not null,
  source text not null default 'scryfall',
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (card_id, ruling_date, text)
);

create index if not exists card_rulings_card_idx
  on public.card_rulings (card_id);

create index if not exists card_rulings_keywords_gin_idx
  on public.card_rulings using gin (keywords);

create table if not exists public.goblinai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goblinai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.goblinai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  mentioned_card_ids integer[] not null default '{}',
  interaction_keywords text[] not null default '{}',
  retrieved_rule_numbers text[] not null default '{}',
  retrieved_ruling_ids uuid[] not null default '{}',
  restatement_status text not null default 'none'
    check (restatement_status in ('none', 'pending_confirmation', 'confirmed')),
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists goblinai_messages_conversation_idx
  on public.goblinai_messages (conversation_id, created_at);

alter table public.mtg_rules enable row level security;
alter table public.card_rulings enable row level security;
alter table public.goblinai_conversations enable row level security;
alter table public.goblinai_messages enable row level security;

drop policy if exists mtg_rules_read_all on public.mtg_rules;
create policy mtg_rules_read_all on public.mtg_rules
  for select using (true);

drop policy if exists card_rulings_read_all on public.card_rulings;
create policy card_rulings_read_all on public.card_rulings
  for select using (true);

drop policy if exists goblinai_conversations_owner_all on public.goblinai_conversations;
create policy goblinai_conversations_owner_all on public.goblinai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists goblinai_messages_owner_all on public.goblinai_messages;
create policy goblinai_messages_owner_all on public.goblinai_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
