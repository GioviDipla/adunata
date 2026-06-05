import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase env')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function parseArgs(argv) {
  const args = new Map()
  for (const arg of argv) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split(/=(.*)/s)
      args.set(key, value)
    } else if (arg.startsWith('--')) {
      args.set(arg.slice(2), true)
    }
  }
  return {
    profile: String(args.get('profile') ?? 'hd-2x'),
    includeProcessing: args.get('include-processing') === true,
    dryRun: args.get('dry-run') === true,
  }
}

const options = parseArgs(process.argv.slice(2))
const statuses = options.includeProcessing ? ['queued', 'processing'] : ['queued']

const { count: beforeCount } = await supabase
  .from('card_image_assets')
  .select('*', { count: 'exact', head: true })
  .eq('target_profile', options.profile)
  .in('status', statuses)

console.log(`Found ${beforeCount ?? 0} rows with status in [${statuses.join(', ')}] (profile=${options.profile})`)

if (options.dryRun) {
  console.log('Dry run — no rows deleted')
  process.exit(0)
}

const { error } = await supabase
  .from('card_image_assets')
  .delete()
  .eq('target_profile', options.profile)
  .in('status', statuses)

if (error) {
  console.error('Delete failed:', error.message)
  process.exit(1)
}

console.log(`Deleted ${beforeCount ?? 0} rows`)
