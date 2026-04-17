'use client'

import { useSidebar } from '@/lib/contexts/SidebarContext'

export function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()

  return (
    <main
      className={`pb-24 md:pb-0 transition-all duration-200 ${collapsed ? 'md:pl-16' : 'md:pl-60'}`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  )
}
