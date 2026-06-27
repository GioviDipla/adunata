'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2, Pencil, ScrollText, Check, X, Loader2 } from 'lucide-react'

interface HistoryGame {
  id: string
  name: string | null
  lobby_code: string
  winner_id: string | null
  updated_at: string
  format: string
  opponentName: string
  myDeckName: string
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

export default function GameHistoryList({ games, userId }: { games: HistoryGame[]; userId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(lobbyId: string) {
    setDeleting(lobbyId)
    setError(null)
    try {
      const res = await fetch(`/api/lobbies/${lobbyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to delete' }))
        setError(data.error ?? 'Failed to delete')
        return
      }
      setConfirmDelete(null)
      startTransition(() => router.refresh())
    } finally {
      setDeleting(null)
    }
  }

  async function handleRename(lobbyId: string) {
    if (!editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/lobbies/${lobbyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to rename' }))
        setError(data.error ?? 'Failed to rename')
        return
      }
      setEditing(null)
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 font-mono text-sm font-bold tracking-widest uppercase text-[#787878]">Game History</h2>
      {games.length === 0 ? (
        <div className="rounded-none border border-[#2A2A2A] bg-[#141414] px-4 py-6 text-center">
          <ScrollText size={32} className="mx-auto mb-2 text-[#787878]" />
          <p className="font-mono text-sm tracking-wider text-[#787878]">NO MISSION LOGS</p>
          <p className="mt-1 font-mono text-xs text-[#555]">Complete a game and it will appear here</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {games.map((game) => {
            const isDraw = game.winner_id == null
            const won = !isDraw && game.winner_id === userId
            const isEditing = editing === game.id
            const isConfirmingDelete = confirmDelete === game.id

            return (
              <div key={game.id} className="rounded-none border border-[#2A2A2A] bg-[#141414] px-4 py-3">
                {isEditing ? (
                  /* Rename input */
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(game.id)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      className="flex-1 rounded-none border border-[#2A2A2A] bg-[#0D0D0D] px-2 py-1 font-mono text-xs text-[#E8E8E8] outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleRename(game.id)} disabled={saving}
                      className="flex h-6 w-6 items-center justify-center rounded-none bg-[#4AF626]/20 text-[#4AF626]">
                      {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={12} />}
                    </button>
                    <button onClick={() => setEditing(null)} className="flex h-6 w-6 items-center justify-center rounded-none bg-[#1A1A1A] text-[#787878]">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {/* Row 1: Name + Badge + Actions */}
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-mono text-sm tracking-wider text-[#E8E8E8]">
                        {game.name ?? game.lobby_code}
                      </p>
                      <span className={`shrink-0 rounded-none px-2 py-0.5 font-mono text-[10px] tracking-wider ${
                        isDraw
                          ? 'bg-[#787878]/20 text-[#787878]'
                          : won
                            ? 'bg-[#4AF626]/20 text-[#4AF626]'
                            : 'bg-[#FF2A2A]/20 text-[#FF2A2A]'
                      }`}>
                        {isDraw ? 'Draw' : won ? 'Won' : 'Lost'}
                      </span>
                      {!isConfirmingDelete && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Link href={`/play/${game.id}/history`}
                            className="flex h-11 w-11 items-center justify-center rounded-none text-[#787878] hover:bg-[#1A1A1A] hover:text-[#E8E8E8]"
                            title="View log">
                            <ScrollText size={16} />
                          </Link>
                          <button onClick={() => { setEditing(game.id); setEditName(game.name ?? game.lobby_code) }}
                            className="flex h-11 w-11 items-center justify-center rounded-none text-[#787878] hover:bg-[#1A1A1A] hover:text-[#E8E8E8]"
                            title="Rename">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => setConfirmDelete(game.id)}
                            className="flex h-11 w-11 items-center justify-center rounded-none text-[#787878] hover:bg-[#1A1A1A] hover:text-[#FF2A2A]"
                            title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                      {isConfirmingDelete && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button onClick={() => handleDelete(game.id)} disabled={deleting === game.id || isPending}
                            className="rounded-none bg-[#FF2A2A] px-2 py-1 font-mono text-[10px] tracking-wider uppercase text-white disabled:opacity-40">
                            {deleting === game.id ? <Loader2 size={11} className="animate-spin" /> : '[ DELETE ]'}
                          </button>
                          <button onClick={() => setConfirmDelete(null)} disabled={deleting === game.id}
                            className="rounded-none bg-[#1A1A1A] px-2 py-1 font-mono text-[10px] tracking-wider uppercase text-[#787878] disabled:opacity-40">
                            [ CANCEL ]
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Row 2: Format + vs Opponent with Deck */}
                    {(game.format || game.opponentName) && (
                      <div className="flex items-center gap-1.5 font-mono text-xs text-[#787878]">
                        {game.format && (
                          <span className="rounded-none bg-[#1A1A1A] px-1.5 py-0.5 font-mono text-[10px] text-[#787878]">
                            {game.format}
                          </span>
                        )}
                        {game.opponentName && (
                          <span>
                            vs {game.opponentName}{game.myDeckName ? ` with ${game.myDeckName}` : ''}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Row 3: Date */}
                    <p className="font-mono text-xs text-[#555]">{timeAgo(game.updated_at)}</p>
                  </div>
                )}
              </div>
            )
          })}
          {error && <p className="mt-2 font-mono text-xs text-[#FF2A2A]">{error}</p>}
        </div>
      )}
    </div>
  )
}
