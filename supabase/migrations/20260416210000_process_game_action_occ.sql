-- Add optimistic concurrency control to process_game_action
-- New param p_expected_seq: if provided, checks lastActionSeq hasn't changed since read
-- Returns {error: 'stale_state'} on conflict, caller retries with fresh state
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
  p_log_type text DEFAULT 'action',
  p_expected_seq integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state_row record;
  v_current_seq integer;
BEGIN
  SELECT id, (state_data->>'lastActionSeq')::integer AS last_seq
    INTO v_state_row
    FROM public.game_states
   WHERE lobby_id = p_lobby_id
   FOR UPDATE;

  IF v_state_row IS NULL THEN
    RETURN jsonb_build_object('error', 'Game not found');
  END IF;

  v_current_seq := v_state_row.last_seq;

  IF p_expected_seq IS NOT NULL AND v_current_seq != p_expected_seq THEN
    RETURN jsonb_build_object('error', 'stale_state', 'current_seq', v_current_seq);
  END IF;

  INSERT INTO public.game_log (lobby_id, seq, player_id, action, data, text, type)
  VALUES (p_lobby_id, p_action_seq, p_player_id, p_action, p_action_data, p_action_text, p_log_type);

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
