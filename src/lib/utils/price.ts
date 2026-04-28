export type CardPriceFields = {
  prices_eur?: number | null
  prices_usd?: number | null
}

export type PreferredPrice = {
  value: number
  currency: 'EUR' | 'USD'
  symbol: '€' | '$'
} | null

function asFinitePrice(value: number | null | undefined): number | null {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

export function getPreferredPrice(card: CardPriceFields): PreferredPrice {
  const eur = asFinitePrice(card.prices_eur)
  if (eur != null) return { value: eur, currency: 'EUR', symbol: '€' }

  const usd = asFinitePrice(card.prices_usd)
  if (usd != null) return { value: usd, currency: 'USD', symbol: '$' }

  return null
}

export function getPriceSortValue(card: CardPriceFields): number {
  return getPreferredPrice(card)?.value ?? 0
}

export function formatPreferredPrice(
  card: CardPriceFields,
  quantity = 1,
): string | null {
  const price = getPreferredPrice(card)
  if (!price) return null
  return `${price.symbol}${(price.value * quantity).toFixed(2)}`
}

export function summarizePreferredPrices<T extends { card: CardPriceFields; quantity: number }>(
  entries: T[],
): string | null {
  let eur = 0
  let usdFallback = 0

  for (const entry of entries) {
    const price = getPreferredPrice(entry.card)
    if (!price) continue
    if (price.currency === 'EUR') eur += price.value * entry.quantity
    else usdFallback += price.value * entry.quantity
  }

  const parts: string[] = []
  if (eur > 0) parts.push(`€${eur.toFixed(2)}`)
  if (usdFallback > 0) parts.push(`$${usdFallback.toFixed(2)}`)
  return parts.length > 0 ? parts.join(' + ') : null
}
