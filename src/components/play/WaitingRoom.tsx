'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Crown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

interface Player { user_id: string; deck_id: string; ready: boolean; seat_position: number }
interface Lobby { id: string; lobby_code: string; format: string; host_user_id: string; status: string }

export default function WaitingRoom({ lobby, players: initialPlayers, userId, isHost }: {
  lobby: Lobby; players: Player[]; userId: string; isHost: boolean
}) {
  const router = useRouter()
  const [players, setPlayers] = useState(initialPlayers)
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)

  const myPlayer = players.find((p) => p.user_id === userId)
  const allReady = players.length === 2 && players.every((p) => p.ready)

  // Subscribe to lobby changes
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`lobby-${lobby.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `lobby_id=eq.${lobby.id}`,
      }, () => {
        // Refetch players
        supabase.from('game_players').select('user_id, deck_id, ready, seat_position')
          .eq('lobby_id', lobby.id).order('seat_position')
          .then(({ data }) => { if (data) setPlayers(data) })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_lobbies',
        filter: `id=eq.${lobby.id}`,
      }, (payload) => {
        if ((payload.new as Lobby).status === 'playing') {
          router.push(`/play/${lobby.id}/game`)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [lobby.id, router])

  async function toggleReady() {
    await fetch(`/api/lobbies/${lobby.id}/ready`, { method: 'PATCH' })
  }

  async function startGame() {
    setStarting(true)
    const res = await fetch(`/api/lobbies/${lobby.id}/start`, { method: 'POST' })
    if (res.ok) {
      router.push(`/play/${lobby.id}/game`)
    }
    setStarting(false)
  }

  function copyCode() {
    navigator.clipboard.writeText(lobby.lobby_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-12">
      <h1 className="text-xl font-bold text-font-primary">Waiting Room</h1>

      {/* Lobby code */}
      <div className="flex items-center gap-3 rounded-xl bg-bg-card px-6 py-4">
        <span className="font-mono text-3xl font-bold tracking-[0.3em] text-font-accent">{lobby.lobby_code}</span>
        <button onClick={copyCode} className="rounded-lg p-2 text-font-muted hover:bg-bg-hover hover:text-font-primary">
          {copied ? <Check size={18} className="text-bg-green" /> : <Copy size={18} />}
        </button>
      </div>
      <p className="text-xs text-font-muted">Share this code with your opponent</p>

      {/* Players */}
      <div className="w-full space-y-2">
        {players.map((p) => (
          <div key={p.user_id} className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              {p.user_id === lobby.host_user_id && <Crown size={14} className="text-bg-yellow" />}
              <span className="text-sm font-medium text-font-primary">
                {p.user_id === userId ? 'You' : 'Opponent'}
              </span>
              <span className="text-xs text-font-muted">Seat {p.seat_position}</span>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              p.ready ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-cell text-font-muted'
            }`}>
              {p.ready ? 'Ready' : 'Not Ready'}
            </span>
          </div>
        ))}
        {players.length < 2 && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-bg-card px-4 py-6">
            <Loader2 size={16} className="mr-2 animate-spin text-font-muted" />
            <span className="text-sm text-font-muted">Waiting for opponent...</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant={myPlayer?.ready ? 'secondary' : 'primary'} size="lg" onClick={toggleReady}>
          {myPlayer?.ready ? 'Unready' : 'Ready'}
        </Button>
        {isHost && (
          <Button variant="primary" size="lg" onClick={startGame} loading={starting} disabled={!allReady}>
            Start Game
          </Button>
        )}
      </div>
    </div>
  )
}
