-- supabase/migrations/20260410130000_social_foundation.sql

-- =====================================================================
-- 1. Extensions
-- =====================================================================
create extension if not exists pg_trgm;

-- =====================================================================
-- 2. profiles table
-- =====================================================================
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            text unique not null,
  display_name        text not null,
  bio                 text,
  username_changed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint display_name_length check (char_length(display_name) between 1 and 40),
  constraint bio_length check (bio is null or char_length(bio) <= 240)
);

create index idx_profiles_username_trgm on public.profiles
  using gin (username gin_trgm_ops);
create index idx_profiles_display_name_trgm on public.profiles
  using gin (lower(display_name) gin_trgm_ops);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- =====================================================================
-- 3. decks.visibility column
-- =====================================================================
alter table public.decks
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public'));

create index idx_decks_visibility on public.decks (visibility)
  where visibility = 'public';

-- =====================================================================
-- 4. Auto-create profile trigger
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  base_username text;
  final_username text;
  counter int := 0;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '_', 'g'));
  base_username := substring(base_username from 1 for 20);

  if char_length(base_username) < 3 then
    base_username := base_username || 'usr';
  end if;

  final_username := base_username;
  while exists(select 1 from public.profiles where username = final_username) loop
    counter := counter + 1;
    final_username := base_username || counter::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, final_username, split_part(new.email, '@', 1));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 5. Username cooldown trigger
-- =====================================================================
create or replace function public.enforce_username_cooldown()
returns trigger
language plpgsql
as $$
begin
  if old.username is distinct from new.username then
    if old.username_changed_at is not null
       and now() - old.username_changed_at < interval '15 days' then
      raise exception 'Username can only be changed once every 15 days'
        using errcode = 'P0001',
              hint = 'next_change_allowed_at=' || (old.username_changed_at + interval '15 days')::text;
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_profiles_username_cooldown
  before update on public.profiles
  for each row execute function public.enforce_username_cooldown();

-- =====================================================================
-- 6. RLS policies
-- =====================================================================
alter table public.profiles enable row level security;

create policy "Authenticated users can view all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Update decks SELECT policy for visibility
drop policy if exists "Users can view their own decks" on public.decks;

create policy "Users can view own or public decks"
  on public.decks for select
  to authenticated
  using (user_id = auth.uid() or visibility = 'public');

-- Update deck_cards SELECT policy for visibility cascade
drop policy if exists "Users can view cards in their own decks" on public.deck_cards;

create policy "Users can view cards in own or public decks"
  on public.deck_cards for select
  to authenticated
  using (
    deck_id in (
      select id from public.decks
      where user_id = auth.uid() or visibility = 'public'
    )
  );

-- =====================================================================
-- 7. SQL functions: get_profile_stats
-- =====================================================================
create or replace function public.get_profile_stats(p_username text)
returns table (
  public_deck_count int,
  total_deck_count int,
  favorite_format text,
  color_frequencies jsonb,
  latest_commander jsonb,
  most_used_card jsonb,
  unique_cards_count int
)
language sql stable security invoker as $$
  with target as (
    select id from public.profiles where username = p_username
  ),
  visible_decks as (
    select d.* from public.decks d
    join target t on d.user_id = t.id
  ),
  deck_count as (
    select
      count(*) filter (where visibility = 'public')::int as public_count,
      count(*)::int as total_count
    from visible_decks
  ),
  top_format as (
    select format from visible_decks
    group by format
    order by count(*) desc
    limit 1
  ),
  color_agg as (
    select jsonb_object_agg(letter, cnt) as colors
    from (
      select ci as letter, count(distinct vd.id) as cnt
      from visible_decks vd
      join public.deck_cards dc on dc.deck_id = vd.id
      join public.cards c on c.id = dc.card_id
      cross join unnest(coalesce(c.color_identity, array[]::text[])) as ci
      group by ci
    ) t
  ),
  latest_cmd as (
    select jsonb_build_object(
      'id', c.id, 'name', c.name,
      'image_small', c.image_small, 'image_normal', c.image_normal
    ) as cmd
    from visible_decks vd
    join public.deck_cards dc on dc.deck_id = vd.id and dc.board = 'commander'
    join public.cards c on c.id = dc.card_id
    order by vd.updated_at desc
    limit 1
  ),
  most_used as (
    select jsonb_build_object('id', c.id, 'name', c.name, 'image_small', c.image_small) as card
    from public.deck_cards dc
    join visible_decks vd on vd.id = dc.deck_id
    join public.cards c on c.id = dc.card_id
    where c.type_line not ilike '%land%' and dc.board = 'main'
    group by c.id, c.name, c.image_small
    order by count(distinct vd.id) desc
    limit 1
  ),
  unique_count as (
    select count(distinct dc.card_id)::int as cnt
    from public.deck_cards dc
    join visible_decks vd on vd.id = dc.deck_id
  )
  select
    deck_count.public_count,
    deck_count.total_count,
    (select format from top_format),
    coalesce((select colors from color_agg), '{}'::jsonb),
    (select cmd from latest_cmd),
    (select card from most_used),
    (select cnt from unique_count)
  from deck_count;
$$;

grant execute on function public.get_profile_stats(text) to authenticated;

-- =====================================================================
-- 8. SQL functions: search_users
-- =====================================================================
create or replace function public.search_users(p_query text, p_limit int default 20)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  public_deck_count int
)
language sql stable security invoker as $$
  select
    p.id, p.username, p.display_name, p.bio,
    (select count(*)::int from public.decks d
     where d.user_id = p.id and d.visibility = 'public') as public_deck_count
  from public.profiles p
  where
    p.username ilike '%' || p_query || '%'
    or lower(p.display_name) ilike '%' || lower(p_query) || '%'
  order by
    (case when p.username = lower(p_query) then 0
          when p.username like lower(p_query) || '%' then 1
          else 2 end),
    similarity(p.username, p_query) desc
  limit p_limit;
$$;

grant execute on function public.search_users(text, int) to authenticated;

-- =====================================================================
-- 9. SQL functions: get_latest_users
-- =====================================================================
create or replace function public.get_latest_users(p_limit int default 10)
returns table (
  id uuid,
  username text,
  display_name text,
  public_deck_count int
)
language sql stable security invoker as $$
  select
    p.id, p.username, p.display_name,
    (select count(*)::int from public.decks d
     where d.user_id = p.id and d.visibility = 'public') as public_deck_count
  from public.profiles p
  order by p.created_at desc
  limit p_limit;
$$;

grant execute on function public.get_latest_users(int) to authenticated;

-- =====================================================================
-- 10. Backfill profiles for existing auth.users
-- =====================================================================
-- Uses the same collision-handling logic as handle_new_user() by iterating
-- each auth.users row and probing the profiles table with a while loop.
-- Guarantees correctness even when existing usernames share prefixes.
do $$
declare
  user_row auth.users%rowtype;
  base_username text;
  final_username text;
  counter int;
begin
  for user_row in select * from auth.users order by created_at loop
    if exists (select 1 from public.profiles where id = user_row.id) then
      continue;
    end if;

    base_username := lower(regexp_replace(split_part(user_row.email, '@', 1), '[^a-z0-9_]', '_', 'g'));
    base_username := substring(base_username from 1 for 20);

    if char_length(base_username) < 3 then
      base_username := base_username || 'usr';
    end if;

    final_username := base_username;
    counter := 0;
    while exists (select 1 from public.profiles where username = final_username) loop
      counter := counter + 1;
      final_username := base_username || counter::text;
    end loop;

    insert into public.profiles (id, username, display_name)
    values (user_row.id, final_username, split_part(user_row.email, '@', 1));
  end loop;
end;
$$;
