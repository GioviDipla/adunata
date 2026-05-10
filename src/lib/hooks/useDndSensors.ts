'use client'

import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

// Distance-based activation only. PointerSensor handles both mouse and touch
// via pointer events on every modern browser. We intentionally do NOT register
// a TouchSensor: its delay-based activation (e.g. 220ms) would race with the
// useLongPress preview gesture (400ms) and steal the press, killing card
// previews on mobile. With distance activation, a still finger never triggers
// drag — so the long-press timer wins, and only intentional movement starts
// a drag.
const POINTER_DISTANCE_PX = 12

type Variant = 'game' | 'sortable'

export function useDndSensors(variant: Variant = 'game') {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: POINTER_DISTANCE_PX } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: variant === 'sortable' ? sortableKeyboardCoordinates : undefined,
    }),
  )
}
