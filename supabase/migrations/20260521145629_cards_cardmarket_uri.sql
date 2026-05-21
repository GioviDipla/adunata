-- Add `cardmarket_uri` to `cards`: the authoritative product URL Scryfall
-- already resolves under `purchase_uris.cardmarket`. The previous slug-based
-- approach (build `/Singles/{set-slug}/{card-slug}` from Scryfall set/card
-- names) breaks on every case where Cardmarket's slug differs from a naive
-- normalization of the Scryfall name — special characters (Æ → Ae, æ → ae,
-- diacritics dropped to ASCII), em-dashes, double-faced card joining rules,
-- promo / collector booster / Universes Beyond set-name variants, and the
-- many sets whose Cardmarket title is not a 1:1 transliteration of the
-- Scryfall title. Storing Scryfall's URL means future buy links are correct
-- for every printing.

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS cardmarket_uri TEXT;

COMMENT ON COLUMN public.cards.cardmarket_uri IS
  'Cardmarket product URL for this printing, sourced from Scryfall `purchase_uris.cardmarket`. Authoritative — do not regenerate from set_name/name slugs.';
