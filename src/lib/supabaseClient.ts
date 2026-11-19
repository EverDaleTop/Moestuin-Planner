import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Supabase wordt pas geladen als het echt nodig is (Google-login of uitloggen),
 * zodat de zware client-bibliotheek niet in de eerste lading zit.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!url || !anonKey) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    );
  }
  return clientPromise;
}
