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

    // Anchor the mobile navbar to the bottom of the VISUAL viewport:
    //   top = vv.offsetTop + vv.height - navHeight
    //
    // iOS Safari emits visualViewport.scroll/resize events only sparsely
    // while the address bar is animating, so an event-driven rAF leaves
    // the navbar lagging behind the true visible bottom during address-bar
    // retraction (scroll-down). To fix this, any event kicks off a
    // continuous rAF loop that reads vv fresh each frame and keeps running
    // for a short tail of inactivity before parking itself.
    let rafId: number | null = null
    let lastTick = 0
    const IDLE_MS = 300
    const update = () => {
      const navbar = document.querySelector<HTMLElement>('.mobile-navbar')
      const diff = window.innerHeight - vv.height
      const keyboardOpen = diff > KEYBOARD_THRESHOLD
      document.body.classList.toggle('keyboard-open', keyboardOpen)
      if (navbar) {
        const navHeight = navbar.offsetHeight
        if (navHeight > 0) {
          const topPx = vv.offsetTop + vv.height - navHeight
          document.documentElement.style.setProperty('--vv-nav-top', `${topPx}px`)
        }
      }

      if (performance.now() - lastTick < IDLE_MS) {
        rafId = requestAnimationFrame(update)
      } else {
        rafId = null
      }
    }
    const kick = () => {
      lastTick = performance.now()
      if (rafId == null) rafId = requestAnimationFrame(update)
    }

    kick()
    vv.addEventListener('resize', kick)
    vv.addEventListener('scroll', kick)
    window.addEventListener('orientationchange', kick)
    window.addEventListener('scroll', kick, { passive: true })

    // Safari commits post-keyboard viewport changes over several frames,
    // and route changes / long-press can also momentarily skew readings.
    // A burst of deferred kicks catches the final settled value.
    const timeouts: ReturnType<typeof setTimeout>[] = []
    const burstKick = () => {
      kick()
      timeouts.push(setTimeout(kick, 50))
      timeouts.push(setTimeout(kick, 200))
      timeouts.push(setTimeout(kick, 500))
    }
    document.addEventListener('focusout', burstKick)
    document.addEventListener('touchend', kick, { passive: true })

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      for (const t of timeouts) clearTimeout(t)
      vv.removeEventListener('resize', kick)
      vv.removeEventListener('scroll', kick)
      window.removeEventListener('orientationchange', kick)
      window.removeEventListener('scroll', kick)
      document.removeEventListener('focusout', burstKick)
      document.removeEventListener('touchend', kick)
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
