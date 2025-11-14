import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side Supabase client with service role for admin operations
export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://build-placeholder.supabase.co',
    // Support both SUPABASE_SERVICE_ROLE_KEY (standard) and SUPABASE_SECRET_KEY (legacy)
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || 'fake-service-key-for-build'
  );
}

// Server-side Supabase client for user operations (with cookies)
export function createServerSupabaseClient() {
  const cookieStore = cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://build-placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTY0ODc3MDQ2MCwiZXhwIjo0MTAyNDQ0ODAwLCJhdWQiOiJzdXBhYmFzZSIsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCIsInJvbGUiOiJhbm9uIn0.fake-key-for-build',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: unknown) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: unknown) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}