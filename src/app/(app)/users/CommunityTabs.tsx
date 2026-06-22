'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import UserSearch from '@/components/users/UserSearch'

const NotificationList = dynamic(() => import('@/components/users/NotificationList'), { ssr: false })

type LatestUser = {
  id: string
  username: string
  display_name: string
  public_deck_count: number
  bio?: string | null
}

export default function CommunityTabs({ initialUsers }: { initialUsers: LatestUser[] }) {
  const [tab, setTab] = useState<'people' | 'notifications'>('people')

  return (
    <div>
      <div className="flex border-b border-border mb-6">
        <button
          type="button"
          onClick={() => setTab('people')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'people'
              ? 'border-bg-accent text-font-primary'
              : 'border-transparent text-font-muted hover:text-font-primary'
          }`}
        >
          Persone
        </button>
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'notifications'
              ? 'border-bg-accent text-font-primary'
              : 'border-transparent text-font-muted hover:text-font-primary'
          }`}
        >
          Notifiche
        </button>
      </div>

      {tab === 'people' ? (
        <UserSearch initialUsers={initialUsers} />
      ) : (
        <NotificationList />
      )}
    </div>
  )
}
