import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Bucket, getR2Client } from './client'

export interface UploadToR2Options {
  key: string
  body: Uint8Array | Buffer
  contentType: string
  cacheControl?: string
}

export async function uploadToR2(options: UploadToR2Options): Promise<void> {
  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: options.key,
    Body: options.body,
    ContentType: options.contentType,
    CacheControl: options.cacheControl ?? 'public, max-age=31536000, immutable',
  })
  await client.send(command)
}
