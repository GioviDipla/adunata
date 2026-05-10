import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const isGoblinAI = host.startsWith('goblinai.')

  // goblinai subdomain: rewrite root → /goblinai path for Next.js routing
  if (isGoblinAI && request.nextUrl.pathname === '/') {
    request.nextUrl.pathname = '/goblinai'
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
