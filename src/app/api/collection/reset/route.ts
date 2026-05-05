import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Wipe the caller's entire `user_cards` collection. Destructive — the
 * client must already have shown a confirm dialog.
 */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error, count } = await supabase
    .from('user_cards')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/cards')
  revalidatePath('/collection')
  return NextResponse.json({ deleted: count ?? 0 })
}
