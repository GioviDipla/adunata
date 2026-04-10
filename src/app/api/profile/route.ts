import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

interface ProfileUpdateBody {
  username?: string
  display_name?: string
  bio?: string | null
}

const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/
const DISPLAY_NAME_MAX = 40
const BIO_MAX = 240

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as ProfileUpdateBody

  const updates: ProfileUpdate = {}

  if (body.username !== undefined) {
    const username = body.username.trim().toLowerCase()
    if (!USERNAME_REGEX.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3-24 characters, lowercase letters, numbers, or underscores' },
        { status: 400 },
      )
    }
    updates.username = username
  }

  if (body.display_name !== undefined) {
    const displayName = body.display_name.trim()
    if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX) {
      return NextResponse.json(
        { error: `Display name must be 1-${DISPLAY_NAME_MAX} characters` },
        { status: 400 },
      )
    }
    updates.display_name = displayName
  }

  if (body.bio !== undefined) {
    const bio = body.bio === null ? null : body.bio.trim()
    if (bio !== null && bio.length > BIO_MAX) {
      return NextResponse.json(
        { error: `Bio must be at most ${BIO_MAX} characters` },
        { status: 400 },
      )
    }
    updates.bio = bio
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  // Soft pre-check of the 15-day cooldown if username is changing
  if (updates.username !== undefined) {
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('username, username_changed_at')
      .eq('id', user.id)
      .single()

    if (currentProfile && currentProfile.username !== updates.username) {
      if (currentProfile.username_changed_at) {
        const lastChange = new Date(currentProfile.username_changed_at)
        const daysSince = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince < 15) {
          const nextAllowed = new Date(lastChange.getTime() + 15 * 24 * 60 * 60 * 1000)
          return NextResponse.json(
            {
              error: `You can change your username again on ${nextAllowed.toLocaleDateString()}`,
              next_change_allowed_at: nextAllowed.toISOString(),
            },
            { status: 429 },
          )
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('username, display_name, bio, username_changed_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'That username is already taken' },
        { status: 409 },
      )
    }
    if (error.code === 'P0001') {
      return NextResponse.json(
        { error: 'Username can only be changed once every 15 days' },
        { status: 429 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}
