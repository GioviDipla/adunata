'use client'

import { useEffect, useRef, useState } from 'react'
import type { SimInput, SimResult } from './deckSimulatorWorker'

/**
 * Runs the deck Monte Carlo simulator in a dedicated Web Worker.
 * Spawns a new worker each time `input` identity changes.
 * Returns null/false until the worker posts back.
 */
export function useDeckSimulator(input: SimInput | null): {
  result: SimResult | null
  running: boolean
} {
  const [result, setResult] = useState<SimResult | null>(null)
  const [running, setRunning] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (!input) return
    if (input.mainDeck.length === 0) {
      setResult(null)
      setRunning(false)
      return
    }
    let cancelled = false
    setRunning(true)
    setResult(null)
    const w = new Worker(
      new URL('./deckSimulatorWorker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = w
    w.onmessage = (ev: MessageEvent<SimResult>) => {
      if (cancelled) return
      setResult(ev.data)
      setRunning(false)
      w.terminate()
    }
    w.onerror = () => {
      if (cancelled) return
      setRunning(false)
      w.terminate()
    }
    w.postMessage(input)
    return () => {
      cancelled = true
      w.terminate()
      workerRef.current = null
    }
  }, [input])

  return { result, running }
}
