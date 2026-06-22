-- Revise search_public_decks:
-- 1. Dynamic cover (commander or first main card by created_at) instead of
--    the stored decks.cover_card_id, which is null for every public deck.
--    Mirrors get_deck_covers() so Pub Decks + dashboard render thumbnails.
-- 2. p_sort param: 'updated' (default) | 'created' | 'name' | 'likes' | 'price'.
-- 3. Return like_count + price_eur (total deck value, EUR) for display + sort.
--
-- Signature + return type changed (added p_sort, added like_count/price_eur
-- columns) → drop + create. Grant + search_path re-applied.

drop function if exists public.search_public_decks(
  text, text, text, text, text, text, text, text, int, int
);

create or replace function public.search_public_decks(
  p_name text default null,
  p_creator text default null,
  p_commander text default null,
  p_colors text default null,
  p_color_identity text default null,
  p_cards text default null,
  p_card_mode text default 'and',
  p_format text default null,
  p_sort text default 'updated',
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  description text,
  format text,
  card_count int,
  updated_at timestamptz,
  created_at timestamptz,
  user_id uuid,
  creator_username text,
  creator_display_name text,
  commander_card_id uuid,
  commander_name text,
  cover_card_id uuid,
  cover_image_art_crop text,
  cover_image_normal text,
  like_count int,
  price_eur numeric
)
language sql stable security invoker as $$
  select
    d.id, d.name, d.description, d.format, d.card_count, d.updated_at, d.created_at,
    d.user_id,
    pr.username as creator_username,
    pr.display_name as creator_display_name,
    cmd.card_id as commander_card_id,
    cmd_card.name as commander_name,
    cov.cover_card_id,
    cov.image_art_crop as cover_image_art_crop,
    cov.image_normal as cover_image_normal,
    (select count(*)::int from public.deck_likes dl where dl.deck_id = d.id) as like_count,
    (
      select coalesce(sum(dc.quantity * coalesce(c.prices_eur, 0)), 0)::numeric
      from public.deck_cards dc
      join public.cards c on c.id = dc.card_id
      where dc.deck_id = d.id and dc.board in ('main', 'commander')
    ) as price_eur
  from public.decks d
  join public.profiles pr on pr.id = d.user_id
  left join lateral (
    select dc.card_id
    from public.deck_cards dc
    where dc.deck_id = d.id and dc.board = 'commander'
    order by dc.created_at
    limit 1
  ) cmd on true
  left join public.cards cmd_card on cmd_card.id = cmd.card_id
  -- Dynamic cover: commander first, else first main-deck card by created_at.
  left join lateral (
    select c.id as cover_card_id, c.image_art_crop, c.image_normal
    from public.deck_cards dc
    join public.cards c on c.id = dc.card_id
    where dc.deck_id = d.id and dc.board in ('commander', 'main')
    order by
      (case when dc.board = 'commander' then 0 when dc.board = 'main' then 1 else 2 end),
      dc.created_at nulls last
    limit 1
  ) cov on true
  where d.visibility = 'public'
    and (p_name is null or p_name = '' or d.name ilike '%' || p_name || '%')
    and (
      p_creator is null or p_creator = ''
      or pr.username ilike '%' || p_creator || '%'
      or pr.display_name ilike '%' || p_creator || '%'
    )
    and (p_commander is null or p_commander = '' or cmd_card.name ilike '%' || p_commander || '%')
    and (p_format is null or p_format = '' or d.format = p_format)
    and (
      p_colors is null or p_colors = '' or (
        select count(distinct col) from (
          select distinct unnest(c.colors) as col
          from public.deck_cards dc
          join public.cards c on c.id = dc.card_id
          where dc.deck_id = d.id and dc.board in ('main','commander')
        ) s
        where col = any(string_to_array(p_colors, ','))
      ) = array_length(string_to_array(p_colors, ','), 1)
    )
    and (
      p_color_identity is null or p_color_identity = '' or (
        select count(distinct ci) from (
          select distinct unnest(c.color_identity) as ci
          from public.deck_cards dc
          join public.cards c on c.id = dc.card_id
          where dc.deck_id = d.id and dc.board in ('main','commander')
        ) s
        where ci = any(string_to_array(p_color_identity, ','))
      ) = array_length(string_to_array(p_color_identity, ','), 1)
    )
    and (
      p_cards is null or p_cards = '' or (
        case when p_card_mode = 'or' then
          exists(
            select 1 from public.deck_cards dc
            where dc.deck_id = d.id
              and dc.card_id::text = any(string_to_array(p_cards, ','))
          )
        else
          (
            select count(distinct dc.card_id) from public.deck_cards dc
            where dc.deck_id = d.id
              and dc.card_id::text = any(string_to_array(p_cards, ','))
          ) = array_length(string_to_array(p_cards, ','), 1)
        end
      )
    )
  order by
    -- numeric sorts (descending): likes, price, created
    case
      when p_sort = 'likes'  then (select count(*)::float8 from public.deck_likes dl where dl.deck_id = d.id)
      when p_sort = 'price'  then (
        select coalesce(sum(dc.quantity * coalesce(c.prices_eur, 0)), 0)::float8
        from public.deck_cards dc
        join public.cards c on c.id = dc.card_id
        where dc.deck_id = d.id and dc.board in ('main', 'commander')
      )
      when p_sort = 'created' then extract(epoch from d.created_at)::float8
      else null
    end desc nulls last,
    -- text sort (ascending): name
    case when p_sort = 'name' then d.name end asc nulls last,
    -- default + tiebreaker
    d.updated_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_public_decks(
  text, text, text, text, text, text, text, text, text, int, int
) to authenticated;

alter function public.search_public_decks(
  text, text, text, text, text, text, text, text, text, int, int
) set search_path = public, pg_catalog;
