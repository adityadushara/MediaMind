import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string | null {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return url.startsWith("http") ? url : null;
}

function getServiceRoleKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key === "your-service-role-key-placeholder" || key.length <= 20) {
    return null;
  }
  return key;
}

function getAnonKey(): string | null {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return key && key.length > 20 ? key : null;
}

let adminClient: SupabaseClient | null = null;

/**
 * Lazily creates the server-side Supabase client.
 *
 * Creating a client at module scope made `next build` fail while collecting
 * page data on hosts without build-time secrets (`supabaseKey is required`).
 * Reading env vars inside a function keeps module evaluation side-effect free.
 *
 * Uses the service-role key when configured (bypasses RLS); otherwise falls
 * back to the anon key so token verification still works.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = getSupabaseUrl();
  const key = getServiceRoleKey() || getAnonKey();
  if (!url || !key) {
    throw new Error(
      "Supabase server credentials are not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (and optionally SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  adminClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return adminClient;
}

/**
 * Returns an authenticated Supabase client for database operations.
 * If SUPABASE_SERVICE_ROLE_KEY is configured, it bypasses RLS.
 * Otherwise, it attaches the user's JWT Bearer token so Postgres RLS
 * policies (auth.uid() = user_id) evaluate to true.
 */
export function createAuthenticatedClient(token?: string | null): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey() || getAnonKey();
  if (!url || !key) {
    throw new Error(
      "Supabase server credentials are not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : {},
  });
}
