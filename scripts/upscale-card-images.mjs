import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const REALESRGAN_BIN = process.env.REALESRGAN_BIN
const REALESRGAN_MODEL_PATH = process.env.REALESRGAN_MODEL_PATH
const REALESRGAN_MODEL = process.env.REALESRGAN_MODEL ?? 'realesr-animevideov3'
const REALESRGAN_TILE_SIZE = process.env.REALESRGAN_TILE_SIZE ?? '0'

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase env')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function readPngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error('Invalid PNG signature')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  }
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseArgs(argv) {
  const args = new Map()
  for (const arg of argv) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split(/=(.*)/s)
      args.set(key, value)
    } else if (arg.startsWith('--')) {
      args.set(arg.slice(2), true)
    }
  }
  return {
    limit: Number(args.get('limit') ?? 25),
    concurrency: Number(args.get('concurrency') ?? 1),
    profile: String(args.get('profile') ?? 'hd-2x'),
    assetId: args.get('asset-id') ? String(args.get('asset-id')) : null,
    dryRun: args.get('dry-run') === true,
    keepTemp: args.get('keep-temp') === true,
    watch: args.get('watch') === true,
    pollIntervalSec: Number(args.get('poll-interval-sec') ?? 30),
    workerId: String(args.get('worker-id') ?? `${os.hostname()}-${process.pid}`),
    staleAfterMin: Number(args.get('stale-after-min') ?? 30),
    maxAttempts: Number(args.get('max-attempts') ?? 3),
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function selectAssets(options) {
  const staleCutoff = new Date(Date.now() - options.staleAfterMin * 60_000).toISOString()
  let query = supabase
    .from('card_image_assets')
    .select('*')
    .eq('target_profile', options.profile)
    .lt('attempts', options.maxAttempts)
    .order('created_at', { ascending: true })
    .limit(options.limit)

  if (options.assetId) query = query.eq('id', options.assetId)
  else query = query.or(`status.eq.queued,and(status.eq.processing,locked_at.lt.${staleCutoff})`)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function markProcessing(asset, options) {
  const { data, error } = await supabase
    .from('card_image_assets')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
      locked_by: options.workerId,
      attempts: asset.attempts + 1,
      last_error: null,
    })
    .eq('id', asset.id)
    .in('status', ['queued', 'processing'])
    .select('*')
    .single()
  if (error) throw error
  return data
}

async function downloadSource(asset, filePath) {
  const res = await fetch(asset.source_url)
  if (!res.ok) throw new Error(`source download failed: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  await writeFile(filePath, bytes)
}

function runUpscale(inputPath, outputPath) {
  if (!REALESRGAN_BIN) throw new Error('Missing REALESRGAN_BIN')
  if (!REALESRGAN_MODEL_PATH) throw new Error('Missing REALESRGAN_MODEL_PATH')

  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-o', outputPath,
      '-m', REALESRGAN_MODEL_PATH,
      '-n', REALESRGAN_MODEL,
      '-s', '2',
      '-t', REALESRGAN_TILE_SIZE,
      '-f', 'png',
    ]
    const child = spawn(REALESRGAN_BIN, args)
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

async function markFailed(assetId, err) {
  const message = err instanceof Error ? err.message : String(err)
  await supabase
    .from('card_image_assets')
    .update({
      status: 'failed',
      last_error: message.slice(0, 1000),
      locked_at: null,
      locked_by: null,
    })
    .eq('id', assetId)
  return message
}

async function processAsset(asset, options) {
  const workDir = path.resolve('.tmp/upscale-card-images', asset.id)
  const inputPath = path.join(workDir, 'source')
  const outputPath = path.join(workDir, 'output.png')
  await mkdir(workDir, { recursive: true })

  try {
    const current = await markProcessing(asset, options)
    await downloadSource(current, inputPath)
    await runUpscale(inputPath, outputPath)
    const outputBytes = await readFile(outputPath)
    const dimensions = readPngDimensions(outputBytes)
    const checksum = sha256Hex(outputBytes)

    const upload = await supabase.storage
      .from('card-images-hd')
      .upload(current.storage_path, outputBytes, {
        contentType: 'image/png',
        upsert: true,
      })
    if (upload.error) throw upload.error

    const { error: updateError } = await supabase
      .from('card_image_assets')
      .update({
        status: 'ready',
        model: REALESRGAN_MODEL,
        scale: 2,
        target_dpi: 600,
        width_px: dimensions.width,
        height_px: dimensions.height,
        bytes: outputBytes.byteLength,
        mime_type: 'image/png',
        checksum,
        completed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq('id', current.id)

    if (updateError) throw updateError
    console.log(`ready ${current.id} ${dimensions.width}x${dimensions.height} ${current.storage_path}`)
  } catch (err) {
    const message = await markFailed(asset.id, err)
    console.error(`failed ${asset.id}: ${message}`)
  } finally {
    if (!options.keepTemp) await rm(workDir, { recursive: true, force: true })
  }
}

const options = parseArgs(process.argv.slice(2))
if (options.concurrency !== 1) {
  console.warn('concurrency is parsed but the first worker implementation processes sequentially; using concurrency=1')
}

async function runOnce() {
  const assets = await selectAssets(options)
  if (options.dryRun) {
    for (const asset of assets) {
      console.log(JSON.stringify({
        id: asset.id,
        status: asset.status,
        attempts: asset.attempts,
        source_url: asset.source_url,
        storage_path: asset.storage_path,
      }))
    }
    console.log(`selected=${assets.length}`)
    return assets.length
  }

  if (assets.length === 0) {
    console.log('selected=0')
    return 0
  }

  for (const asset of assets) {
    await processAsset(asset, options)
  }
  return assets.length
}

if (options.dryRun || !options.watch) {
  await runOnce()
} else {
  console.log(`watching queued card image assets every ${options.pollIntervalSec}s as ${options.workerId}`)
  for (;;) {
    const selected = await runOnce()
    if (selected === 0) await sleep(Math.max(1, options.pollIntervalSec) * 1000)
  }
}
