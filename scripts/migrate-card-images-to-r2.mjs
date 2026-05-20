import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

dotenv.config({ path: '.env.local' })
dotenv.config()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_BUCKET = 'card-images-hd'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase env')
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  throw new Error('Missing R2 env (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

async function r2ObjectExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode
    if (status === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') return false
    throw err
  }
}

async function copyOne(storagePath) {
  if (await r2ObjectExists(storagePath)) return 'skipped'

  const { data: blob, error } = await supabase.storage.from(SUPABASE_BUCKET).download(storagePath)
  if (error || !blob) throw new Error(`download failed: ${storagePath} :: ${error?.message ?? 'no blob'}`)

  const buffer = Buffer.from(await blob.arrayBuffer())
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storagePath,
    Body: buffer,
    ContentType: blob.type || 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return 'copied'
}

async function listAllSupabaseObjects() {
  // Pull keys from card_image_assets instead of Storage.list (which times out
  // on large buckets). Every ready row's storage_path is the exact key.
  const all = []
  let from = 0
  const pageSize = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('card_image_assets')
      .select('storage_path')
      .eq('status', 'ready')
      .not('storage_path', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data.map((row) => row.storage_path))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  const all = await listAllSupabaseObjects()
  console.log(`Found ${all.length} objects in Supabase bucket ${SUPABASE_BUCKET}`)

  let copied = 0
  let skipped = 0
  let failed = 0
  let i = 0

  for (const key of all) {
    i++
    try {
      const result = await copyOne(key)
      if (result === 'copied') copied++
      else skipped++
      if (i % 25 === 0) {
        console.log(`  progress ${i}/${all.length} (copied=${copied} skipped=${skipped} failed=${failed})`)
      }
    } catch (err) {
      failed++
      console.error(`FAIL ${key}: ${err.message}`)
    }
  }

  console.log(`Done: total=${all.length} copied=${copied} skipped=${skipped} failed=${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
