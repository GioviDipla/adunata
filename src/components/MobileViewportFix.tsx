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

    const update = () => {
      const diff = window.innerHeight - vv.height
      const keyboardOpen = diff > KEYBOARD_THRESHOLD
      document.body.classList.toggle('keyboard-open', keyboardOpen)
      document.documentElement.style.setProperty('--vv-height', `${vv.height}px`)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('orientationchange', update)

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('orientationchange', update)
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
