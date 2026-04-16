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
    // bottom of the layout viewport. This is what position:fixed ignores on
    // iOS Safari — the address bar shrinks smoothly as the user scrolls
    // (visual viewport grows) but fixed elements stay glued to the layout
    // viewport. Writing the offset into a CSS var and using it as `bottom`
    // keeps the mobile navbar flush against the visible bottom edge.
    let rafId: number | null = null
    const schedule = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const bottomInset = Math.max(
          0,
          window.innerHeight - (vv.offsetTop + vv.height),
        )
        const diff = window.innerHeight - vv.height
        const keyboardOpen = diff > KEYBOARD_THRESHOLD
        document.body.classList.toggle('keyboard-open', keyboardOpen)
        // When the keyboard is open we don't want the navbar to ride up on
        // top of it — CSS hides the nav entirely, so the inset doesn't
        // matter. Force 0 so the translation from the keyboard rule is clean.
        document.documentElement.style.setProperty(
          '--vv-bottom-inset',
          keyboardOpen ? '0px' : `${bottomInset}px`,
        )
      })
    }

    schedule()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('orientationchange', schedule)

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('orientationchange', schedule)
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
