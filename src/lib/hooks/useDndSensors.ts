'use client'

import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

// Mobile-first activation thresholds. POINTER_DISTANCE intentionally larger
// than the historical 5-6px sortable defaults so finger jitter on mobile
// doesn't trigger phantom drags. TouchSensor delay enables long-press to
// distinguish drag from a short scroll gesture.
const POINTER_DISTANCE_PX = 12
const TOUCH_DELAY_MS = 220
const TOUCH_TOLERANCE_PX = 8

type Variant = 'game' | 'sortable'

export function useDndSensors(variant: Variant = 'game') {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: POINTER_DISTANCE_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: variant === 'sortable' ? sortableKeyboardCoordinates : undefined,
    }),
  )
}
