import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client (Vite exposes only env vars prefixed with VITE_).
 * Dashboard "NEXT_PUBLIC_*" → use VITE_* here (same values).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined;

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!url || !publishableKey) {
    console.warn(
      "[supabase] Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY in .env"
    );
    return null;
  }
  if (!browserClient) {
    browserClient = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return browserClient;
}
