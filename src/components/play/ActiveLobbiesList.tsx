'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'

interface LobbySummary {
  id: string
  lobby_code: string
  status: string
  format: string
}

interface ActiveLobbiesListProps {
  lobbies: LobbySummary[]
}

export default function ActiveLobbiesList({ lobbies }: ActiveLobbiesListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [closing, setClosing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleClose(lobbyId: string) {
    setClosing(lobbyId)
    setError(null)
    try {
      const res = await fetch(`/api/lobbies/${lobbyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to close lobby' }))
        setError(data.error ?? 'Failed to close lobby')
        return
      }
      setConfirming(null)
      // Refresh the server component so the lobby disappears from the list
      startTransition(() => router.refresh())
    } finally {
      setClosing(null)
    }
  }

  if (lobbies.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-font-secondary">Active Games</h2>
      <div className="flex flex-col gap-2">
        {lobbies.map((lobby) => {
          const href = lobby.status === 'playing' ? `/play/${lobby.id}/game` : `/play/${lobby.id}`
          const isClosing = closing === lobby.id
          const isConfirming = confirming === lobby.id
          return (
            <div
              key={lobby.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-3"
            >
              <Link
                href={href}
                className="flex flex-1 items-center justify-between transition-colors hover:text-font-accent"
              >
                <div>
                  <span className="text-sm font-medium text-font-primary">
                    Code: {lobby.lobby_code}
                  </span>
                  <span className="ml-2 text-xs text-font-muted">{lobby.format}</span>
                </div>
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    lobby.status === 'playing'
                      ? 'bg-bg-green/20 text-bg-green'
                      : 'bg-bg-yellow/20 text-bg-yellow'
                  }`}
                >
                  {lobby.status === 'playing' ? 'In Game' : 'Waiting'}
                </span>
              </Link>

              {isConfirming ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleClose(lobby.id)}
                    disabled={isClosing || isPending}
                    className="rounded-md bg-bg-red px-2 py-1 text-[10px] font-bold text-font-white active:bg-bg-red/80 disabled:opacity-40"
                  >
                    {isClosing ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      lobby.status === 'playing' ? 'Termina' : 'Elimina'
                    )}
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    disabled={isClosing}
                    className="rounded-md bg-bg-cell px-2 py-1 text-[10px] font-bold text-font-secondary active:bg-bg-hover disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(lobby.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-font-muted transition-colors hover:bg-bg-red/10 hover:text-bg-red"
                  title={lobby.status === 'playing' ? 'Termina la partita' : 'Elimina lobby'}
                  aria-label="Close lobby"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {error && (
        <p className="mt-2 text-xs text-bg-red">{error}</p>
      )}
    </div>
  )
}
