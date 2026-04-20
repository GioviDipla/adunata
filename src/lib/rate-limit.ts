import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// The Vercel Marketplace integration for Upstash injects env vars using the
// legacy KV_* prefix. When either value is missing we gracefully no-op so the
// app still works in dev environments without Redis provisioned.
const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      })
    : null

if (!redis && process.env.NODE_ENV === 'production') {
  console.warn(
    '[rate-limit] KV_REST_API_URL / KV_REST_API_TOKEN missing — rate limiting disabled',
  )
}

function makeLimiter(limit: number, window: `${number} s` | `${number} m`, prefix: string) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix,
  })
}

// Tuned per-endpoint based on expected human cadence:
//   - search: a user typing fast with debounce fires at most 5-10 req per burst,
//     so 20 / 10s gives generous headroom while still cutting off runaway loops.
//   - bulk: importing a decklist is a one-shot operation, 5 per minute is ample.
export const searchLimiter = makeLimiter(20, '10 s', 'rl:search')
export const bulkLimiter = makeLimiter(5, '60 s', 'rl:bulk')

/**
 * Resolve a stable identifier for the current caller. Authenticated users are
 * keyed by `u:<uid>` (one budget per real account); anonymous callers fall back
 * to their forwarded IP so a shared NAT still gets throttled collectively.
 */
export function getClientId(req: NextRequest, userId?: string | null): string {
  if (userId) return `u:${userId}`
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const ip =
    forwarded.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  return `ip:${ip}`
}

/**
 * Enforce a limit for the given id. Returns a ready-to-return 429 response when
 * the budget is exhausted; returns `null` when the request should proceed.
 * When the limiter is not configured (no Redis), always returns `null`.
 */
export async function enforceLimit(
  limiter: Ratelimit | null,
  id: string,
): Promise<NextResponse | null> {
  if (!limiter) return null
  const { success, limit, remaining, reset } = await limiter.limit(id)
  if (success) return null
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  return NextResponse.json(
    { error: 'Too many requests', limit, remaining, reset },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(reset),
        'Retry-After': String(retryAfter),
      },
    },
  )
}
