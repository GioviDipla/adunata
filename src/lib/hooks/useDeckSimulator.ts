'use client'

import { useEffect, useRef, useState } from 'react'
import type { SimInput, SimResult } from './deckSimulatorWorker'

const DEBOUNCE_MS = 750

/**
 * Runs the deck Monte Carlo simulator in a dedicated Web Worker.
 *
 * Internal debounce: the simulator is expensive (5k iterations × ~60-card
 * deck) and the editor mutates `input` on every card add/remove/quantity
 * change. Without the debounce a flurry of edits would spawn workers in
 * series. We wait `DEBOUNCE_MS` after the last input change before
 * launching, terminating any pending worker.
 *
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
    if (!input) {
      queueMicrotask(() => {
        setResult(null)
        setRunning(false)
      })
      return
    }
    if (input.mainDeck.length === 0) {
      queueMicrotask(() => {
        setResult(null)
        setRunning(false)
      })
      return
    }
    let cancelled = false
    let worker: Worker | null = null

    // Mark "running" immediately so the UI can show the spinner during
    // the debounce window — feels snappier than appearing idle for 750ms
    // before the worker even starts.
    queueMicrotask(() => setRunning(true))

    const launch = setTimeout(() => {
      if (cancelled) return
      worker = new Worker(
        new URL('./deckSimulatorWorker.ts', import.meta.url),
        { type: 'module' },
      )
      workerRef.current = worker
      worker.onmessage = (ev: MessageEvent<SimResult>) => {
        if (cancelled) return
        setResult(ev.data)
        setRunning(false)
        worker?.terminate()
      }
      worker.onerror = () => {
        if (cancelled) return
        setRunning(false)
        worker?.terminate()
      }
      worker.postMessage(input)
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(launch)
      worker?.terminate()
      workerRef.current = null
    }
  }, [input])

  return { result, running }
}
