import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateNewPassword } from "@/lib/auth/password";
import type { AccountResult } from "@/lib/accounts/students";

const fail = (message: string): AccountResult => ({ ok: false, message });

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/**
 * Changes the caller's own password. Order: validate, verify the current password on a
 * throwaway anon client (so the caller's session is untouched), update the password on
 * the user-scoped client, then clear must_change_password for the caller's id only.
 */
export async function changePasswordCore(
  userClient: SupabaseClient,
  admin: SupabaseClient,
  input: ChangePasswordInput,
): Promise<AccountResult> {
  const v = validateNewPassword(input.newPassword, input.confirmPassword, input.currentPassword);
  if (!v.ok) return fail(v.message);

  const { data } = await userClient.auth.getUser();
  const user = data.user;
  if (!user?.email) return fail("Please log in again.");

  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: signInErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: input.currentPassword,
  });
  if (signInErr) return fail("Your current password is incorrect.");
  await verifier.auth.signOut({ scope: "local" }).catch(() => {});

  const { error: upErr } = await userClient.auth.updateUser({ password: input.newPassword });
  if (upErr) return fail("Could not change the password. Please try again.");

  const { error: flagErr } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (flagErr) return fail("Your password was changed, but we could not finish. Please try again.");
  return { ok: true };
}
