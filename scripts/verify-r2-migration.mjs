import process from 'node:process'
import { createHash } from 'node:crypto'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'

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

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

async function bodyToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function fetchDbKeys() {
  const all = []
  let from = 0
  const pageSize = 500
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
  const keys = await fetchDbKeys()
  console.log(`DB rows with status=ready and storage_path: ${keys.length}`)

  const sample = keys.slice(0, Math.min(20, keys.length))
  let mismatches = 0
  let missing = 0

  for (const key of sample) {
    try {
      const supabaseBlob = await supabase.storage.from(SUPABASE_BUCKET).download(key)
      if (supabaseBlob.error || !supabaseBlob.data) {
        console.log(`  ${key}: not in Supabase (already deleted?)`)
        continue
      }
      const supabaseBuf = Buffer.from(await supabaseBlob.data.arrayBuffer())

      const r2Obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
      const r2Buf = await bodyToBuffer(r2Obj.Body)

      if (sha256(supabaseBuf) !== sha256(r2Buf)) {
        console.log(`  MISMATCH ${key}`)
        mismatches++
      } else {
        console.log(`  OK ${key} (${supabaseBuf.length} bytes)`)
      }
    } catch (err) {
      console.log(`  MISSING ${key}: ${err.message}`)
      missing++
    }
  }

  // Coverage: every DB key must exist in R2.
  let absent = 0
  for (const key of keys) {
    try {
      await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    } catch (err) {
      absent++
      console.log(`  ABSENT IN R2: ${key} (${err.message})`)
      if (absent >= 25) {
        console.log('  (stopping report after 25 absent keys)')
        break
      }
    }
  }

  console.log(`Sample checked: ${sample.length}, mismatches=${mismatches}, missing-in-r2=${missing}`)
  console.log(`Full DB coverage: absent-in-r2=${absent}`)
  if (mismatches > 0 || absent > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
