-- Auto-update decks.updated_at when deck_cards rows change.
-- Replaces manual UPDATE decks SET updated_at = now() in 6+ route handlers.

CREATE OR REPLACE FUNCTION public.touch_deck_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.decks SET updated_at = now()
  WHERE id = COALESCE(NEW.deck_id, OLD.deck_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_deck_cards_touch_deck ON public.deck_cards;
CREATE TRIGGER trg_deck_cards_touch_deck
  AFTER INSERT OR UPDATE OR DELETE ON public.deck_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_deck_updated_at();
