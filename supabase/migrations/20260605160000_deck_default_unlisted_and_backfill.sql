-- ============================================================
-- Make 'unlisted' the new default for decks and migrate every legacy
-- 'private' deck to 'unlisted'. Rationale: most decks are shareable
-- by intent — the historical 'private' default was over-restrictive
-- and forced users to manually flip visibility before sending a link
-- to a friend. 'unlisted' keeps decks out of public listings and
-- search but lets link-based sharing work without any extra step.
--
-- Users who genuinely want private decks can flip them back via the
-- new visibility dropdown.
-- ============================================================

alter table public.decks alter column visibility set default 'unlisted';

update public.decks
   set visibility = 'unlisted'
 where visibility = 'private';
