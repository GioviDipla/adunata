'use client'

import { useEffect } from 'react'

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

  return null
}
