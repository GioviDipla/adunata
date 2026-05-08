import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''

  // goblinai subdomain → rewrite root to /goblinai
  if (host.startsWith('goblinai.') && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/goblinai'
    return NextResponse.rewrite(url)
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
