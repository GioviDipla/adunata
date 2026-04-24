'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, GripVertical, Wand2, Sparkles } from 'lucide-react'
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
}

/**
 * Owner-only side panel for managing deck sections.
 *
 * Optimistic updates: we mutate local state first, then POST/PATCH/DELETE.
 * On non-ok we roll back. The parent `onChange` is the single source of
 * truth — we re-call it with the server echo (to pick up real row ids
 * after create) once the request resolves.
 */
export default function DeckSectionsPanel({ deckId, sections, onChange, onAutoAssignUpdates }: Props) {
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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg-surface p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-font-secondary">Sections</h3>
        <span className="text-[10px] text-font-muted">
          {sections.length}
        </span>
      </div>

      {sections.length === 0 && (
        <button
          onClick={applyPreset}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-bg-cell px-3 py-2 text-xs text-font-secondary hover:bg-bg-hover disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Apply Commander preset</span>
          <span className="sm:hidden">Commander preset</span>
        </button>
      )}

      {sections.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => autoAssign(false)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-border bg-bg-cell px-2 py-1 text-[11px] text-font-secondary hover:bg-bg-hover disabled:opacity-50"
              title="Categorize uncategorized cards via local heuristic"
            >
              <Sparkles className="h-3 w-3" />
              Auto-categorize
            </button>
            <button
              onClick={() => autoAssign(true)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-border bg-bg-cell px-2 py-1 text-[11px] text-font-muted hover:bg-bg-hover disabled:opacity-50"
              title="Re-categorize every card, overwriting current sections"
            >
              Re-categorize all
            </button>
          </div>
          {autoAssignSummary && (
            <div className="text-[10px] text-font-muted">{autoAssignSummary}</div>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-1">
                {sections.map((s) => (
                  <SortableSectionRow
                    key={s.id}
                    section={s}
                    onRemove={() => removeSection(s.id)}
                    onRename={(n) => renameSection(s.id, n)}
                    onSetColor={(c) => setColor(s.id, c)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}

      <div className="flex items-center gap-2">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void addSection()
            }
          }}
          placeholder="New section…"
          className="flex-1 rounded-md border border-border bg-bg-cell px-2 py-1.5 text-sm text-font-primary placeholder:text-font-muted focus:outline-none focus:ring-1 focus:ring-bg-accent"
        />
        <button
          onClick={addSection}
          disabled={busy || !draftName.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-accent text-font-white hover:bg-bg-accent-dark disabled:opacity-50"
          aria-label="Add section"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function SortableSectionRow({
  section,
  onRemove,
  onRename,
  onSetColor,
}: {
  section: SectionRow
  onRemove: () => void
  onRename: (n: string) => void
  onSetColor: (c: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.name)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-bg-cell px-2 py-1.5"
    >
      <button
        {...attributes}
        {...listeners}
        className="flex h-6 w-4 cursor-grab touch-none items-center justify-center text-font-muted hover:text-font-primary"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full border border-border"
        style={{ background: section.color ?? '#475569' }}
      />
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
          className="flex-1 rounded border border-border bg-bg-dark px-1.5 py-0.5 text-sm text-font-primary focus:outline-none focus:ring-1 focus:ring-bg-accent"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 truncate text-left text-sm text-font-primary hover:text-font-accent"
        >
          {section.name}
        </button>
      )}
      <input
        type="color"
        value={section.color ?? '#475569'}
        onChange={(e) => onSetColor(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent"
        aria-label="Section color"
      />
      <button
        onClick={onRemove}
        className="flex h-6 w-6 items-center justify-center rounded text-font-muted hover:bg-bg-red/20 hover:text-bg-red"
        aria-label="Delete section"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}
