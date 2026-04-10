import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import UserSearch from '@/components/users/UserSearch'

export default async function UsersPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: latestUsers } = await supabase.rpc('get_latest_users', {
    p_limit: 10,
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-font-primary">Community</h1>
      <UserSearch initialUsers={latestUsers ?? []} />
    </div>
  )
}
