import { createAdminSupabase } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The only route by which server actions obtain the service-role client. */
export function getAdminClient(): SupabaseClient {
  return createAdminSupabase();
}
