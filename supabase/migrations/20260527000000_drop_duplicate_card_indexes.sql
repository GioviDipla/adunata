-- Drop duplicate / redundant indexes on cards table to reclaim ~12 MB of DB space.
-- Free plan database size was at 99% (497/500 MB). These indexes were either
-- exact duplicates or fully covered by composite prefixes.
--
-- Removed:
--   * cards_last_price_update_idx       — covered by idx_cards_last_price_update (last_price_update, id)
--   * idx_cards_released_id_desc        — identical to idx_cards_released_at_id_desc
--   * idx_cards_released_at             — covered by idx_cards_released_at_id_desc prefix

DROP INDEX IF EXISTS public.cards_last_price_update_idx;
DROP INDEX IF EXISTS public.idx_cards_released_id_desc;
DROP INDEX IF EXISTS public.idx_cards_released_at;
