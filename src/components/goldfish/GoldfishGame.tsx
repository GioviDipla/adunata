'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Heart,
  Minus,
  Plus,
  Layers,
  Archive,
  Ban,
  SkipForward,
  RotateCcw,
  ArrowLeft,
  Shuffle,
  X,
} from 'lucide-react'
import PhaseTracker, { PHASES, type Phase } from './PhaseTracker'
import BattlefieldZone, { type BattlefieldCard } from './BattlefieldZone'
import HandArea, { type HandCardEntry } from './HandArea'
import CardZoneViewer from './CardZoneViewer'
import { getCardZone } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface GoldfishGameProps {
  deckName: string
  deckId: string
  fullDeck: CardRow[]
}

interface CardInstance {
  instanceId: string
  card: CardRow
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let instanceCounter = 0
function makeInstance(card: CardRow): CardInstance {
  return { instanceId: `ci-${++instanceCounter}`, card }
}

type GameStage = 'mulligan' | 'bottomCards' | 'playing'

export default function GoldfishGame({ deckName, deckId, fullDeck }: GoldfishGameProps) {
  const router = useRouter()

  const initialLibrary = useMemo(() => {
    return shuffle(fullDeck.map(makeInstance))
  }, [fullDeck])

  const [library, setLibrary] = useState<CardInstance[]>(() => initialLibrary.slice(7))
  const [hand, setHand] = useState<HandCardEntry[]>(() => initialLibrary.slice(0, 7))
  const [battlefield, setBattlefield] = useState<BattlefieldCard[]>([])
  const [graveyard, setGraveyard] = useState<CardInstance[]>([])
  const [exile, setExile] = useState<CardInstance[]>([])

  const [turn, setTurn] = useState(1)
  const [phase, setPhase] = useState<Phase>('main1')
  const [life, setLife] = useState(20)
  const [mulliganCount, setMulliganCount] = useState(0)

  const [stage, setStage] = useState<GameStage>('mulligan')
  const [bottomSelectIds, setBottomSelectIds] = useState<Set<string>>(new Set())
  const [viewingZone, setViewingZone] = useState<'graveyard' | 'exile' | null>(null)

  // Card preview state
  const [previewCard, setPreviewCard] = useState<CardRow | null>(null)

  // Ref to track pending draw to avoid StrictMode double-fire
  const drawPendingRef = useRef(false)

  // Derived battlefield zones
  const lands = useMemo(
    () => battlefield.filter((c) => getCardZone(c.card.type_line) === 'lands'),
    [battlefield]
  )
  const creatures = useMemo(
    () => battlefield.filter((c) => getCardZone(c.card.type_line) === 'creatures'),
    [battlefield]
  )
  const otherPermanents = useMemo(
    () => battlefield.filter((c) => getCardZone(c.card.type_line) === 'other'),
    [battlefield]
  )

  // -- Mulligan actions --
  const doMulligan = useCallback(() => {
    const newCount = mulliganCount + 1
    setMulliganCount(newCount)
    const reshuffled = shuffle(fullDeck.map(makeInstance))
    setHand(reshuffled.slice(0, 7))
    setLibrary(reshuffled.slice(7))
    setBattlefield([])
    setGraveyard([])
    setExile([])
  }, [mulliganCount, fullDeck])

  const keepHand = useCallback(() => {
    if (mulliganCount > 0) {
      setStage('bottomCards')
      setBottomSelectIds(new Set())
    } else {
      setStage('playing')
    }
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
      if (next.has(instanceId)) {
        next.delete(instanceId)
      } else {
        next.add(instanceId)
      }
      return next
    })
  }, [])

  // -- Game actions --
  const drawOneCard = useCallback(() => {
    if (drawPendingRef.current) return
    drawPendingRef.current = true

    setLibrary((prevLib) => {
      if (prevLib.length === 0) {
        drawPendingRef.current = false
        return prevLib
      }
      const drawn = prevLib[0]
      queueMicrotask(() => {
        setHand((prevHand) => [...prevHand, { instanceId: drawn.instanceId, card: drawn.card }])
        drawPendingRef.current = false
      })
      return prevLib.slice(1)
    })
  }, [])

  const playCard = useCallback((instanceId: string) => {
    let played: HandCardEntry | undefined
    setHand((prev) => {
      played = prev.find((c) => c.instanceId === instanceId)
      return prev.filter((c) => c.instanceId !== instanceId)
    })
    // Use microtask to avoid nested setState
    queueMicrotask(() => {
      if (played) {
        setBattlefield((bf) => [
          ...bf,
          { instanceId: played!.instanceId, card: played!.card, tapped: false },
        ])
      }
    })
  }, [])

  const tapToggle = useCallback((instanceId: string) => {
    setBattlefield((prev) =>
      prev.map((c) =>
        c.instanceId === instanceId ? { ...c, tapped: !c.tapped } : c
      )
    )
  }, [])

  const sendToGraveyard = useCallback((instanceId: string) => {
    let removed: BattlefieldCard | undefined
    setBattlefield((prev) => {
      removed = prev.find((c) => c.instanceId === instanceId)
      return prev.filter((c) => c.instanceId !== instanceId)
    })
    queueMicrotask(() => {
      if (removed) {
        setGraveyard((g) => [...g, { instanceId: removed!.instanceId, card: removed!.card }])
      }
    })
  }, [])

  const exileCard = useCallback((instanceId: string) => {
    let removed: BattlefieldCard | undefined
    setBattlefield((prev) => {
      removed = prev.find((c) => c.instanceId === instanceId)
      return prev.filter((c) => c.instanceId !== instanceId)
    })
    queueMicrotask(() => {
      if (removed) {
        setExile((e) => [...e, { instanceId: removed!.instanceId, card: removed!.card }])
      }
    })
  }, [])

  const returnToHand = useCallback((instanceId: string) => {
    let removed: BattlefieldCard | undefined
    setBattlefield((prev) => {
      removed = prev.find((c) => c.instanceId === instanceId)
      return prev.filter((c) => c.instanceId !== instanceId)
    })
    queueMicrotask(() => {
      if (removed) {
        setHand((h) => [...h, { instanceId: removed!.instanceId, card: removed!.card }])
      }
    })
  }, [])

  const returnFromGraveyardToHand = useCallback((instanceId: string) => {
    let removed: CardInstance | undefined
    setGraveyard((prev) => {
      removed = prev.find((c) => c.instanceId === instanceId)
      return prev.filter((c) => c.instanceId !== instanceId)
    })
    queueMicrotask(() => {
      if (removed) {
        setHand((h) => [...h, { instanceId: removed!.instanceId, card: removed!.card }])
      }
    })
  }, [])

  const returnFromExileToHand = useCallback((instanceId: string) => {
    let removed: CardInstance | undefined
    setExile((prev) => {
      removed = prev.find((c) => c.instanceId === instanceId)
      return prev.filter((c) => c.instanceId !== instanceId)
    })
    queueMicrotask(() => {
      if (removed) {
        setHand((h) => [...h, { instanceId: removed!.instanceId, card: removed!.card }])
      }
    })
  }, [])

  const returnFromGraveyardToBattlefield = useCallback((instanceId: string) => {
    let removed: CardInstance | undefined
    setGraveyard((prev) => {
      removed = prev.find((c) => c.instanceId === instanceId)
      return prev.filter((c) => c.instanceId !== instanceId)
    })
    queueMicrotask(() => {
      if (removed) {
        setBattlefield((bf) => [
          ...bf,
          { instanceId: removed!.instanceId, card: removed!.card, tapped: false },
        ])
      }
    })
  }, [])

  // Phase / Turn
  const nextPhase = useCallback(() => {
    const phaseKeys = PHASES.map((p) => p.key)
    const idx = phaseKeys.indexOf(phase)
    if (idx < phaseKeys.length - 1) {
      const next = phaseKeys[idx + 1]
      setPhase(next)
      if (next === 'draw') {
        drawOneCard()
      }
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
    setTurn(1)
    setPhase('main1')
    setLife(20)
    setMulliganCount(0)
    setStage('mulligan')
    setBottomSelectIds(new Set())
    setViewingZone(null)
    setPreviewCard(null)
  }, [fullDeck])

  // -- Card preview overlay --
  const CardPreviewOverlay = previewCard ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-sm"
      onClick={() => setPreviewCard(null)}
    >
      <div
        className="relative flex max-h-[90vh] max-w-md flex-col items-center gap-4 p-4"
      >
        {previewCard.image_normal ? (
          <img
            src={previewCard.image_normal}
            alt={previewCard.name}
            className="max-h-[70vh] rounded-xl"
          />
        ) : previewCard.image_small ? (
          <img
            src={previewCard.image_small}
            alt={previewCard.name}
            className="max-h-[70vh] rounded-xl"
          />
        ) : (
          <div className="flex h-64 w-48 flex-col items-center justify-center gap-2 rounded-xl bg-bg-surface p-4">
            <span className="text-xs text-font-secondary">{previewCard.type_line}</span>
            <span className="text-center text-lg font-bold text-font-primary">{previewCard.name}</span>
            {previewCard.oracle_text && (
              <p className="text-center text-xs text-font-secondary">{previewCard.oracle_text}</p>
            )}
          </div>
        )}
        <div className="text-center">
          <h3 className="text-sm font-bold text-font-primary">{previewCard.name}</h3>
          <p className="text-xs text-font-secondary">{previewCard.type_line}</p>
          {previewCard.oracle_text && (
            <p className="mt-2 max-w-xs text-xs text-font-muted">{previewCard.oracle_text}</p>
          )}
        </div>
      </div>
    </div>
  ) : null

  // -- Mulligan overlay --
  if (stage === 'mulligan') {
    return (
      <div className="flex min-h-screen flex-col bg-bg-dark">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-3">
          <button
            onClick={() => router.push(`/decks/${deckId}`)}
            className="flex items-center gap-1.5 text-sm text-font-secondary hover:text-font-primary"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <span className="text-sm font-semibold text-font-primary">{deckName}</span>
          <span className="text-xs text-font-muted">
            {mulliganCount > 0 ? `Mulligan ${mulliganCount}` : 'Opening Hand'}
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <h2 className="text-lg font-bold text-font-primary">
            {mulliganCount === 0 ? 'Opening Hand' : `Mulligan ${mulliganCount} — Draw 7`}
          </h2>
          <p className="text-sm text-font-secondary">
            {mulliganCount > 0
              ? `After keeping, you will put ${mulliganCount} card${mulliganCount > 1 ? 's' : ''} on the bottom.`
              : 'Keep this hand or mulligan?'}
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {hand.map((hc) => (
              <button
                key={hc.instanceId}
                onClick={() => setPreviewCard(hc.card)}
                className="overflow-hidden rounded-lg border border-border-light transition-transform hover:scale-105"
                style={{ width: 90, height: 126 }}
              >
                {hc.card.image_small ? (
                  <img src={hc.card.image_small} alt={hc.card.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg-surface p-2">
                    <span className="text-[8px] text-font-secondary">{hc.card.type_line?.split('—')[0].trim()}</span>
                    <span className="text-center text-[10px] font-semibold text-font-primary">{hc.card.name}</span>
                    {hc.card.mana_cost && (
                      <span className="text-[9px] font-bold text-font-accent">{hc.card.mana_cost}</span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={keepHand}
              className="rounded-xl bg-bg-green px-6 py-2.5 text-sm font-bold text-font-white transition-colors hover:bg-bg-green/80"
            >
              Keep
            </button>
            <button
              onClick={doMulligan}
              className="rounded-xl bg-bg-accent px-6 py-2.5 text-sm font-bold text-font-white transition-colors hover:bg-bg-accent-dark"
            >
              Mulligan
            </button>
          </div>
        </div>
        {CardPreviewOverlay}
      </div>
    )
  }

  // -- Bottom cards selection --
  if (stage === 'bottomCards') {
    return (
      <div className="flex min-h-screen flex-col bg-bg-dark">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-3">
          <span className="text-sm font-semibold text-font-primary">{deckName}</span>
          <span className="text-xs text-font-muted">
            Select {mulliganCount} card{mulliganCount > 1 ? 's' : ''} to put on bottom
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <h2 className="text-lg font-bold text-font-primary">
            Put {mulliganCount} Card{mulliganCount > 1 ? 's' : ''} on Bottom
          </h2>
          <p className="text-sm text-font-secondary">
            Selected: {bottomSelectIds.size} / {mulliganCount}
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {hand.map((hc) => {
              const isSelected = bottomSelectIds.has(hc.instanceId)
              return (
                <button
                  key={hc.instanceId}
                  onClick={() => {
                    if (!isSelected && bottomSelectIds.size >= mulliganCount) return
                    toggleBottomSelect(hc.instanceId)
                  }}
                  className={`relative overflow-hidden rounded-lg border transition-all ${
                    isSelected
                      ? 'border-bg-red ring-2 ring-bg-red/40'
                      : 'border-border-light hover:border-bg-accent'
                  }`}
                  style={{ width: 90, height: 126 }}
                >
                  {hc.card.image_small ? (
                    <img src={hc.card.image_small} alt={hc.card.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg-surface p-2">
                      <span className="text-[8px] text-font-secondary">{hc.card.type_line?.split('—')[0].trim()}</span>
                      <span className="text-center text-[10px] font-semibold text-font-primary">{hc.card.name}</span>
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-bg-dark/50">
                      <span className="text-xs font-bold text-font-white">BOTTOM</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <button
            onClick={confirmBottomCards}
            disabled={bottomSelectIds.size !== mulliganCount}
            className="rounded-xl bg-bg-green px-6 py-2.5 text-sm font-bold text-font-white transition-colors hover:bg-bg-green/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm ({bottomSelectIds.size}/{mulliganCount})
          </button>
        </div>
      </div>
    )
  }

  // -- Main game --
  return (
    <div className="flex min-h-screen flex-col bg-bg-dark">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border bg-bg-surface px-3 py-2">
        <button
          onClick={() => router.push(`/decks/${deckId}`)}
          className="flex items-center gap-1 text-xs text-font-secondary hover:text-font-primary"
        >
          <ArrowLeft size={14} />
          Deck
        </button>
        <span className="text-xs font-semibold text-font-primary">{deckName}</span>
        <button
          onClick={restart}
          className="flex items-center gap-1 text-xs text-font-secondary hover:text-font-primary"
        >
          <Shuffle size={14} />
          Restart
        </button>
      </div>

      {/* Phase tracker */}
      <div className="border-b border-border bg-bg-surface px-3 py-2">
        <PhaseTracker currentPhase={phase} onPhaseClick={setPhase} />
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between border-b border-border bg-bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-wider text-font-muted">TURN</span>
          <span className="text-sm font-bold text-font-primary">{turn}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setLife((l) => l - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-cell text-font-secondary hover:bg-bg-red hover:text-font-white"
          >
            <Minus size={12} />
          </button>
          <div className="flex items-center gap-1">
            <Heart size={14} className="text-bg-red" />
            <span className="min-w-[24px] text-center text-sm font-bold text-font-primary">{life}</span>
          </div>
          <button
            onClick={() => setLife((l) => l + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-cell text-font-secondary hover:bg-bg-green hover:text-font-white"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewingZone('graveyard')}
            className="flex items-center gap-1 text-font-secondary hover:text-font-primary"
            title="Graveyard"
          >
            <Archive size={12} />
            <span className="text-xs font-semibold">{graveyard.length}</span>
          </button>
          <button
            onClick={() => setViewingZone('exile')}
            className="flex items-center gap-1 text-font-secondary hover:text-font-primary"
            title="Exile"
          >
            <Ban size={12} />
            <span className="text-xs font-semibold">{exile.length}</span>
          </button>
          <div className="flex items-center gap-1 text-font-secondary" title="Library">
            <Layers size={12} />
            <span className="text-xs font-semibold">{library.length}</span>
          </div>
        </div>
      </div>

      {/* Battlefield */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-4">
          <BattlefieldZone
            title="LANDS"
            cards={lands}
            onTapToggle={tapToggle}
            onSendToGraveyard={sendToGraveyard}
            onExile={exileCard}
            onReturnToHand={returnToHand}
            onCardPreview={setPreviewCard}
          />
          <BattlefieldZone
            title="CREATURES"
            cards={creatures}
            onTapToggle={tapToggle}
            onSendToGraveyard={sendToGraveyard}
            onExile={exileCard}
            onReturnToHand={returnToHand}
            onCardPreview={setPreviewCard}
          />
          <BattlefieldZone
            title="OTHER PERMANENTS"
            cards={otherPermanents}
            onTapToggle={tapToggle}
            onSendToGraveyard={sendToGraveyard}
            onExile={exileCard}
            onReturnToHand={returnToHand}
            onCardPreview={setPreviewCard}
          />
        </div>
      </div>

      {/* Hand area */}
      <div className="border-t border-border bg-bg-card px-3 py-2">
        <HandArea cards={hand} onPlayCard={playCard} onCardPreview={setPreviewCard} />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 border-t border-border bg-bg-surface px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={drawOneCard}
          disabled={library.length === 0}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-cell py-2 text-font-secondary transition-colors hover:bg-bg-hover disabled:opacity-40"
        >
          <Layers size={18} />
          <span className="text-[8px] font-bold tracking-wider">DRAW</span>
        </button>
        <button
          onClick={nextPhase}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-accent py-2 text-font-white transition-colors hover:bg-bg-accent-dark"
        >
          <SkipForward size={18} />
          <span className="text-[8px] font-bold tracking-wider">NEXT PHASE</span>
        </button>
        <button
          onClick={nextTurn}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-cell py-2 text-font-secondary transition-colors hover:bg-bg-hover"
        >
          <RotateCcw size={18} />
          <span className="text-[8px] font-bold tracking-wider">NEXT TURN</span>
        </button>
      </div>

      {/* Zone viewer overlays */}
      {viewingZone === 'graveyard' && (
        <CardZoneViewer
          title="Graveyard"
          cards={graveyard}
          onClose={() => setViewingZone(null)}
          onReturnToHand={returnFromGraveyardToHand}
          onReturnToBattlefield={returnFromGraveyardToBattlefield}
        />
      )}
      {viewingZone === 'exile' && (
        <CardZoneViewer
          title="Exile"
          cards={exile}
          onClose={() => setViewingZone(null)}
          onReturnToHand={returnFromExileToHand}
        />
      )}

      {/* Card preview overlay */}
      {CardPreviewOverlay}
    </div>
  )
}
