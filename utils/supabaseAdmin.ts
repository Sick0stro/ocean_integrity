// utils/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,   // same project URL
    process.env.SUPABASE_SERVICE_ROLE_KEY!  // 🚨 secret key (never expose to frontend)
  );
}
