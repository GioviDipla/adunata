-- ============================================================
-- Unbreak in-game chat (and library_view / peak / concede log path)
-- ============================================================
-- The DB carried two overloads of process_game_action:
--   * 11 args (no p_expected_seq) — the original signature
--   * 12 args (p_expected_seq DEFAULT NULL) — added later for OCC
--
-- Log-only actions call the RPC WITHOUT p_expected_seq. That call matched
-- BOTH overloads (the 12-arg one resolves p_expected_seq via its default),
-- which PostgREST rejects as ambiguous. Symptom: chat messages never
-- reached game_log, console.error in the client, UI silent.
--
-- State-mutating actions escaped because they pass p_expected_seq, which
-- only the 12-arg overload has.
--
-- Fix: drop the legacy 11-arg overload. The 12-arg version already skips
-- the OCC check when p_expected_seq IS NULL, so log-only calls behave
-- exactly as before — just unambiguously.
drop function if exists public.process_game_action(
  uuid, uuid, text, jsonb, text, integer, jsonb, integer, uuid, text, text
);
