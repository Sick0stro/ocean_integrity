import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Singleton Supabase client to prevent multiple instances
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  // Return existing instance if already created
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for browser client'
    );
  }

  // Create and cache the instance
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true, // 👈 CHANGED: Enable session persistence
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });

  console.log('🆕 [SUPABASE] Singleton client created');
  return supabaseInstance;
}

// Export singleton instance directly
export const supabase = getSupabaseBrowser();
