'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const FORMATS = [
  'Standard',
  'Modern',
  'Legacy',
  'Vintage',
  'Pioneer',
  'Commander',
  'Pauper',
  'Historic',
  'Alchemy',
  'Explorer',
  'Brawl',
  'Casual',
]

export default function NewDeckPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [format, setFormat] = useState('Standard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Deck name is required')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null, format }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to create deck')
      setLoading(false)
      return
    }

    const data = await res.json()
    router.push(`/decks/${data.deck.id}`)
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/decks"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-font-secondary transition-colors hover:text-font-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Decks
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-font-primary">Create New Deck</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input
          label="Deck Name"
          placeholder="e.g. Mono Red Aggro"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="description"
            className="text-sm font-medium text-font-secondary"
          >
            Description (optional)
          </label>
          <textarea
            id="description"
            placeholder="Notes about this deck..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-font-primary placeholder:text-font-muted transition-colors focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
          />
        </div>

        {/* Format selector */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="format"
            className="text-sm font-medium text-font-secondary"
          >
            Format
          </label>
          <select
            id="format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-font-primary transition-colors focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-lg bg-bg-red/10 px-4 py-3 text-sm text-bg-red">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading}>
          Create Deck
        </Button>
      </form>
    </div>
  )
}
