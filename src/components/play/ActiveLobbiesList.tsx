'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, Loader2, Clock } from 'lucide-react'

interface LobbySummary {
  id: string
  name: string | null
  lobby_code: string
  status: string
  format: string
  host_user_id: string
  created_at: string
}

interface ActiveLobbiesListProps {
  lobbies: LobbySummary[]
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
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
      startTransition(() => router.refresh())
    } finally {
      setClosing(null)
    }
  }

  return (
    <div className="mb-6">
      {lobbies.length === 0 ? null : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lobbies.map((lobby) => {
            const href = lobby.status === 'playing' ? `/play/${lobby.id}/game` : `/play/${lobby.id}`
            const isClosing = closing === lobby.id
            const isConfirming = confirming === lobby.id
            const displayName = lobby.name || `Game ${lobby.lobby_code}`

            return (
              <div
                key={lobby.id}
                className="group relative flex flex-col gap-3 rounded-none border border-[#2A2A2A] bg-[#141414] p-4 transition-colors hover:bg-[#1A1A1A]"
              >
                {/* Main clickable area */}
                <Link href={href} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        lobby.status === 'playing'
                          ? 'shrink-0 bg-[#4AF626]/20 px-2 py-0.5 text-[11px] font-semibold text-[#4AF626]'
                          : 'shrink-0 bg-[#FFB800]/20 px-2 py-0.5 text-[11px] font-semibold text-[#FFB800]'
                      }
                    >
                      {lobby.status === 'playing' ? 'In Game' : 'Waiting'}
                    </span>
                    <span className="font-mono text-xs text-[#787878]">{lobby.format}</span>
                  </div>
                  <p className="line-clamp-2 font-mono tracking-wider text-[#E8E8E8]">
                    {displayName}
                  </p>
                  <div className="mt-auto flex items-center gap-3">
                    <span className="flex items-center gap-1 font-mono text-xs text-[#555]">
                      <Clock className="h-3 w-3" />
                      {timeAgo(lobby.created_at)}
                    </span>
                  </div>
                </Link>

                {/* Action buttons — top-right */}
                {isConfirming ? (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <button
                      onClick={() => handleClose(lobby.id)}
                      disabled={isClosing || isPending}
                      className="rounded-none bg-[#FF2A2A] px-3 py-1.5 font-mono text-xs tracking-wider text-white disabled:opacity-40"
                    >
                      {isClosing ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        '[ CONFIRM ]'
                      )}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      disabled={isClosing}
                      className="rounded-none bg-[#1A1A1A] px-3 py-1.5 font-mono text-xs tracking-wider text-[#787878] disabled:opacity-40"
                    >
                      [ CANCEL ]
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      setConfirming(lobby.id)
                    }}
                    className="absolute top-3 right-3 flex h-11 w-11 shrink-0 items-center justify-center text-[#787878] transition-all hover:bg-[#FF2A2A]/10 hover:text-[#FF2A2A] sm:opacity-0 sm:group-hover:opacity-100"
                    title="Close lobby"
                    aria-label="Close lobby"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && (
        <p className="mt-2 font-mono text-xs text-[#FF2A2A]">{error}</p>
      )}
    </div>
  )
}
