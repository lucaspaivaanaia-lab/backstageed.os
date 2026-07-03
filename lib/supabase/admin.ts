import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client using the service role / secret key.
 *
 * SERVER-ONLY. Never import this file from a Client Component — the
 * secret key must never reach the browser bundle. Only Server Actions
 * ('use server') and Route Handlers (app/api/**) may import this.
 *
 * `SUPABASE_SECRET_KEY` must NOT carry a `NEXT_PUBLIC_` prefix.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
