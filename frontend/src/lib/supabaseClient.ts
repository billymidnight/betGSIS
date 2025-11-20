import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL_LOCAL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || ''

// Log env values (only in dev) to help diagnose misconfiguration; never log secrets in production
if (import.meta.env.DEV) {
	console.log('Supabase URL:', SUPABASE_URL ? '[set]' : '[MISSING]')
	console.log('Supabase ANON KEY:', SUPABASE_ANON ? '[set]' : '[MISSING]')
}

if (!SUPABASE_URL || !SUPABASE_ANON) {
	// throw a clear error in dev so issues are obvious
	if (import.meta.env.DEV) {
		throw new Error('Missing Supabase configuration: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set')
	}
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export default supabase
