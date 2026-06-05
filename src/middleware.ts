import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const isGoblinAI = host.startsWith('goblinai.')

  // goblinai subdomain: rewrite root → /goblinai path for Next.js routing
  if (isGoblinAI && request.nextUrl.pathname === '/') {
    request.nextUrl.pathname = '/goblinai'
  }

  // Expose the current pathname to RSC layouts via a request header so
  // they can make path-aware decisions (the deck-detail layout, for
  // instance, allows anon access to public/unlisted decks while every
  // other (app) route still gates on auth).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  return await updateSession(request, requestHeaders)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
