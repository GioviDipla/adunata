'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Trash2,
  GripVertical,
  Wand2,
  Sparkles,
  Layers,
  Pencil,
  RefreshCw,
  Check,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SectionRow } from '@/types/deck'

interface Props {
  deckId: string
  sections: SectionRow[]
  onChange: (next: SectionRow[]) => void
  /** Optional: parent applies section_id updates to its local card state. */
  onAutoAssignUpdates?: (updates: Array<{ id: string; section_id: string }>) => void
  /** Card count per section id (for the inline count chip). */
  cardCounts?: Record<string, number>
  /** Cards with no section. */
  uncategorizedCount?: number
  /** When true, drop the panel's own outer chrome (border, gradient, title) —
   *  used by SidebarCards which wraps each panel in its own collapsible card. */
  chromeless?: boolean
}

// Curated palette — picked to feel cohesive with the dark UI and to map
// 1:1 onto the Commander preset categories without color-clashing.
const SWATCHES = [
  '#f59e0b', '#22c55e', '#3b82f6', '#ef4444', '#a855f7',
  '#eab308', '#06b6d4', '#64748b', '#ec4899', '#14b8a6',
] as const

/**
 * Owner-only side panel for managing deck sections.
 *
 * Optimistic updates: we mutate local state first, then POST/PATCH/DELETE.
 * On non-ok we roll back. The parent `onChange` is the single source of
 * truth — we re-call it with the server echo (to pick up real row ids
 * after create) once the request resolves.
 */
export default function DeckSectionsPanel({
  deckId,
  sections,
  onChange,
  onAutoAssignUpdates,
  cardCounts,
  uncategorizedCount = 0,
  chromeless = false,
}: Props) {
  const router = useRouter()
  const [draftName, setDraftName] = useState('')
  const [busy, setBusy] = useState(false)
  const [autoAssignSummary, setAutoAssignSummary] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function addSection() {
    const name = draftName.trim()
    if (!name || busy) return
    setBusy(true)
    const prev = sections
    const tempId = `temp-${Date.now()}`
    onChange([
      ...prev,
      { id: tempId, name, position: prev.length, color: null },
    ])
    setDraftName('')
    try {
      const res = await fetch(`/api/decks/${deckId}/sections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { section } = await res.json()
      onChange([
        ...prev,
        {
          id: section.id,
          name: section.name,
          position: section.position,
          color: section.color ?? null,
          is_collapsed: section.is_collapsed ?? false,
        },
      ])
    } catch {
      onChange(prev)
    } finally {
      setBusy(false)
    }
  }

  async function applyPreset() {
    if (busy || sections.length > 0) return
    setBusy(true)
    try {
      const res = await fetch(`/api/decks/${deckId}/sections/apply-preset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preset: 'commander' }),
      })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { sections: SectionRow[] }
      onChange(
        payload.sections.map((s) => ({
          id: s.id,
          name: s.name,
          position: s.position,
          color: s.color ?? null,
          is_collapsed: s.is_collapsed ?? false,
        })),
      )
    } finally {
      setBusy(false)
    }
  }

  async function autoAssign(overwrite: boolean) {
    if (busy || sections.length === 0) return
    setBusy(true)
    setAutoAssignSummary(null)
    try {
      const res = await fetch(`/api/decks/${deckId}/sections/auto-assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ overwrite }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setAutoAssignSummary(text || 'Auto-assign failed')
        return
      }
      const { assigned, skipped, total, updates } = await res.json()
      setAutoAssignSummary(`Assigned ${assigned} / ${total} (skipped ${skipped})`)
      if (Array.isArray(updates) && updates.length > 0) {
        onAutoAssignUpdates?.(updates)
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function removeSection(id: string) {
    const prev = sections
    onChange(prev.filter((s) => s.id !== id))
    const res = await fetch(`/api/decks/${deckId}/sections/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) onChange(prev)
  }

  async function renameSection(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const prev = sections
    onChange(prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)))
    const res = await fetch(`/api/decks/${deckId}/sections/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (!res.ok) onChange(prev)
  }

  async function setColor(id: string, color: string | null) {
    const prev = sections
    onChange(prev.map((s) => (s.id === id ? { ...s, color } : s)))
    const res = await fetch(`/api/decks/${deckId}/sections/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ color }),
    })
    if (!res.ok) onChange(prev)
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = sections.findIndex((s) => s.id === active.id)
    const newIndex = sections.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({
      ...s,
      position: i,
    }))
    const prev = sections
    onChange(next)
    const res = await fetch(`/api/decks/${deckId}/sections/reorder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: next.map((s) => ({ id: s.id, position: s.position })),
      }),
    })
    if (!res.ok) onChange(prev)
  }

  const totalAssigned = Object.values(cardCounts ?? {}).reduce(
    (s, n) => s + n,
    0,
  )
  const totalCards = totalAssigned + uncategorizedCount

  const Wrapper = chromeless
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : ({ children }: { children: React.ReactNode }) => (
        <div className="relative overflow-hidden rounded-2xl border border-border-light/60 bg-gradient-to-br from-bg-surface via-bg-surface to-bg-cell/40 shadow-sm">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-font-accent/40 to-transparent" />
          {children}
        </div>
      )

  return (
    <Wrapper>
      <div className={`flex flex-col gap-4 ${chromeless ? '' : 'p-4'}`}>
        {/* Internal header — hidden when SidebarCards already provides one */}
        {!chromeless && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-accent/10 text-font-accent">
                <Layers className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold tracking-tight text-font-primary">
                  Sections
                </h3>
                {totalCards > 0 && (
                  <p className="text-[10px] text-font-muted">
                    {totalAssigned} / {totalCards} sorted
                    {uncategorizedCount > 0 && (
                      <> · {uncategorizedCount} uncategorized</>
                    )}
                  </p>
                )}
              </div>
            </div>
            {sections.length > 0 && (
              <span className="rounded-full bg-bg-cell px-2 py-0.5 text-[10px] font-semibold tabular-nums text-font-secondary">
                {sections.length}
              </span>
            )}
          </div>
        )}

        {/* Empty state */}
        {sections.length === 0 && (
          <button
            onClick={applyPreset}
            disabled={busy}
            className="group/preset flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-light bg-bg-cell/50 px-4 py-6 text-center transition-all hover:border-font-accent/40 hover:bg-bg-accent/5 disabled:opacity-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-accent/10 text-font-accent transition-transform group-hover/preset:scale-110">
              <Wand2 className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-font-primary">
                Apply Commander preset
              </div>
              <div className="text-[11px] text-font-muted">
                9 ready-made categories — Ramp, Removal, Tutors…
              </div>
            </div>
          </button>
        )}

        {/* Auto-assign chips */}
        {sections.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => autoAssign(false)}
              disabled={busy}
              className="group/auto inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-accent/10 px-3 py-2 text-[11px] font-semibold text-font-accent transition-colors hover:bg-bg-accent/20 disabled:opacity-50"
              title="Categorize uncategorized cards via local heuristic"
            >
              <Sparkles className="h-3.5 w-3.5 transition-transform group-hover/auto:rotate-12" />
              Auto-categorize
            </button>
            <button
              onClick={() => autoAssign(true)}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-bg-cell px-3 py-2 text-[11px] font-medium text-font-muted transition-colors hover:bg-bg-hover hover:text-font-secondary disabled:opacity-50"
              title="Re-categorize every card, overwriting current sections"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline">Re-categorize all</span>
              <span className="sm:hidden">Reset</span>
            </button>
          </div>
        )}

        {autoAssignSummary && (
          <div className="rounded-lg border border-bg-accent/20 bg-bg-accent/5 px-2.5 py-1.5 text-[11px] text-font-secondary">
            {autoAssignSummary}
          </div>
        )}

        {/* Section list */}
        {sections.length > 0 && (
          <DndContext
            id={`deck-sections-${deckId}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-1.5">
                {sections.map((s) => (
                  <SortableSectionRow
                    key={s.id}
                    section={s}
                    cardCount={cardCounts?.[s.id] ?? 0}
                    onRemove={() => removeSection(s.id)}
                    onRename={(n) => renameSection(s.id, n)}
                    onSetColor={(c) => setColor(s.id, c)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {/* Add new section */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border-light/60 bg-bg-cell/60 p-1 focus-within:border-font-accent/60 focus-within:bg-bg-cell">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addSection()
              }
            }}
            placeholder="Add new section…"
            className="flex-1 bg-transparent px-2.5 py-1 text-sm text-font-primary placeholder:text-font-muted focus:outline-none"
          />
          <button
            onClick={addSection}
            disabled={busy || !draftName.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-accent text-font-white shadow-sm transition-all hover:bg-bg-accent/90 disabled:bg-bg-hover disabled:text-font-muted disabled:shadow-none"
            aria-label="Add section"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Wrapper>
  )
}

function SortableSectionRow({
  section,
  cardCount,
  onRemove,
  onRename,
  onSetColor,
}: {
  section: SectionRow
  cardCount: number
  onRemove: () => void
  onRename: (n: string) => void
  onSetColor: (c: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.name)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 30 : undefined,
  }
  const accent = section.color ?? '#64748b'

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group/row relative overflow-hidden rounded-xl border bg-bg-cell/70 transition-all ${
        isDragging
          ? 'border-font-accent/60 shadow-lg shadow-font-accent/10'
          : 'border-border/70 hover:border-border-light hover:bg-bg-cell'
      }`}
    >
      {/* Vertical accent stripe — uses the section color */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1.5 left-1.5 w-1 rounded-full"
        style={{ background: accent, boxShadow: `0 0 8px ${accent}40` }}
      />

      <div className="flex items-center gap-1.5 py-2 pl-5 pr-1.5">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-font-muted opacity-0 transition-opacity hover:text-font-primary group-hover/row:opacity-100 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Name + count */}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false)
              if (draft.trim() && draft.trim() !== section.name) onRename(draft)
              else setDraft(section.name)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                (e.currentTarget as HTMLInputElement).blur()
              else if (e.key === 'Escape') {
                setDraft(section.name)
                setEditing(false)
              }
            }}
            className="flex-1 rounded-md border border-font-accent/50 bg-bg-dark px-2 py-1 text-sm font-medium text-font-primary focus:outline-none focus:ring-1 focus:ring-font-accent"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex flex-1 items-center gap-2 truncate text-left text-sm font-semibold text-font-primary"
          >
            <span className="truncate">{section.name}</span>
            <span className="shrink-0 rounded-full bg-bg-dark/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-font-muted">
              {cardCount}
            </span>
          </button>
        )}

        {/* Action cluster — fade in on row hover */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-font-muted hover:bg-bg-hover hover:text-font-primary"
              aria-label="Rename section"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setPaletteOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-font-muted hover:bg-bg-hover hover:text-font-primary"
              aria-label="Change color"
              title="Color"
            >
              <span
                className="h-3.5 w-3.5 rounded-full ring-1 ring-border"
                style={{ background: accent }}
              />
            </button>
            {paletteOpen && (
              <div
                onMouseLeave={() => setPaletteOpen(false)}
                className="absolute right-0 top-full z-20 mt-1.5 grid grid-cols-5 gap-1.5 rounded-lg border border-border-light bg-bg-surface p-2 shadow-xl"
              >
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      onSetColor(c)
                      setPaletteOpen(false)
                    }}
                    className="relative flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-border transition-transform hover:scale-110"
                    style={{ background: c }}
                    aria-label={`Set color ${c}`}
                  >
                    {section.color === c && (
                      <Check className="h-3 w-3 text-bg-dark" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onRemove}
            className="flex h-7 w-7 items-center justify-center rounded-md text-font-muted hover:bg-bg-red/15 hover:text-bg-red"
            aria-label="Delete section"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  )
}
