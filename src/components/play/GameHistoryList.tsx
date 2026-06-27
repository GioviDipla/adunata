'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Trash2,
  Pencil,
  ScrollText,
  Check,
  X,
  Loader2,
  CheckSquare,
  Square,
  Swords,
} from 'lucide-react'

interface HistoryGame {
  id: string
  name: string | null
  lobby_code: string
  winner_id: string | null
  updated_at: string
  format: string
  opponentName: string
  myDeckName: string
  turnCount: number
  finalLife: Record<string, number>
  cardsOnBoard: Record<string, number>
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

function gameDisplayName(game: HistoryGame): string {
  return game.name || `Game ${game.lobby_code}`
}

export default function GameHistoryList({
  games,
  userId,
  playerNames,
}: {
  games: HistoryGame[]
  userId: string
  playerNames: Map<string, string>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Single-item state
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const allSelected = games.length > 0 && selected.size === games.length
  const someSelected = selected.size > 0

  function toggleSelect(gameId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(gameId)) next.delete(gameId)
      else next.add(gameId)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(games.map((g) => g.id)))
    }
  }

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

  async function handleBulkDelete() {
    setBulkDeleting(true)
    setError(null)
    let failed = 0
    for (const id of selected) {
      try {
        const res = await fetch(`/api/lobbies/${id}`, { method: 'DELETE' })
        if (!res.ok) failed++
      } catch {
        failed++
      }
    }
    setBulkDeleting(false)
    setConfirmBulkDelete(false)
    setSelected(new Set())
    if (failed > 0) {
      setError(`Failed to delete ${failed} game${failed > 1 ? 's' : ''}`)
    }
    startTransition(() => router.refresh())
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
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-font-primary">
          <ScrollText className="h-5 w-5 text-font-accent" />
          Game History
          {games.length > 0 && (
            <span className="rounded-full bg-bg-cell px-2 py-0.5 text-xs font-medium text-font-muted">
              {games.length}
            </span>
          )}
        </h2>

        {games.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-3 py-1.5 text-xs font-medium text-font-secondary transition-colors hover:bg-bg-hover"
            >
              {allSelected ? (
                <CheckSquare className="h-3.5 w-3.5 text-bg-accent" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>

            {someSelected && !confirmBulkDelete && (
              <button
                onClick={() => setConfirmBulkDelete(true)}
                className="flex items-center gap-1.5 rounded-lg bg-bg-red px-3 py-1.5 text-xs font-medium text-font-white transition-colors hover:bg-bg-red/80"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete ({selected.size})
              </button>
            )}

            {confirmBulkDelete && (
              <>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1.5 rounded-lg bg-bg-red px-3 py-1.5 text-xs font-medium text-font-white transition-colors hover:bg-bg-red/80 disabled:opacity-40"
                >
                  {bulkDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Confirm delete {selected.size}
                </button>
                <button
                  onClick={() => setConfirmBulkDelete(false)}
                  disabled={bulkDeleting}
                  className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-xs font-medium text-font-secondary transition-colors hover:bg-bg-hover disabled:opacity-40"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {games.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card px-4 py-10 text-center">
          <Swords className="mx-auto mb-3 h-10 w-10 text-font-muted/40" />
          <p className="text-sm font-medium text-font-muted">No finished games yet</p>
          <p className="mt-1 text-xs text-font-muted/60">
            Complete a game and it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => {
            const isDraw = game.winner_id == null
            const won = !isDraw && game.winner_id === userId
            const isEditing = editing === game.id
            const isConfirmingDelete = confirmDelete === game.id
            const isSelected = selected.has(game.id)

            return (
              <div
                key={game.id}
                className={`group relative flex flex-col gap-3 rounded-xl border bg-bg-card p-4 transition-colors ${
                  isSelected
                    ? 'border-bg-accent/50 bg-bg-accent/5'
                    : 'border-border hover:border-border-light'
                }`}
              >
                {isEditing ? (
                  /* Rename input */
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(game.id)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      className="flex-1 rounded-lg border border-border bg-bg-surface px-2.5 py-1.5 text-sm text-font-primary outline-none focus:border-bg-accent"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(game.id)}
                      disabled={saving}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-green text-font-white transition-colors hover:bg-bg-green/80"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-cell text-font-muted transition-colors hover:bg-bg-hover"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Checkbox + Top Row */}
                    <div className="flex items-start gap-2">
                      {/* Select checkbox */}
                      <button
                        onClick={() => toggleSelect(game.id)}
                        className="mt-0.5 shrink-0 rounded-md p-0.5 text-font-muted transition-colors hover:text-bg-accent"
                        title={isSelected ? 'Deselect' : 'Select'}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-5 w-5 text-bg-accent" />
                        ) : (
                          <Square className="h-5 w-5 opacity-0 group-hover:opacity-100 sm:opacity-100" />
                        )}
                      </button>

                      {/* Game name + result badge */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/play/${game.id}/history`}
                            className="flex-1 min-w-0 truncate text-sm font-semibold text-font-primary hover:text-font-accent transition-colors"
                          >
                            {gameDisplayName(game)}
                          </Link>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              isDraw
                                ? 'bg-bg-cell text-font-muted'
                                : won
                                  ? 'bg-bg-green/20 text-bg-green'
                                  : 'bg-bg-red/20 text-bg-red'
                            }`}
                          >
                            {isDraw ? 'Draw' : won ? 'Won' : 'Lost'}
                          </span>
                        </div>

                        {/* Meta info */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {game.format && (
                            <span className="rounded-md bg-bg-cell px-1.5 py-0.5 text-[10px] font-medium text-font-secondary">
                              {game.format}
                            </span>
                          )}
                          {game.opponentName && (
                            <span className="text-xs text-font-muted">
                              vs{' '}
                              <span className="font-medium text-font-secondary">
                                {game.opponentName}
                              </span>
                            </span>
                          )}
                          {game.myDeckName && (
                            <span className="text-xs text-font-muted">
                              with{' '}
                              <span className="font-medium text-font-secondary">
                                {game.myDeckName}
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Stats row */}
                        {(game.turnCount > 0 || Object.keys(game.finalLife).length > 0) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-2">
                            {game.turnCount > 0 && (
                              <span className="text-[11px] text-font-muted">
                                <span className="font-semibold text-font-secondary">{game.turnCount}</span>{' '}
                                turn{game.turnCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {Object.entries(game.finalLife).map(([pid, life]) => {
                              const pName = playerNames.get(pid) ?? 'Player'
                              const isMe = pid === userId
                              return (
                                <span key={pid} className="text-[11px] text-font-muted">
                                  {isMe ? 'You' : pName.split(' ')[0]}:{' '}
                                  <span className="font-semibold text-font-secondary">{life}</span> life
                                </span>
                              )
                            })}
                          </div>
                        )}

                        {/* Time */}
                        <p className="mt-1.5 text-[10px] text-font-muted/60">
                          {timeAgo(game.updated_at)}
                        </p>
                      </div>
                    </div>

                    {/* Bottom actions */}
                    <div className="flex items-center gap-1 border-t border-border pt-2.5">
                      <Link
                        href={`/play/${game.id}/history`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-font-muted transition-colors hover:bg-bg-hover hover:text-font-accent"
                        title="View log"
                      >
                        <ScrollText size={15} />
                      </Link>
                      <button
                        onClick={() => {
                          setEditing(game.id)
                          setEditName(game.name ?? game.lobby_code)
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-font-muted transition-colors hover:bg-bg-hover hover:text-font-accent"
                        title="Rename"
                      >
                        <Pencil size={15} />
                      </button>

                      <div className="ml-auto">
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleDelete(game.id)}
                              disabled={deleting === game.id || isPending}
                              className="rounded-md bg-bg-red px-2 py-1 text-[10px] font-bold text-font-white transition-colors hover:bg-bg-red/80 disabled:opacity-40"
                            >
                              {deleting === game.id ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                'Delete'
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              disabled={deleting === game.id}
                              className="rounded-md bg-bg-cell px-2 py-1 text-[10px] font-bold text-font-secondary transition-colors hover:bg-bg-hover disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(game.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-font-muted transition-colors hover:bg-bg-red/10 hover:text-bg-red"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-bg-red/30 bg-bg-red/10 px-3 py-2 text-xs text-bg-red">
          {error}
        </p>
      )}
    </div>
  )
}
