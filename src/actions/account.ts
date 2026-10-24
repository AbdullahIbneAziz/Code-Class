"use server";

import { redirect } from "next/navigation";
import { changePasswordCore } from "@/lib/accounts/password-change";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export type PasswordState = { ok: boolean; message?: string } | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function changePasswordAction(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const r = await changePasswordCore(await createServerSupabase(), createAdminSupabase(), {
    currentPassword: str(fd, "currentPassword"),
    newPassword: str(fd, "newPassword"),
    confirmPassword: str(fd, "confirmPassword"),
  });
  if (!r.ok) return { ok: false, message: r.message };
  if (str(fd, "after") === "home") redirect("/");
  return { ok: true, message: "Password changed." };
}
