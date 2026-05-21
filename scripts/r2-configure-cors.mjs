#!/usr/bin/env node
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error('Missing R2 env vars')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      MaxAgeSeconds: 86400,
    },
  ],
}

console.log('Setting CORS on R2 bucket:', bucket)
await s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: corsConfig }))
console.log('Done. CORS configured: GET/HEAD from any origin.')
