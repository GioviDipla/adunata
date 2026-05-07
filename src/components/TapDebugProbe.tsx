'use client'

import { useEffect, useState } from 'react'

type TapSnapshot = {
  x: number
  y: number
  scrollY: number
  vvTop: number | null
  vvHeight: number | null
  target: string
  underFinger: string
  interactive: string
}

function describeElement(el: EventTarget | Element | null): string {
  if (!(el instanceof Element)) return 'none'

  const id = el.id ? `#${el.id}` : ''
  const classes =
    typeof el.className === 'string'
      ? el.className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join('')
      : ''
  const label =
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 36) ||
    ''

  return `${el.tagName.toLowerCase()}${id}${classes}${label ? ` "${label}"` : ''}`
}

function nearestInteractive(el: EventTarget | Element | null): Element | null {
  if (!(el instanceof Element)) return null
  return el.closest('button,a,input,textarea,select,[role="button"],[role="menuitem"]')
}

function isEnabledFromLocation() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('tapdebug')
  if (requested === '1') {
    window.localStorage.setItem('adunata:tap-debug', '1')
    return true
  }
  if (requested === '0') {
    window.localStorage.removeItem('adunata:tap-debug')
    return false
  }
  return window.localStorage.getItem('adunata:tap-debug') === '1'
}

export function TapDebugProbe() {
  const [enabled, setEnabled] = useState(false)
  const [snapshot, setSnapshot] = useState<TapSnapshot | null>(null)

  useEffect(() => {
    queueMicrotask(() => setEnabled(isEnabledFromLocation()))
  }, [])

  useEffect(() => {
    if (!enabled) return

    function onPointerDown(event: PointerEvent) {
      const underFinger = document.elementFromPoint(event.clientX, event.clientY)
      const vv = window.visualViewport
      const next: TapSnapshot = {
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        scrollY: Math.round(window.scrollY),
        vvTop: vv ? Math.round(vv.offsetTop) : null,
        vvHeight: vv ? Math.round(vv.height) : null,
        target: describeElement(event.target),
        underFinger: describeElement(underFinger),
        interactive: describeElement(nearestInteractive(underFinger)),
      }
      setSnapshot(next)
      console.info('[tap-debug]', next)
    }

    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-2 z-[2147483647] rounded-lg border border-bg-yellow/60 bg-black/90 p-2 font-mono text-[10px] leading-snug text-bg-yellow shadow-2xl">
      <div className="mb-1 font-bold">Tap debug</div>
      {snapshot ? (
        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5">
          <dt>point</dt>
          <dd>
            {snapshot.x},{snapshot.y}
          </dd>
          <dt>scrollY</dt>
          <dd>{snapshot.scrollY}</dd>
          <dt>vv</dt>
          <dd>
            top {snapshot.vvTop ?? 'n/a'} / h {snapshot.vvHeight ?? 'n/a'}
          </dd>
          <dt>target</dt>
          <dd className="truncate">{snapshot.target}</dd>
          <dt>under</dt>
          <dd className="truncate">{snapshot.underFinger}</dd>
          <dt>action</dt>
          <dd className="truncate">{snapshot.interactive}</dd>
        </dl>
      ) : (
        <div>Tap anywhere after scrolling.</div>
      )}
    </div>
  )
}
