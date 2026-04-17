-- Obsolete: /decks now reads decks.card_count denormalized column directly.
DROP FUNCTION IF EXISTS public.get_my_decks_summary(uuid);
