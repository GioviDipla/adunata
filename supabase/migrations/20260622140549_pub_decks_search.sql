-- Index for the card-list filter: "deck contains card X" lookups by card_id.
-- Currently absent; needed as public-deck volume + filter usage grows.
create index if not exists idx_deck_cards_card_id on public.deck_cards(card_id);

-- Public deck search. All filters server-side. security invoker → RLS applies
-- (caller sees only decks/profiles/cards their role can read). Multi-value
-- params (p_colors, p_color_identity, p_cards) are comma-separated strings;
-- empty string or NULL = no filter for that field.
--
-- Color (p_colors):       deck has a card of EACH selected mana color (cards.colors).
-- Color identity (p_ci):  deck CI (union of cards.color_identity, boards main+commander)
--                         includes ALL selected.
-- Card list (p_cards):    p_card_mode='and' → deck contains ALL listed card_ids (any board);
--                         'or' → at least one present.
create or replace function public.search_public_decks(
  p_name text default null,
  p_creator text default null,
  p_commander text default null,
  p_colors text default null,
  p_color_identity text default null,
  p_cards text default null,
  p_card_mode text default 'and',
  p_format text default null,
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
  user_id uuid,
  creator_username text,
  creator_display_name text,
  commander_card_id uuid,
  commander_name text,
  cover_card_id uuid,
  cover_image_art_crop text,
  cover_image_normal text
)
language sql stable security invoker as $$
  select
    d.id, d.name, d.description, d.format, d.card_count, d.updated_at,
    d.user_id,
    pr.username as creator_username,
    pr.display_name as creator_display_name,
    cmd.card_id as commander_card_id,
    cmd_card.name as commander_name,
    d.cover_card_id,
    cov.image_art_crop as cover_image_art_crop,
    cov.image_normal as cover_image_normal
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
  left join public.cards cov on cov.id = d.cover_card_id
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
  order by d.updated_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_public_decks(
  text, text, text, text, text, text, text, text, int, int
) to authenticated;

alter function public.search_public_decks(
  text, text, text, text, text, text, text, text, int, int
) set search_path = public, pg_catalog;
