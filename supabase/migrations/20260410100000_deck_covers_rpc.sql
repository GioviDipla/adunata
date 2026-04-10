-- RPC that returns one row per deck: the deck's commander (if any) or
-- the first main-deck card (by created_at), with the fields needed to
-- render a thumbnail on /decks. Falls back to a row with null card fields
-- for decks that have no commander or main cards yet.

create or replace function public.get_deck_covers(p_user_id uuid)
returns table (
  deck_id uuid,
  card_id uuid,
  card_name text,
  image_small text,
  image_normal text,
  image_art_crop text
)
language sql
stable
security invoker
as $$
  select distinct on (d.id)
    d.id,
    c.id,
    c.name,
    c.image_small,
    c.image_normal,
    c.image_art_crop
  from public.decks d
  left join public.deck_cards dc
    on dc.deck_id = d.id
   and dc.board in ('commander', 'main')
  left join public.cards c on c.id = dc.card_id
  where d.user_id = p_user_id
  order by
    d.id,
    (case when dc.board = 'commander' then 0 when dc.board = 'main' then 1 else 2 end),
    dc.created_at nulls last;
$$;

grant execute on function public.get_deck_covers(uuid) to authenticated, service_role;
