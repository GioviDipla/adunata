-- Denormalize decks.card_count: store the running total of main+commander
-- card quantities directly on the decks row, maintained in sync by a
-- trigger on deck_cards. /decks page can then read the count as a plain
-- column without any aggregate on each fetch.

-- 1. Add the column with a safe default.
ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS card_count integer NOT NULL DEFAULT 0;

-- 2. Backfill existing rows from deck_cards (main + commander only, matching
--    the old client-side reducer in /decks/page.tsx).
UPDATE public.decks d
SET card_count = COALESCE((
  SELECT SUM(dc.quantity)
  FROM public.deck_cards dc
  WHERE dc.deck_id = d.id
    AND dc.board IN ('main', 'commander')
), 0);

-- 3. Trigger function: keeps decks.card_count in sync with deck_cards.
--    AFTER trigger so the row is already committed; security definer
--    so it bypasses RLS (which would otherwise block the UPDATE when
--    called from a client session with limited perms).
CREATE OR REPLACE FUNCTION public.sync_deck_card_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On DELETE or UPDATE, subtract the old contribution if the old row
  -- belonged to a counted board.
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
    IF OLD.board IN ('main', 'commander') THEN
      UPDATE public.decks
      SET card_count = GREATEST(0, card_count - OLD.quantity)
      WHERE id = OLD.deck_id;
    END IF;
  END IF;

  -- On INSERT or UPDATE, add the new contribution if the new row
  -- belongs to a counted board.
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.board IN ('main', 'commander') THEN
      UPDATE public.decks
      SET card_count = card_count + NEW.quantity
      WHERE id = NEW.deck_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Attach the trigger. DROP first so the migration is idempotent.
DROP TRIGGER IF EXISTS sync_deck_card_count_trg ON public.deck_cards;
CREATE TRIGGER sync_deck_card_count_trg
AFTER INSERT OR UPDATE OR DELETE ON public.deck_cards
FOR EACH ROW EXECUTE FUNCTION public.sync_deck_card_count();
