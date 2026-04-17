-- Tokens are now stored in deck_cards with board='tokens', same as any other card.
-- The deck_tokens table (with 3 orphan rows) is no longer referenced anywhere.
DROP TABLE IF EXISTS public.deck_tokens CASCADE;
