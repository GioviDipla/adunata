import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ALLOWED_HOST = 'cards.scryfall.io'
const CACHE_HEADER = 'public, s-maxage=31536000, max-age=86400, immutable'
const MAX_SOURCE_BYTES = 15 * 1024 * 1024

function contentExtension(contentType: string | null, target: URL): string {
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return '.jpg'
  const ext = path.extname(target.pathname).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
}

function runRealEsrgan(inputPath: string, outputPath: string): Promise<void> {
  const bin = process.env.REALESRGAN_BIN
  const modelPath = process.env.REALESRGAN_MODEL_PATH
  const model = process.env.REALESRGAN_EPIC_MODEL ?? process.env.REALESRGAN_MODEL_4X ?? 'realesrgan-x4plus'
  if (!bin) throw new Error('Missing REALESRGAN_BIN')
  if (!modelPath) throw new Error('Missing REALESRGAN_MODEL_PATH')

  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-o', outputPath,
      '-m', modelPath,
      '-n', model,
      '-s', '4',
      '-f', 'png',
    ]
    const child = spawn(bin, args)
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`realesrgan exited ${code}: ${stderr.slice(0, 1000)}`))
    })
  })
}

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

  if (!process.env.REALESRGAN_BIN || !process.env.REALESRGAN_MODEL_PATH) {
    return NextResponse.json({ error: 'epic upscaler unavailable' }, { status: 503 })
  }

  const workDir = path.join(os.tmpdir(), 'card-image-epic-upscale', randomUUID())
  await mkdir(workDir, { recursive: true })

  try {
    const upstream = await fetch(target.toString(), {
      next: { revalidate: 31536000 },
    })
    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 })
    }

    const sourceBytes = new Uint8Array(await upstream.arrayBuffer())
    if (sourceBytes.byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: 'source image too large' }, { status: 413 })
    }

    const inputPath = path.join(workDir, `source${contentExtension(upstream.headers.get('content-type'), target)}`)
    const outputPath = path.join(workDir, 'output.png')
    await writeFile(inputPath, sourceBytes)
    await runRealEsrgan(inputPath, outputPath)

    const output = await readFile(outputPath)
    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': CACHE_HEADER,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'epic upscale failed'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
