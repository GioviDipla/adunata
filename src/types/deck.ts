/**
 * Shared deck-related type shapes used across server + client boundaries.
 *
 * `SectionRow` mirrors the `deck_sections` row narrowed to the columns the
 * UI cares about. We keep it explicit here (instead of re-exporting the
 * Supabase-generated type) so server components can pass a plain object
 * across the client boundary without dragging the generated types into
 * every consumer.
 */
export interface SectionRow {
  id: string
  name: string
  position: number
  color: string | null
  is_collapsed?: boolean
}
