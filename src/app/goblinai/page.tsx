import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import { GoblinAIStandalone } from '@/components/goblinai/GoblinAIStandalone'

export const metadata = {
  title: 'GoblinAI — MTG Rules Assistant',
  description: 'Chiedi regole di Magic: The Gathering al tuo assistente GoblinAI',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function GoblinAIPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('https://adunata.studiob35.com/login?next=https://goblinai.studiob35.com')

  return <GoblinAIStandalone />
}
