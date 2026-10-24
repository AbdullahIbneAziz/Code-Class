import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUsername } from "@/lib/auth/username";

export type ResetTeacherResult = { ok: true } | { ok: false; message: string };

/** Set a new temporary password for the teacher and force a change at next login. Admin client only. */
export async function resetTeacherPassword(
  admin: SupabaseClient,
  rawUsername: string,
  password: string,
): Promise<ResetTeacherResult> {
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id")
    .eq("username", normalizeUsername(rawUsername))
    .eq("role", "teacher")
    .maybeSingle();
  if (error) return { ok: false, message: `Could not look up the account: ${error.message}` };
  if (!profile) return { ok: false, message: "No teacher account with that username." };
  const { error: uErr } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (uErr) return { ok: false, message: `Could not set the password: ${uErr.message}` };
  const { error: pErr } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", profile.id);
  if (pErr) return { ok: false, message: `Password was set but the change-at-login flag failed: ${pErr.message}` };
  return { ok: true };
}
