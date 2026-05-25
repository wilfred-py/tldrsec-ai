import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role for admin operations.
export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://build-placeholder.supabase.co',
    // Support both SUPABASE_SERVICE_ROLE_KEY (standard) and SUPABASE_SECRET_KEY (legacy)
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || 'fake-service-key-for-build'
  );
}
