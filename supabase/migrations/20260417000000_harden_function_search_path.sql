-- Pin search_path on all user-defined functions to prevent role-mutable search_path warnings
-- and mitigate malicious object shadowing. See:
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

ALTER FUNCTION public.cards_search_vector_update() SET search_path = public, pg_catalog;
ALTER FUNCTION public.enforce_username_cooldown() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_deck_covers(p_user_id uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_distinct_sets() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_latest_users(p_limit integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_profile_stats(p_username text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION public.lookup_cards_by_names(card_names text[]) SET search_path = public, pg_catalog;
ALTER FUNCTION public.process_game_action(p_lobby_id uuid, p_player_id uuid, p_action text, p_action_data jsonb, p_action_text text, p_action_seq integer, p_new_state jsonb, p_turn_number integer, p_active_player_id uuid, p_phase text, p_log_type text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.process_game_action(p_lobby_id uuid, p_player_id uuid, p_action text, p_action_data jsonb, p_action_text text, p_action_seq integer, p_new_state jsonb, p_turn_number integer, p_active_player_id uuid, p_phase text, p_log_type text, p_expected_seq integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.search_users(p_query text, p_limit integer) SET search_path = public, pg_catalog;
