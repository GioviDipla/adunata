const MANA_COLORS: Record<string, { bg: string; text: string }> = {
  W: { bg: '#F5F0E1', text: '#333' },
  U: { bg: '#0E7FC0', text: '#fff' },
  B: { bg: '#3D3229', text: '#fff' },
  R: { bg: '#D32029', text: '#fff' },
  G: { bg: '#00733E', text: '#fff' },
  C: { bg: '#9CA3AF', text: '#333' },
}

function getSymbolStyle(symbol: string): { bg: string; text: string } {
  if (MANA_COLORS[symbol]) return MANA_COLORS[symbol]
  // Numeric or generic mana
  return { bg: '#6B7280', text: '#fff' }
}

interface ManaCostProps {
  manaCost: string | null
  size?: 'sm' | 'md'
}

export default function ManaCost({ manaCost, size = 'sm' }: ManaCostProps) {
  if (!manaCost) return null

  const symbols = manaCost.match(/\{([^}]+)\}/g)
  if (!symbols) return null

  const sizeClasses = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs'

  return (
    <span className="inline-flex items-center gap-0.5">
      {symbols.map((raw, i) => {
        const symbol = raw.replace(/[{}]/g, '')
        const style = getSymbolStyle(symbol)
        return (
          <span
            key={i}
            className={`${sizeClasses} rounded-full inline-flex items-center justify-center font-bold shrink-0`}
            style={{ backgroundColor: style.bg, color: style.text }}
          >
            {symbol}
          </span>
        )
      })}
    </span>
  )
}
