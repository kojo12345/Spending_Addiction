import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const validUrl = (value: string | undefined) => {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost'
  } catch {
    return false
  }
}

export const supabaseConfigMessage = !url || !key
  ? 'Cloud sign-in is not configured for this build. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the hosting environment, then rebuild and redeploy.'
  : !validUrl(url)
    ? 'Cloud sign-in is not configured: VITE_SUPABASE_URL must be a valid HTTPS URL.'
    : null

// Missing configuration keeps the app local-first without pretending that cloud auth is available.
export const supabase = !supabaseConfigMessage ? createClient(url!, key!) : null
