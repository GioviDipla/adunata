-- One-shot summary RPC for the /decks page.
-- Returns deck metadata + card_count (SUM of quantity on main+commander)
-- + cover fields, all in a single round-trip. Replaces the previous
-- pattern of selecting every deck_cards row just to sum quantity
-- client-side (hundreds of rows transferred for a handful of totals).

create or replace function public.get_my_decks_summary(p_user_id uuid)
returns table (
  deck_id uuid,
  name text,
  format text,
  visibility text,
  updated_at timestamptz,
  card_count bigint,
  cover_card_id uuid,
  cover_name text,
  cover_image_small text,
  cover_image_normal text,
  cover_image_art_crop text
)
language sql
stable
security invoker
as $$
  with covers as (
    select distinct on (d.id)
      d.id as deck_id,
      c.id as cover_card_id,
      c.name as cover_name,
      c.image_small as cover_image_small,
      c.image_normal as cover_image_normal,
      c.image_art_crop as cover_image_art_crop
    from public.decks d
    left join public.deck_cards dc
      on dc.deck_id = d.id
     and dc.board in ('commander', 'main')
    left join public.cards c on c.id = dc.card_id
    where d.user_id = p_user_id
    order by
      d.id,
      (case when dc.board = 'commander' then 0 when dc.board = 'main' then 1 else 2 end),
      dc.created_at nulls last
  ),
  counts as (
    select
      dc.deck_id,
      sum(dc.quantity)::bigint as card_count
    from public.deck_cards dc
    join public.decks d on d.id = dc.deck_id
    where d.user_id = p_user_id
      and dc.board in ('main', 'commander')
    group by dc.deck_id
  )
  select
    d.id,
    d.name,
    d.format,
    d.visibility,
    d.updated_at,
    coalesce(cn.card_count, 0)::bigint,
    cv.cover_card_id,
    cv.cover_name,
    cv.cover_image_small,
    cv.cover_image_normal,
    cv.cover_image_art_crop
  from public.decks d
  left join covers cv on cv.deck_id = d.id
  left join counts cn on cn.deck_id = d.id
  where d.user_id = p_user_id
  order by d.updated_at desc;
$$;

grant execute on function public.get_my_decks_summary(uuid) to authenticated, service_role;
