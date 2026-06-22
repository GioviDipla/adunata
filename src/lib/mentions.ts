export const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g

export type Mention = { name: string; cardId: string }

export function extractMentions(body: string): Mention[] {
  const out: Mention[] = []
  const seen = new Set<string>()
  for (const m of body.matchAll(MENTION_RE)) {
    const cardId = m[2]
    if (seen.has(cardId)) continue
    seen.add(cardId)
    out.push({ name: m[1], cardId })
  }
  return out
}

// User mentions: @username (3-24 chars, lowercase, digits, underscores)
// Must be preceded by whitespace or start of string
// Must not be inside a card mention (@[...](...))
export const USER_MENTION_RE = /(?:^|\s)@([a-z0-9_]{3,24})(?=\s|$|[.,!?:;)\]])/g

export function extractUserMentions(body: string): string[] {
  const usernames = new Set<string>()
  for (const m of body.matchAll(USER_MENTION_RE)) {
    usernames.add(m[1])
  }
  return Array.from(usernames)
}
