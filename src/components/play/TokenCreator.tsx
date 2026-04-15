'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface TokenDefinition {
  name: string
  power: string
  toughness: string
  colors: string[]
  typeLine: string
  keywords: string[]
}

interface TokenCreatorProps {
  deckTokens: TokenDefinition[]
  onCreateToken: (token: TokenDefinition, quantity: number) => void
  onClose: () => void
}

const COLOR_OPTIONS = [
  { code: 'W', label: 'White', bg: 'bg-yellow-100 text-yellow-800' },
  { code: 'U', label: 'Blue', bg: 'bg-blue-400 text-white' },
  { code: 'B', label: 'Black', bg: 'bg-gray-700 text-white' },
  { code: 'R', label: 'Red', bg: 'bg-red-500 text-white' },
  { code: 'G', label: 'Green', bg: 'bg-green-600 text-white' },
]

export default function TokenCreator({ deckTokens, onCreateToken, onClose }: TokenCreatorProps) {
  const [tab, setTab] = useState<'deck' | 'custom'>('deck')
  const [quantity, setQuantity] = useState(1)
  const [name, setName] = useState('')
  const [power, setPower] = useState('')
  const [toughness, setToughness] = useState('')
  const [typeLine, setTypeLine] = useState('Token Creature')
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [keywords, setKeywords] = useState('')

  const handleCreateCustom = () => {
    if (!name.trim()) return
    onCreateToken({
      name: name.trim(),
      power, toughness,
      colors: selectedColors,
      typeLine,
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
    }, quantity)
  }

  const toggleColor = (code: string) => {
    setSelectedColors(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bg-dark/70" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border bg-bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-font-primary">Create Token</h3>
          <button onClick={onClose} className="text-font-muted hover:text-font-primary"><X size={16} /></button>
        </div>

        {/* Quantity */}
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-font-secondary">Quantity:</label>
          <input type="number" min={1} max={20} value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value))))}
            className="w-16 rounded bg-bg-cell px-2 py-1 text-center text-sm text-font-primary" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 rounded-lg bg-bg-cell p-1">
          <button onClick={() => setTab('deck')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${tab === 'deck' ? 'bg-bg-surface text-font-primary shadow-sm' : 'text-font-secondary'}`}>
            Deck Tokens ({deckTokens.length})
          </button>
          <button onClick={() => setTab('custom')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${tab === 'custom' ? 'bg-bg-surface text-font-primary shadow-sm' : 'text-font-secondary'}`}>
            Custom
          </button>
        </div>

        {tab === 'deck' && (
          <div className="space-y-1.5">
            {deckTokens.length === 0 ? (
              <p className="text-sm text-font-muted text-center py-4">No tokens defined in deck. Use Custom tab.</p>
            ) : (
              deckTokens.map((t, i) => (
                <button key={i} onClick={() => onCreateToken(t, quantity)}
                  className="flex w-full items-center gap-3 rounded-lg bg-bg-cell px-3 py-2.5 text-left hover:bg-bg-hover">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-font-primary">{t.name}</span>
                    <span className="ml-2 text-xs text-font-muted">{t.power}/{t.toughness} · {t.typeLine}</span>
                  </div>
                  <Plus size={14} className="text-font-accent" />
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'custom' && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-font-muted">NAME *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Soldier"
                className="w-full rounded bg-bg-cell px-2 py-1.5 text-sm text-font-primary placeholder:text-font-muted" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-font-muted">POWER</label>
                <input value={power} onChange={(e) => setPower(e.target.value)} placeholder="1"
                  className="w-full rounded bg-bg-cell px-2 py-1.5 text-sm text-font-primary" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-font-muted">TOUGHNESS</label>
                <input value={toughness} onChange={(e) => setToughness(e.target.value)} placeholder="1"
                  className="w-full rounded bg-bg-cell px-2 py-1.5 text-sm text-font-primary" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-font-muted">COLORS</label>
              <div className="flex gap-1.5 mt-1">
                {COLOR_OPTIONS.map((c) => (
                  <button key={c.code} onClick={() => toggleColor(c.code)}
                    className={`rounded px-2 py-1 text-[10px] font-bold ${selectedColors.includes(c.code) ? c.bg + ' ring-2 ring-bg-accent' : 'bg-bg-cell text-font-muted'}`}>
                    {c.code}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-font-muted">TYPE LINE</label>
              <input value={typeLine} onChange={(e) => setTypeLine(e.target.value)}
                className="w-full rounded bg-bg-cell px-2 py-1.5 text-sm text-font-primary" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-font-muted">KEYWORDS (comma separated)</label>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Flying, Haste"
                className="w-full rounded bg-bg-cell px-2 py-1.5 text-sm text-font-primary placeholder:text-font-muted" />
            </div>
            <button onClick={handleCreateCustom} disabled={!name.trim()}
              className="w-full rounded-lg bg-bg-accent py-2.5 text-sm font-bold text-font-white disabled:opacity-40">
              Create {quantity}x {name || 'Token'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
