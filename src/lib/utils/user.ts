/**
 * Deterministic visual helpers for rendering a user without an avatar image.
 * Used by UserCard (Community list) and the /u/[username] profile header so
 * both sides stay in sync — if the hash algorithm ever changed, users would
 * appear with different colors in different places.
 */

/** Hash a username into an HSL color. Stable for a given string. */
export function initialColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue}, 60%, 45%)`
}

/**
 * Extract up to 2 initials from a display name. Uses the first letter of the
 * first word plus the first letter of the last word; falls back to the first
 * two letters of a single-word name, or "?" for an empty input.
 */
export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
