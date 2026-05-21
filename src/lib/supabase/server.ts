import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_URL?.includes('studiob35') ? '.studiob35.com' : undefined

export async function createClient() {
  const cookieStore = await cookies()
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, domain: SITE_DOMAIN })
            )
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  )
}
