'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Heart, Minus, Plus, Layers, Archive, Ban, SkipForward,
  RotateCcw, ArrowLeft, Shuffle, Crown, BookOpen,
} from 'lucide-react'
import PhaseTracker, { PHASES, type Phase } from './PhaseTracker'
import BattlefieldZone, { type BattlefieldCard } from './BattlefieldZone'
import HandArea, { type HandCardEntry } from './HandArea'
import CardZoneViewer from './CardZoneViewer'
import CardPreviewOverlay, { type PreviewState, type PreviewZone } from '@/components/game/CardPreviewOverlay'
import { getCardZone } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface GoldfishGameProps {
  deckName: string
  deckId: string
  fullDeck: CardRow[]
  commanders?: CardRow[]
}

interface CardInstance { instanceId: string; card: CardRow }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let instanceCounter = 0
function makeInstance(card: CardRow): CardInstance {
  return { instanceId: `ci-${++instanceCounter}`, card }
}

type GameStage = 'mulligan' | 'bottomCards' | 'playing'
type ViewingZone = 'graveyard' | 'exile' | 'library' | null

export default function GoldfishGame({ deckName, deckId, fullDeck, commanders = [] }: GoldfishGameProps) {
  const router = useRouter()

  const initialLibrary = useMemo(() => shuffle(fullDeck.map(makeInstance)), [fullDeck])

  const [library, setLibrary] = useState<CardInstance[]>(() => initialLibrary.slice(7))
  const [hand, setHand] = useState<HandCardEntry[]>(() => initialLibrary.slice(0, 7))
  const [battlefield, setBattlefield] = useState<BattlefieldCard[]>([])
  const [graveyard, setGraveyard] = useState<CardInstance[]>([])
  const [exile, setExile] = useState<CardInstance[]>([])
  const [commandZone, setCommandZone] = useState<CardInstance[]>(() => commanders.map(makeInstance))

  const [turn, setTurn] = useState(1)
  const [phase, setPhase] = useState<Phase>('main1')
  const [life, setLife] = useState(20)
  const [mulliganCount, setMulliganCount] = useState(0)

  const [stage, setStage] = useState<GameStage>('mulligan')
  const [bottomSelectIds, setBottomSelectIds] = useState<Set<string>>(new Set())
  const [viewingZone, setViewingZone] = useState<ViewingZone>(null)

  const [preview, setPreview] = useState<PreviewState | null>(null)
  const setPreviewCard = useCallback((card: CardRow | null) => {
    if (card) setPreview({ card }); else setPreview(null)
  }, [])

  const drawPendingRef = useRef(false)

  // Derived battlefield zones
  const lands = useMemo(() => battlefield.filter((c) => getCardZone(c.card.type_line) === 'lands'), [battlefield])
  const creatures = useMemo(() => battlefield.filter((c) => getCardZone(c.card.type_line) === 'creatures'), [battlefield])
  const otherPermanents = useMemo(() => battlefield.filter((c) => getCardZone(c.card.type_line) === 'other'), [battlefield])

  // -- Mulligan --
  const doMulligan = useCallback(() => {
    const newCount = mulliganCount + 1
    setMulliganCount(newCount)
    const reshuffled = shuffle(fullDeck.map(makeInstance))
    setHand(reshuffled.slice(0, 7))
    setLibrary(reshuffled.slice(7))
    setBattlefield([])
    setGraveyard([])
    setExile([])
    setCommandZone(commanders.map(makeInstance))
  }, [mulliganCount, fullDeck, commanders])

  const keepHand = useCallback(() => {
    if (mulliganCount > 0) { setStage('bottomCards'); setBottomSelectIds(new Set()) }
    else setStage('playing')
  }, [mulliganCount])

  const confirmBottomCards = useCallback(() => {
    const toBottom = hand.filter((c) => bottomSelectIds.has(c.instanceId))
    const remaining = hand.filter((c) => !bottomSelectIds.has(c.instanceId))
    setHand(remaining)
    setLibrary((prev) => [...prev, ...toBottom.map((c) => ({ instanceId: c.instanceId, card: c.card }))])
    setStage('playing')
    setBottomSelectIds(new Set())
  }, [hand, bottomSelectIds])

  const toggleBottomSelect = useCallback((instanceId: string) => {
    setBottomSelectIds((prev) => {
      const next = new Set(prev)
      if (next.has(instanceId)) next.delete(instanceId); else next.add(instanceId)
      return next
    })
  }, [])

  // -- Game actions --
  const drawOneCard = useCallback(() => {
    if (drawPendingRef.current) return
    drawPendingRef.current = true
    setLibrary((prevLib) => {
      if (prevLib.length === 0) { drawPendingRef.current = false; return prevLib }
      const drawn = prevLib[0]
      queueMicrotask(() => {
        setHand((h) => [...h, { instanceId: drawn.instanceId, card: drawn.card }])
        drawPendingRef.current = false
      })
      return prevLib.slice(1)
    })
  }, [])

  const playCard = useCallback((instanceId: string) => {
    let played: HandCardEntry | undefined
    setHand((prev) => { played = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (played) setBattlefield((bf) => [...bf, { instanceId: played!.instanceId, card: played!.card, tapped: false }]) })
  }, [])

  const playFromCommandZone = useCallback((instanceId: string) => {
    let played: CardInstance | undefined
    setCommandZone((prev) => { played = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (played) setBattlefield((bf) => [...bf, { instanceId: played!.instanceId, card: played!.card, tapped: false }]) })
  }, [])

  const returnToCommandZone = useCallback((instanceId: string) => {
    let removed: BattlefieldCard | undefined
    setBattlefield((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setCommandZone((cz) => [...cz, { instanceId: removed!.instanceId, card: removed!.card }]) })
  }, [])

  const tapToggle = useCallback((instanceId: string) => {
    setBattlefield((prev) => prev.map((c) => c.instanceId === instanceId ? { ...c, tapped: !c.tapped } : c))
  }, [])

  const sendToGraveyard = useCallback((instanceId: string) => {
    let removed: BattlefieldCard | undefined
    setBattlefield((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setGraveyard((g) => [...g, { instanceId: removed!.instanceId, card: removed!.card }]) })
  }, [])

  const sendFromHandToGraveyard = useCallback((instanceId: string) => {
    let removed: HandCardEntry | undefined
    setHand((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setGraveyard((g) => [...g, { instanceId: removed!.instanceId, card: removed!.card }]) })
  }, [])

  const exileCard = useCallback((instanceId: string) => {
    let removed: BattlefieldCard | undefined
    setBattlefield((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setExile((e) => [...e, { instanceId: removed!.instanceId, card: removed!.card }]) })
  }, [])

  const exileFromHand = useCallback((instanceId: string) => {
    let removed: HandCardEntry | undefined
    setHand((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setExile((e) => [...e, { instanceId: removed!.instanceId, card: removed!.card }]) })
  }, [])

  const returnToHand = useCallback((instanceId: string) => {
    let removed: BattlefieldCard | undefined
    setBattlefield((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setHand((h) => [...h, { instanceId: removed!.instanceId, card: removed!.card }]) })
  }, [])

  const returnFromGraveyardToHand = useCallback((instanceId: string) => {
    let removed: CardInstance | undefined
    setGraveyard((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setHand((h) => [...h, { instanceId: removed!.instanceId, card: removed!.card }]) })
  }, [])

  const returnFromExileToHand = useCallback((instanceId: string) => {
    let removed: CardInstance | undefined
    setExile((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setHand((h) => [...h, { instanceId: removed!.instanceId, card: removed!.card }]) })
  }, [])

  const returnFromGraveyardToBattlefield = useCallback((instanceId: string) => {
    let removed: CardInstance | undefined
    setGraveyard((prev) => { removed = prev.find((c) => c.instanceId === instanceId); return prev.filter((c) => c.instanceId !== instanceId) })
    queueMicrotask(() => { if (removed) setBattlefield((bf) => [...bf, { instanceId: removed!.instanceId, card: removed!.card, tapped: false }]) })
  }, [])

  // Phase / Turn
  const nextPhase = useCallback(() => {
    const phaseKeys = PHASES.map((p) => p.key)
    const idx = phaseKeys.indexOf(phase)
    if (idx < phaseKeys.length - 1) {
      const next = phaseKeys[idx + 1]
      setPhase(next)
      if (next === 'draw') drawOneCard()
    }
  }, [phase, drawOneCard])

  const nextTurn = useCallback(() => {
    setTurn((t) => t + 1)
    setPhase('untap')
    setBattlefield((prev) => prev.map((c) => ({ ...c, tapped: false })))
  }, [])

  const restart = useCallback(() => {
    instanceCounter = 0
    const reshuffled = shuffle(fullDeck.map(makeInstance))
    setHand(reshuffled.slice(0, 7))
    setLibrary(reshuffled.slice(7))
    setBattlefield([])
    setGraveyard([])
    setExile([])
    setCommandZone(commanders.map(makeInstance))
    setTurn(1); setPhase('main1'); setLife(20)
    setMulliganCount(0); setStage('mulligan')
    setBottomSelectIds(new Set()); setViewingZone(null); setPreview(null)
  }, [fullDeck, commanders])

  const closePreview = useCallback(() => setPreview(null), [])

  // Generic zone move helpers for goldfish (local state)
  const sendToBottom = useCallback((instanceId: string, from: string) => {
    // Remove from source zone
    if (from === 'hand') setHand(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'battlefield') setBattlefield(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'graveyard') setGraveyard(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'exile') setExile(prev => prev.filter(c => c.instanceId !== instanceId))
    // For library, we need to remove from current position and re-add to bottom
    else if (from === 'library') {
      setLibrary(prev => {
        const card = prev.find(c => c.instanceId === instanceId)
        if (!card) return prev
        return [...prev.filter(c => c.instanceId !== instanceId), card]
      })
      setPreview(null)
      return
    }
    // Add to bottom of library
    queueMicrotask(() => {
      // We need the card data - find it from any zone
      const findCard = () => {
        const h = hand.find(c => c.instanceId === instanceId)
        if (h) return { instanceId: h.instanceId, card: h.card }
        const b = battlefield.find(c => c.instanceId === instanceId)
        if (b) return { instanceId: b.instanceId, card: b.card }
        const g = graveyard.find(c => c.instanceId === instanceId)
        if (g) return g
        const e = exile.find(c => c.instanceId === instanceId)
        if (e) return e
        return null
      }
      const card = findCard()
      if (card) setLibrary(prev => [...prev, card])
    })
    setPreview(null)
  }, [hand, battlefield, graveyard, exile])

  const sendToTop = useCallback((instanceId: string, from: string) => {
    if (from === 'hand') setHand(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'battlefield') setBattlefield(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'graveyard') setGraveyard(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'exile') setExile(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'library') {
      setLibrary(prev => {
        const card = prev.find(c => c.instanceId === instanceId)
        if (!card) return prev
        return [card, ...prev.filter(c => c.instanceId !== instanceId)]
      })
      setPreview(null)
      return
    }
    queueMicrotask(() => {
      const findCard = () => {
        const h = hand.find(c => c.instanceId === instanceId)
        if (h) return { instanceId: h.instanceId, card: h.card }
        const b = battlefield.find(c => c.instanceId === instanceId)
        if (b) return { instanceId: b.instanceId, card: b.card }
        const g = graveyard.find(c => c.instanceId === instanceId)
        if (g) return g
        const e = exile.find(c => c.instanceId === instanceId)
        if (e) return e
        return null
      }
      const card = findCard()
      if (card) setLibrary(prev => [card, ...prev])
    })
    setPreview(null)
  }, [hand, battlefield, graveyard, exile])

  const shuffleIntoLibrary = useCallback((instanceId: string, from: string) => {
    if (from === 'hand') setHand(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'battlefield') setBattlefield(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'graveyard') setGraveyard(prev => prev.filter(c => c.instanceId !== instanceId))
    else if (from === 'exile') setExile(prev => prev.filter(c => c.instanceId !== instanceId))
    queueMicrotask(() => {
      const findCard = () => {
        const h = hand.find(c => c.instanceId === instanceId)
        if (h) return { instanceId: h.instanceId, card: h.card }
        const b = battlefield.find(c => c.instanceId === instanceId)
        if (b) return { instanceId: b.instanceId, card: b.card }
        const g = graveyard.find(c => c.instanceId === instanceId)
        if (g) return g
        const e = exile.find(c => c.instanceId === instanceId)
        if (e) return e
        return null
      }
      const card = findCard()
      if (card) setLibrary(prev => shuffle([...prev, card]))
    })
    setPreview(null)
  }, [hand, battlefield, graveyard, exile])

  // Play from graveyard/exile/library to battlefield
  const playFromZone = useCallback((instanceId: string, from: string) => {
    let removed: CardInstance | undefined
    if (from === 'graveyard') {
      setGraveyard(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    } else if (from === 'exile') {
      setExile(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    } else if (from === 'library') {
      setLibrary(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    }
    queueMicrotask(() => { if (removed) setBattlefield(bf => [...bf, { instanceId: removed!.instanceId, card: removed!.card, tapped: false }]) })
    setPreview(null)
  }, [])

  // Return to hand from graveyard/exile/library
  const returnToHandFromZone = useCallback((instanceId: string, from: string) => {
    let removed: CardInstance | undefined
    if (from === 'graveyard') {
      setGraveyard(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    } else if (from === 'exile') {
      setExile(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    } else if (from === 'library') {
      setLibrary(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    }
    queueMicrotask(() => { if (removed) setHand(h => [...h, { instanceId: removed!.instanceId, card: removed!.card }]) })
    setPreview(null)
  }, [])

  // Exile from graveyard/library
  const exileFromZone = useCallback((instanceId: string, from: string) => {
    let removed: CardInstance | undefined
    if (from === 'graveyard') {
      setGraveyard(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    } else if (from === 'library') {
      setLibrary(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    }
    queueMicrotask(() => { if (removed) setExile(e => [...e, { instanceId: removed!.instanceId, card: removed!.card }]) })
    setPreview(null)
  }, [])

  // Send to graveyard from exile/library
  const sendToGraveyardFromZone = useCallback((instanceId: string, from: string) => {
    let removed: CardInstance | undefined
    if (from === 'exile') {
      setExile(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    } else if (from === 'library') {
      setLibrary(prev => { removed = prev.find(c => c.instanceId === instanceId); return prev.filter(c => c.instanceId !== instanceId) })
    }
    queueMicrotask(() => { if (removed) setGraveyard(g => [...g, { instanceId: removed!.instanceId, card: removed!.card }]) })
    setPreview(null)
  }, [])

  const cardPreviewOverlay = (
    <CardPreviewOverlay
      preview={preview}
      onClose={closePreview}
      readOnly={!preview?.instanceId || !preview?.zone}

      {...(preview?.zone === 'hand' ? {
        onPlay: playCard,
        onDiscard: sendFromHandToGraveyard,
        onExile: exileFromHand,
        onSendToBottom: (id: string) => sendToBottom(id, 'hand'),
        onSendToTop: (id: string) => sendToTop(id, 'hand'),
        onShuffle: (id: string) => shuffleIntoLibrary(id, 'hand'),
      } : {})}

      {...(preview?.zone === 'battlefield' ? {
        onSacrifice: sendToGraveyard,
        onExile: exileCard,
        onReturnToHand: returnToHand,
        onSendToBottom: (id: string) => sendToBottom(id, 'battlefield'),
        onSendToTop: (id: string) => sendToTop(id, 'battlefield'),
        onShuffle: (id: string) => shuffleIntoLibrary(id, 'battlefield'),
        onTap: tapToggle,
      } : {})}

      {...(preview?.zone === 'commandZone' ? {
        onCastCommander: playFromCommandZone,
      } : {})}

      {...(preview?.zone === 'graveyard' ? {
        onPlay: (id: string) => playFromZone(id, 'graveyard'),
        onReturnToHand: (id: string) => returnToHandFromZone(id, 'graveyard'),
        onExile: (id: string) => exileFromZone(id, 'graveyard'),
        onSendToBottom: (id: string) => sendToBottom(id, 'graveyard'),
        onSendToTop: (id: string) => sendToTop(id, 'graveyard'),
        onShuffle: (id: string) => shuffleIntoLibrary(id, 'graveyard'),
      } : {})}

      {...(preview?.zone === 'exile' ? {
        onPlay: (id: string) => playFromZone(id, 'exile'),
        onReturnToHand: (id: string) => returnToHandFromZone(id, 'exile'),
        onSendToGraveyard: (id: string) => sendToGraveyardFromZone(id, 'exile'),
        onSendToBottom: (id: string) => sendToBottom(id, 'exile'),
        onSendToTop: (id: string) => sendToTop(id, 'exile'),
        onShuffle: (id: string) => shuffleIntoLibrary(id, 'exile'),
      } : {})}

      {...(preview?.zone === 'library' ? {
        onPlay: (id: string) => playFromZone(id, 'library'),
        onReturnToHand: (id: string) => returnToHandFromZone(id, 'library'),
        onSendToGraveyard: (id: string) => sendToGraveyardFromZone(id, 'library'),
        onExile: (id: string) => exileFromZone(id, 'library'),
        onSendToBottom: (id: string) => sendToBottom(id, 'library'),
        onSendToTop: (id: string) => sendToTop(id, 'library'),
      } : {})}
    />
  )

  // -- Mulligan overlay --
  if (stage === 'mulligan') {
    return (
      <div className="flex min-h-screen flex-col bg-bg-dark">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-3">
          <button onClick={() => router.push(`/decks/${deckId}`)} className="flex items-center gap-1.5 text-sm text-font-secondary hover:text-font-primary">
            <ArrowLeft size={16} /> Back
          </button>
          <span className="text-sm font-semibold text-font-primary">{deckName}</span>
          <span className="text-xs text-font-muted">{mulliganCount > 0 ? `Mulligan ${mulliganCount}` : 'Opening Hand'}</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <h2 className="text-lg font-bold text-font-primary">
            {mulliganCount === 0 ? 'Opening Hand' : `Mulligan ${mulliganCount} — Draw 7`}
          </h2>
          <p className="text-sm text-font-secondary">
            {mulliganCount > 0 ? `After keeping, put ${mulliganCount} card${mulliganCount > 1 ? 's' : ''} on bottom.` : 'Keep this hand or mulligan?'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {hand.map((hc) => (
              <button key={hc.instanceId} onClick={() => setPreviewCard(hc.card)}
                className="overflow-hidden rounded-lg border border-border-light transition-transform hover:scale-105" style={{ width: 90, height: 126 }}>
                {hc.card.image_small ? <img src={hc.card.image_small} alt={hc.card.name} className="h-full w-full object-cover" /> : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg-surface p-2">
                    <span className="text-[8px] text-font-secondary">{hc.card.type_line?.split('—')[0].trim()}</span>
                    <span className="text-center text-[10px] font-semibold text-font-primary">{hc.card.name}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={keepHand} className="rounded-xl bg-bg-green px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-green/80">Keep</button>
            <button onClick={doMulligan} className="rounded-xl bg-bg-accent px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-accent-dark">Mulligan</button>
          </div>
        </div>
        {cardPreviewOverlay}
      </div>
    )
  }

  // -- Bottom cards selection --
  if (stage === 'bottomCards') {
    return (
      <div className="flex min-h-screen flex-col bg-bg-dark">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-3">
          <span className="text-sm font-semibold text-font-primary">{deckName}</span>
          <span className="text-xs text-font-muted">Select {mulliganCount} card{mulliganCount > 1 ? 's' : ''} to put on bottom</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <h2 className="text-lg font-bold text-font-primary">Put {mulliganCount} Card{mulliganCount > 1 ? 's' : ''} on Bottom</h2>
          <p className="text-sm text-font-secondary">Selected: {bottomSelectIds.size} / {mulliganCount}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {hand.map((hc) => {
              const isSelected = bottomSelectIds.has(hc.instanceId)
              return (
                <button key={hc.instanceId}
                  onClick={() => { if (!isSelected && bottomSelectIds.size >= mulliganCount) return; toggleBottomSelect(hc.instanceId) }}
                  className={`relative overflow-hidden rounded-lg border transition-all ${isSelected ? 'border-bg-red ring-2 ring-bg-red/40' : 'border-border-light hover:border-bg-accent'}`}
                  style={{ width: 90, height: 126 }}>
                  {hc.card.image_small ? <img src={hc.card.image_small} alt={hc.card.name} className="h-full w-full object-cover" /> : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg-surface p-2">
                      <span className="text-[8px] text-font-secondary">{hc.card.type_line?.split('—')[0].trim()}</span>
                      <span className="text-center text-[10px] font-semibold text-font-primary">{hc.card.name}</span>
                    </div>
                  )}
                  {isSelected && <div className="absolute inset-0 flex items-center justify-center bg-bg-dark/50"><span className="text-xs font-bold text-font-white">BOTTOM</span></div>}
                </button>
              )
            })}
          </div>
          <button onClick={confirmBottomCards} disabled={bottomSelectIds.size !== mulliganCount}
            className="rounded-xl bg-bg-green px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-green/80 disabled:cursor-not-allowed disabled:opacity-40">
            Confirm ({bottomSelectIds.size}/{mulliganCount})
          </button>
        </div>
      </div>
    )
  }

  // -- Main game layout: battlefield on top, controls on bottom --
  return (
    <div className="flex min-h-screen flex-col bg-bg-dark">
      {/* Top bar — minimal: back + deck name */}
      <div className="flex items-center justify-between border-b border-border bg-bg-surface px-3 py-1.5">
        <button onClick={() => router.push(`/decks/${deckId}`)} className="flex items-center gap-1 text-xs text-font-secondary hover:text-font-primary">
          <ArrowLeft size={14} /> Deck
        </button>
        <span className="text-xs font-semibold text-font-primary">{deckName}</span>
        <button onClick={restart} className="flex items-center gap-1 text-xs text-font-secondary hover:text-font-primary">
          <Shuffle size={14} /> Restart
        </button>
      </div>

      {/* Battlefield — takes all available space */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* Commander zone */}
        {commandZone.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-bg-yellow">
              <Crown size={10} /> COMMAND ZONE ({commandZone.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {commandZone.map((ci) => (
                <button key={ci.instanceId}
                  onClick={() => setPreview({ card: ci.card, zone: 'commandZone', instanceId: ci.instanceId })}
                  className="overflow-hidden rounded-lg border-2 border-bg-yellow/50 shadow-md shadow-bg-yellow/10"
                  style={{ width: 68, height: 95 }}>
                  {ci.card.image_small ? (
                    <img src={ci.card.image_small} alt={ci.card.name} className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-bg-cell p-1">
                      <span className="text-center text-[8px] font-semibold text-font-primary">{ci.card.name}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Commanders on battlefield (show label if any) */}
        <div className="flex flex-col gap-3">
          <BattlefieldZone title="LANDS" cards={lands} onTapToggle={tapToggle} onSendToGraveyard={sendToGraveyard} onExile={exileCard} onReturnToHand={returnToHand}
            onCardPreview={(card, id, tapped) => setPreview({ card, zone: 'battlefield', instanceId: id, tapped })} />
          <BattlefieldZone title="CREATURES" cards={creatures} onTapToggle={tapToggle} onSendToGraveyard={sendToGraveyard} onExile={exileCard} onReturnToHand={returnToHand}
            onCardPreview={(card, id, tapped) => setPreview({ card, zone: 'battlefield', instanceId: id, tapped })} />
          <BattlefieldZone title="OTHER PERMANENTS" cards={otherPermanents} onTapToggle={tapToggle} onSendToGraveyard={sendToGraveyard} onExile={exileCard} onReturnToHand={returnToHand}
            onCardPreview={(card, id, tapped) => setPreview({ card, zone: 'battlefield', instanceId: id, tapped })} />
        </div>
      </div>

      {/* Hand area */}
      <div className="border-t border-border bg-bg-card px-3 py-2">
        <HandArea cards={hand} onPlayCard={playCard}
          onCardPreview={(card, instanceId) => setPreview({ card, zone: 'hand', instanceId })} />
      </div>

      {/* Bottom controls: phase + info + actions */}
      <div className="border-t border-border bg-bg-surface">
        {/* Phase tracker */}
        <div className="px-3 py-1.5">
          <PhaseTracker currentPhase={phase} onPhaseClick={setPhase} />
        </div>

        {/* Info bar: turn, life, zones */}
        <div className="flex items-center justify-between border-t border-border/50 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider text-font-muted">T{turn}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={() => setLife((l) => l - 1)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-secondary active:bg-bg-red active:text-font-white">
              <Minus size={10} />
            </button>
            <div className="flex items-center gap-0.5">
              <Heart size={12} className="text-bg-red" />
              <span className="min-w-[20px] text-center text-sm font-bold text-font-primary">{life}</span>
            </div>
            <button onClick={() => setLife((l) => l + 1)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-secondary active:bg-bg-green active:text-font-white">
              <Plus size={10} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setViewingZone('graveyard')} className="flex items-center gap-0.5 text-font-secondary active:text-font-primary" title="Graveyard">
              <Archive size={11} /><span className="text-[10px] font-semibold">{graveyard.length}</span>
            </button>
            <button onClick={() => setViewingZone('exile')} className="flex items-center gap-0.5 text-font-secondary active:text-font-primary" title="Exile">
              <Ban size={11} /><span className="text-[10px] font-semibold">{exile.length}</span>
            </button>
            <button onClick={() => setViewingZone('library')} className="flex items-center gap-0.5 text-font-secondary active:text-font-primary" title="Library">
              <BookOpen size={11} /><span className="text-[10px] font-semibold">{library.length}</span>
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button onClick={drawOneCard} disabled={library.length === 0}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-cell py-2 text-font-secondary active:bg-bg-hover disabled:opacity-40">
            <Layers size={16} /><span className="text-[8px] font-bold tracking-wider">DRAW</span>
          </button>
          <button onClick={nextPhase}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-accent py-2 text-font-white active:bg-bg-accent-dark">
            <SkipForward size={16} /><span className="text-[8px] font-bold tracking-wider">NEXT PHASE</span>
          </button>
          <button onClick={nextTurn}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-cell py-2 text-font-secondary active:bg-bg-hover">
            <RotateCcw size={16} /><span className="text-[8px] font-bold tracking-wider">NEXT TURN</span>
          </button>
        </div>
      </div>

      {/* Zone viewer overlays */}
      {viewingZone === 'graveyard' && (
        <CardZoneViewer title="Graveyard" cards={graveyard} groupByType
          onClose={() => setViewingZone(null)}
          onCardPreview={setPreviewCard}
          onCardAction={(entry) => setPreview({ card: entry.card, zone: 'graveyard', instanceId: entry.instanceId })} />
      )}
      {viewingZone === 'exile' && (
        <CardZoneViewer title="Exile" cards={exile}
          onClose={() => setViewingZone(null)}
          onCardPreview={setPreviewCard}
          onCardAction={(entry) => setPreview({ card: entry.card, zone: 'exile', instanceId: entry.instanceId })} />
      )}
      {viewingZone === 'library' && (
        <CardZoneViewer title="Library" cards={library}
          onClose={() => setViewingZone(null)}
          onCardPreview={setPreviewCard}
          onCardAction={(entry) => setPreview({ card: entry.card, zone: 'library', instanceId: entry.instanceId })} />
      )}

      {cardPreviewOverlay}
    </div>
  )
}
