// Canonical Supabase access — the ONE place clients are created.
// Dashboard (browser): supabaseBrowser() — anon key, RLS-guarded reads + realtime.
// API routes & worker: supabaseAdmin() — service role, full writes. Server only.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  browserClient ??= createClient(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return browserClient;
}

let adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  adminClient ??= createClient(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  return adminClient;
}
