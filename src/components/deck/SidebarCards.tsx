'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, GripVertical } from 'lucide-react'
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

export interface SidebarPanel {
  id: string
  /** Renders the header label + optional badge. */
  header: ReactNode
  body: ReactNode
}

interface Props {
  deckId: string
  /** Panel definitions in their default order. The user-saved order
   *  overrides this on the client after first paint. */
  panels: SidebarPanel[]
}

interface SavedState {
  order?: string[]
  collapsed?: Record<string, boolean>
}

const KEY = (deckId: string) => `adunata:deck-sidebar:${deckId}`

export default function SidebarCards({ deckId, panels }: Props) {
  // Default = the order we ship from the parent. Client hydrates from
  // localStorage to honour the user's last layout.
  const defaultOrder = panels.map((p) => p.id)
  const [order, setOrder] = useState<string[]>(defaultOrder)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(KEY(deckId))
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as SavedState
      if (Array.isArray(parsed.order)) {
        // Reconcile: keep user's order, append any new panels that appeared
        // since they last saved (e.g. we add a third panel down the road).
        const known = new Set(defaultOrder)
        const stored = parsed.order.filter((id) => known.has(id))
        const missing = defaultOrder.filter((id) => !stored.includes(id))
        setOrder([...stored, ...missing])
      }
      if (parsed.collapsed && typeof parsed.collapsed === 'object') {
        setCollapsed(parsed.collapsed)
      }
    } catch {
      /* ignore */
    }
    // We intentionally hydrate once per deckId — defaultOrder shouldn't
    // be a dep here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  function persist(nextOrder: string[], nextCollapsed: Record<string, boolean>) {
    if (typeof window === 'undefined') return
    const payload: SavedState = { order: nextOrder, collapsed: nextCollapsed }
    window.localStorage.setItem(KEY(deckId), JSON.stringify(payload))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function toggleCollapsed(id: string) {
    const next = { ...collapsed, [id]: !collapsed[id] }
    setCollapsed(next)
    persist(order, next)
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(order, oldIndex, newIndex)
    setOrder(next)
    persist(next, collapsed)
  }

  const byId = new Map(panels.map((p) => [p.id, p]))
  const orderedPanels = order
    .map((id) => byId.get(id))
    .filter((p): p is SidebarPanel => !!p)

  return (
    <DndContext
      id={`deck-sidebar-${deckId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-4">
          {orderedPanels.map((panel) => (
            <SortablePanelCard
              key={panel.id}
              panel={panel}
              collapsed={!!collapsed[panel.id]}
              onToggle={() => toggleCollapsed(panel.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

interface SortablePanelCardProps {
  panel: SidebarPanel
  collapsed: boolean
  onToggle: () => void
}

function SortablePanelCard({ panel, collapsed, onToggle }: SortablePanelCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: panel.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/panel rounded-2xl border bg-bg-surface transition-all ${
        isDragging
          ? 'border-font-accent/60 shadow-lg shadow-font-accent/10'
          : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1 px-3 pt-3">
        <button
          {...attributes}
          {...listeners}
          className="flex h-7 w-5 cursor-grab touch-none items-center justify-center text-font-muted opacity-0 transition-opacity hover:text-font-primary group-hover/panel:opacity-100 active:cursor-grabbing"
          aria-label="Reorder panel"
          title="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onToggle}
          className="flex flex-1 items-center justify-between gap-2 rounded-md text-left transition-colors hover:bg-bg-hover"
          aria-expanded={!collapsed}
        >
          <div className="flex-1">{panel.header}</div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-font-muted transition-transform ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        </button>
      </div>
      {!collapsed && <div className="px-3 pb-3 pt-2">{panel.body}</div>}
    </div>
  )
}
