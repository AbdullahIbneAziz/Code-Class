import { createAdminSupabase } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Convenience wrapper for obtaining the service-role client. Importing createAdminSupabase directly is also allowed (e.g. src/actions/account.ts). */
export function getAdminClient(): SupabaseClient {
  return createAdminSupabase();
}
