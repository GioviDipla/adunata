'use client'

import { useEffect } from 'react'

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function MobileViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const KEYBOARD_THRESHOLD = 150

    // Track the distance between the bottom of the visual viewport and the
    // bottom of the layout viewport. position:fixed is anchored to the
    // layout viewport on iOS Safari, so fixed elements float away from the
    // visible bottom edge whenever Safari's chrome shrinks. We write the
    // offset into a CSS var and apply it as a transform on .mobile-navbar.
    let rafId: number | null = null
    const update = () => {
      rafId = null
      const bottomInset = Math.max(
        0,
        window.innerHeight - (vv.offsetTop + vv.height),
      )
      const diff = window.innerHeight - vv.height
      const keyboardOpen = diff > KEYBOARD_THRESHOLD
      document.body.classList.toggle('keyboard-open', keyboardOpen)
      document.documentElement.style.setProperty(
        '--vv-nav-translate',
        keyboardOpen ? '0px' : `-${bottomInset}px`,
      )
    }
    const schedule = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(update)
    }

    schedule()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('orientationchange', schedule)

    // iOS Safari bug: after the virtual keyboard toggles, visualViewport.scroll
    // events can go silent — the nav then freezes at whatever translate it
    // had when the keyboard closed. Listening to window.scroll as well
    // gives us a reliable tick source, and the rAF coalescing keeps us at
    // 1 update/frame regardless of how many sources fire.
    window.addEventListener('scroll', schedule, { passive: true })

    // When the keyboard closes (blur on an input), schedule a few deferred
    // updates: Safari commits the viewport change over a couple of frames,
    // and a single update at focusout time often reads stale values.
    const timeouts: ReturnType<typeof setTimeout>[] = []
    const onFocusOut = () => {
      schedule()
      timeouts.push(setTimeout(schedule, 50))
      timeouts.push(setTimeout(schedule, 200))
      timeouts.push(setTimeout(schedule, 500))
    }
    document.addEventListener('focusout', onFocusOut)

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      for (const t of timeouts) clearTimeout(t)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.removeEventListener('scroll', schedule)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // Hard-block iOS/Safari native long-press menu and text-selection popup.
  // CSS alone (-webkit-touch-callout, user-select) is unreliable: after
  // scroll or keyboard events Safari stops honoring it intermittently.
  useEffect(() => {
    const blockContext = (e: Event) => {
      if (isEditable(e.target)) return
      e.preventDefault()
    }
    const blockSelect = (e: Event) => {
      if (isEditable(e.target)) return
      e.preventDefault()
    }
    document.addEventListener('contextmenu', blockContext)
    document.addEventListener('selectstart', blockSelect)
    return () => {
      document.removeEventListener('contextmenu', blockContext)
      document.removeEventListener('selectstart', blockSelect)
    }
  }, [])

  return null
}
