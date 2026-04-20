import { NextRequest, NextResponse } from 'next/server'

// Edge-cached image proxy for Scryfall card images.
//
// The proxy PDF generator needs raw JPEG bytes (jsPDF can't consume WebP/AVIF),
// so we can't route through the Next.js Image Optimizer. Instead, this route
// fetches the original JPEG from Scryfall once per URL, then Vercel's CDN
// serves it from the edge for a year. Same-origin, no CORS, and a 100+ card
// deck warms the cache once — after that, every proxy-PDF build is local.

const ALLOWED_HOST = 'cards.scryfall.io'
const CACHE_HEADER = 'public, s-maxage=31536000, max-age=86400, immutable'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(url)
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }

  if (target.hostname !== ALLOWED_HOST) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 400 })
  }

  const upstream = await fetch(target.toString(), {
    // Upstream caching: tell Vercel's data cache to keep the bytes around.
    next: { revalidate: 31536000 },
  })

  if (!upstream.ok) {
    return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 })
  }

  const buffer = await upstream.arrayBuffer()
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': CACHE_HEADER,
    },
  })
}
