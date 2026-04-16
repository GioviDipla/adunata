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

  if (games.length === 0) return null

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-font-secondary">Game History</h2>
      <div className="flex flex-col gap-2">
        {games.map((game) => {
          const won = game.winner_id === userId
          const isEditing = editing === game.id
          const isConfirmingDelete = confirmDelete === game.id

          return (
            <div key={game.id} className="rounded-xl border border-border bg-bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                {/* Name / edit */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(game.id)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="flex-1 rounded bg-bg-cell px-2 py-1 text-xs text-font-primary outline-none"
                        autoFocus
                      />
                      <button onClick={() => handleRename(game.id)} disabled={saving}
                        className="flex h-6 w-6 items-center justify-center rounded bg-bg-green text-font-white">
                        {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={12} />}
                      </button>
                      <button onClick={() => setEditing(null)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-muted">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-font-primary truncate">
                        {game.name ?? game.lobby_code}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-font-muted">
                          {new Date(game.updated_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          won ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-red/20 text-bg-red'
                        }`}>
                          {won ? 'Won' : 'Lost'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isEditing && !isConfirmingDelete && (
                  <div className="flex items-center gap-1">
                    <Link href={`/play/${game.id}/history`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted hover:bg-bg-hover hover:text-font-accent"
                      title="View log">
                      <ScrollText size={14} />
                    </Link>
                    <button onClick={() => { setEditing(game.id); setEditName(game.name ?? game.lobby_code) }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted hover:bg-bg-hover hover:text-font-accent"
                      title="Rename">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDelete(game.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted hover:bg-bg-red/10 hover:text-bg-red"
                      title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                {/* Delete confirmation */}
                {isConfirmingDelete && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleDelete(game.id)} disabled={deleting === game.id || isPending}
                      className="rounded-md bg-bg-red px-2 py-1 text-[10px] font-bold text-font-white disabled:opacity-40">
                      {deleting === game.id ? <Loader2 size={11} className="animate-spin" /> : 'Elimina'}
                    </button>
                    <button onClick={() => setConfirmDelete(null)} disabled={deleting === game.id}
                      className="rounded-md bg-bg-cell px-2 py-1 text-[10px] font-bold text-font-secondary disabled:opacity-40">
                      Annulla
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="mt-2 text-xs text-bg-red">{error}</p>}
    </div>
  )
}
