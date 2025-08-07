// supabase.ts - Enhanced configuration for better file handling
import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase URL or anonymous key');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'ocean-integrity/1.0.0',
      },
      fetch: (url, options = {}) => {
        // Custom fetch with better error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout for large files

        return fetch(url, {
          ...options,
          signal: controller.signal,
        })
          .then((response) => {
            clearTimeout(timeoutId);
            return response;
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
              throw new Error(
                'Request timeout - file too large for direct upload'
              );
            }
            throw error;
          });
      },
    },
  });
}

// Helper to get admin client for server-side operations
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    // Fall back to anon client if service key not available
    return getSupabaseClient();
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
