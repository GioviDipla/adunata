-- Batch update RPCs to replace N+1 sequential UPDATE loops
-- in route handlers with single round-trip calls.

-- auto-assign sections (updates section_id per deck card)
CREATE OR REPLACE FUNCTION public.batch_update_deck_card_sections(
  p_updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.deck_cards dc
  SET section_id = u.section_id
  FROM jsonb_to_recordset(p_updates) AS u(id uuid, section_id uuid)
  WHERE dc.id = u.id;
END;
$$;

-- collection bulk-import / add-to-collection (updates quantity)
CREATE OR REPLACE FUNCTION public.batch_update_user_cards_quantity(
  p_updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.user_cards uc
  SET quantity = u.quantity
  FROM jsonb_to_recordset(p_updates) AS u(id uuid, quantity int)
  WHERE uc.id = u.id;
END;
$$;

-- deck cards bulk-import (updates quantity)
CREATE OR REPLACE FUNCTION public.batch_update_deck_card_quantities(
  p_updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.deck_cards dc
  SET quantity = u.quantity
  FROM jsonb_to_recordset(p_updates) AS u(id uuid, quantity int)
  WHERE dc.id = u.id;
END;
$$;
