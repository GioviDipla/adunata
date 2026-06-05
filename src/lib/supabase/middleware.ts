import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function getCookieDomain(request: NextRequest): string | undefined {
  const host = request.headers.get('host') ?? ''
  if (host.endsWith('studiob35.com')) return '.studiob35.com'
  return undefined
}

export async function updateSession(request: NextRequest, extraRequestHeaders?: Headers) {
  const cookieDomain = getCookieDomain(request)
  // When the caller passes additional request headers (e.g. the
  // middleware uses this to surface the current pathname to RSC
  // layouts), propagate them onto the request seen by Next so they
  // appear in `headers()` further down the tree.
  let supabaseResponse = NextResponse.next(
    extraRequestHeaders ? { request: { headers: extraRequestHeaders } } : { request },
  )
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next(
            extraRequestHeaders ? { request: { headers: extraRequestHeaders } } : { request },
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              domain: cookieDomain,
            })
          )
        },
      },
    }
  )

  await supabase.auth.getUser()
  return supabaseResponse
}
