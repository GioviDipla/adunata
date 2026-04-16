-- Batch RPC: read state + insert log + update state in one transaction
-- Replaces 3 sequential queries from the action route handler
CREATE OR REPLACE FUNCTION process_game_action(
  p_lobby_id uuid,
  p_player_id uuid,
  p_action text,
  p_action_data jsonb,
  p_action_text text,
  p_action_seq integer,
  p_new_state jsonb,
  p_turn_number integer,
  p_active_player_id uuid,
  p_phase text,
  p_log_type text DEFAULT 'action'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state_row record;
  v_current_seq integer;
BEGIN
  -- 1. Read current state (with row lock to prevent concurrent mutations)
  SELECT id, (state_data->>'lastActionSeq')::integer AS last_seq
    INTO v_state_row
    FROM public.game_states
   WHERE lobby_id = p_lobby_id
   FOR UPDATE;

  IF v_state_row IS NULL THEN
    RETURN jsonb_build_object('error', 'Game not found');
  END IF;

  v_current_seq := v_state_row.last_seq;

  -- 2. Insert game log entry
  INSERT INTO public.game_log (lobby_id, seq, player_id, action, data, text, type)
  VALUES (p_lobby_id, p_action_seq, p_player_id, p_action, p_action_data, p_action_text, p_log_type);

  -- 3. Update game state
  UPDATE public.game_states
     SET state_data = p_new_state,
         turn_number = p_turn_number,
         active_player_id = p_active_player_id,
         phase = p_phase,
         updated_at = now()
   WHERE id = v_state_row.id;

  RETURN jsonb_build_object('ok', true, 'prev_seq', v_current_seq);
END;
$$;
