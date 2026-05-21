export function getR2PublicBaseUrl(): string {
  const base = process.env.R2_PUBLIC_BASE_URL
  if (!base) throw new Error('R2 misconfigured: missing R2_PUBLIC_BASE_URL')
  return base.replace(/\/+$/, '')
}

export function buildR2PublicUrl(storagePath: string): string {
  const normalized = storagePath.replace(/^\/+/, '')
  return `${getR2PublicBaseUrl()}/${normalized}`
}
