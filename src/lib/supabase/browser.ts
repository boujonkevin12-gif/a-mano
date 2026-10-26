"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

/** Uses the user's cookie-backed session; Storage policies remain authoritative. */
export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createBrowserClient<Database>(config.url, config.publishableKey, {
    auth: { flowType: "pkce", autoRefreshToken: true, persistSession: true },
  });
}
