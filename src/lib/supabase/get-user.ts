import { cache } from 'react'
import { createClient } from './server'

/**
 * Request-scoped cached wrapper around `supabase.auth.getUser()`.
 *
 * `supabase.auth.getUser()` hits the Supabase auth endpoint over the network
 * to validate the JWT. When layout + page + nested server components each
 * call `createClient()` and `getUser()` independently, we trigger N auth
 * round-trips per navigation. React's `cache()` dedupes the call within a
 * single request so layout and page share the same validated user.
 *
 * Usage:
 *   const user = await getAuthenticatedUser()
 *   if (!user) redirect('/login')
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
