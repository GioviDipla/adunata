'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, Send, Check, X, UserPlus, Swords } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

interface Deck { id: string; name: string; format: string }

interface PendingInvitation {
  id: string
  lobby_id: string
  from_user_id: string
  to_user_id: string
  status: 'pending'
  created_at: string
  sender: { username: string; display_name: string } | null
}

interface UserSearchResult {
  id: string
  username: string
  display_name: string
  bio: string | null
  public_deck_count: number
}

interface InvitationsPanelProps {
  decks: Deck[]
  initialInvitations: PendingInvitation[]
  userId: string
}

/**
 * /play companion panel for 1v1 direct challenges.
 *
 *  - Top half: pick a deck, search a user by name/username, send invite.
 *    The server creates a lobby (sender as host / player 1) and a pending
 *    `lobby_invitations` row; the sender is navigated to the lobby's
 *    waiting room.
 *
 *  - Bottom half: list of pending invitations the current user has
 *    received. Realtime-subscribed so a newly-arrived invite pops in
 *    without a refresh. Accepting asks which deck to bring and then
 *    joins the lobby.
 */
export default function InvitationsPanel({
  decks,
  initialInvitations,
  userId,
}: InvitationsPanelProps) {
  const router = useRouter()

  // ── Outgoing side: user search + deck picker + send ───────────────────
  const [selectedDeck, setSelectedDeck] = useState(decks[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [target, setTarget] = useState<UserSearchResult | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Close the results popover on outside click.
  const searchBoxRef = useRef<HTMLDivElement | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  useEffect(() => {
    if (!dropdownOpen) return
    const onClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [dropdownOpen])

  // Debounced search — same 300ms window + AbortController pattern as the
  // community page's UserSearch.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          setResults((data.users ?? []).filter((u: UserSearchResult) => u.id !== userId))
        } else {
          setResults([])
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setResults([])
      }
      if (!controller.signal.aborted) setSearching(false)
    }, 300)
    return () => { clearTimeout(handle); controller.abort() }
  }, [query, userId])

  async function sendInvite() {
    if (!target || !selectedDeck) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/lobbies/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: target.id, deckId: selectedDeck }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSendError(data.error ?? 'Failed to send invite')
        setSending(false)
        return
      }
      const { lobby } = await res.json()
      router.push(`/play/${lobby.id}`)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send invite')
      setSending(false)
    }
  }

  // ── Incoming side: realtime-subscribed pending invitations ────────────
  const [invitations, setInvitations] = useState<PendingInvitation[]>(initialInvitations)
  const [pendingDeckChoice, setPendingDeckChoice] = useState<Record<string, string>>({})
  const [responding, setResponding] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`invitations-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'lobby_invitations',
        filter: `to_user_id=eq.${userId}`,
      }, async () => {
        // Payload doesn't carry the joined sender profile, so refetch
        // the pending list in one pass — it's tiny.
        const res = await fetch('/api/lobbies/invitations')
        if (res.ok) {
          const { invitations: fresh } = await res.json()
          setInvitations(fresh ?? [])
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function respond(inviteId: string, action: 'accept' | 'decline') {
    const deckId = pendingDeckChoice[inviteId] ?? decks[0]?.id
    if (action === 'accept' && !deckId) return
    setResponding(inviteId)
    try {
      const res = await fetch(`/api/lobbies/invitations/${inviteId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'accept' ? JSON.stringify({ deckId }) : undefined,
      })
      if (res.ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== inviteId))
        if (action === 'accept') {
          const { lobbyId } = await res.json()
          router.push(`/play/${lobbyId}`)
        }
      }
    } finally {
      setResponding(null)
    }
  }

  const hasDecks = decks.length > 0
  const targetPreview = useMemo(() => target, [target])

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-bg-card p-4">
      <div className="flex items-center gap-2">
        <Swords className="h-4 w-4 text-font-accent" />
        <h2 className="text-sm font-semibold text-font-primary">1v1 Invites</h2>
      </div>

      {/* Outgoing */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-font-muted">
          Invite a player
        </label>
        <select
          value={selectedDeck}
          onChange={(e) => setSelectedDeck(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary"
          disabled={!hasDecks}
        >
          {hasDecks ? decks.map((d) => (
            <option key={d.id} value={d.id}>{d.name} ({d.format})</option>
          )) : (
            <option>Create a deck first</option>
          )}
        </select>

        <div className="relative" ref={searchBoxRef}>
          {targetPreview ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2">
              <UserPlus className="h-4 w-4 shrink-0 text-font-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-font-primary">
                  {targetPreview.display_name}
                </p>
                <p className="truncate text-[11px] text-font-muted">@{targetPreview.username}</p>
              </div>
              <button
                type="button"
                onClick={() => { setTarget(null); setQuery('') }}
                aria-label="Clear"
                className="rounded-md p-1 text-font-muted hover:bg-bg-hover hover:text-font-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-font-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true) }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search by username or name..."
                className="w-full rounded-lg border border-border bg-bg-surface px-10 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-font-muted" />
              )}
              {dropdownOpen && results !== null && results.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-xl">
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setTarget(u); setDropdownOpen(false) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-font-primary">{u.display_name}</p>
                        <p className="truncate text-[11px] text-font-muted">@{u.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {dropdownOpen && results !== null && results.length === 0 && query.trim().length >= 2 && !searching && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-bg-surface px-3 py-3 text-xs text-font-muted shadow-xl">
                  No players match “{query}”.
                </div>
              )}
            </>
          )}
        </div>

        {sendError && <p className="text-xs text-bg-red">{sendError}</p>}

        <Button
          variant="primary"
          size="sm"
          onClick={sendInvite}
          loading={sending}
          disabled={!target || !selectedDeck || sending}
        >
          <Send className="h-4 w-4" /> Send invite
        </Button>
      </div>

      {/* Incoming */}
      {invitations.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-font-muted">
            Incoming invites ({invitations.length})
          </label>
          <div className="flex flex-col gap-2">
            {invitations.map((inv) => {
              const name = inv.sender?.display_name ?? 'Someone'
              const handle = inv.sender?.username ? `@${inv.sender.username}` : ''
              const isBusy = responding === inv.id
              const chosen = pendingDeckChoice[inv.id] ?? decks[0]?.id ?? ''
              return (
                <div
                  key={inv.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-font-primary">{name}</p>
                      <p className="truncate text-[11px] text-font-muted">{handle} challenges you to a 1v1</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => respond(inv.id, 'decline')}
                      disabled={isBusy}
                      aria-label="Decline"
                      className="rounded-md p-1.5 text-font-muted transition-colors hover:bg-bg-red/10 hover:text-bg-red disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={chosen}
                      onChange={(e) => setPendingDeckChoice((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                      className="flex-1 rounded-lg border border-border bg-bg-card px-2 py-1.5 text-xs text-font-primary"
                      disabled={isBusy || !hasDecks}
                    >
                      {hasDecks ? decks.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} ({d.format})</option>
                      )) : (
                        <option>No deck</option>
                      )}
                    </select>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => respond(inv.id, 'accept')}
                      loading={isBusy}
                      disabled={isBusy || !hasDecks}
                    >
                      <Check className="h-4 w-4" /> Accept
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
