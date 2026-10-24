import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidUsername, normalizeUsername, usernameToEmail } from "@/lib/auth/username";

export type AccountResult = { ok: true } | { ok: false; message: string };

const INVALID_USERNAME =
  "Usernames must be 3–20 characters: lowercase letters, numbers or _, starting with a letter.";
const TAKEN = "That username is already taken.";
const SHORT_PW = "Temporary password must be at least 8 characters.";
const BAN_FOREVER = "876000h";

const fail = (message: string): AccountResult => ({ ok: false, message });
const isTakenAuthError = (e: { message?: string; code?: string }) =>
  e.code === "email_exists" ||
  e.code === "user_already_exists" ||
  /already (been )?registered|already exists/i.test(e.message ?? "");

async function usernameTaken(admin: SupabaseClient, username: string, exceptId?: string) {
  const { data, error } = await admin.from("profiles").select("id").eq("username", username);
  if (error) throw new Error(error.message);
  return (data ?? []).some((r) => r.id !== exceptId);
}

const NOT_FOUND = "Student not found.";

async function isStudent(admin: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
  return data?.role === "student";
}

async function updateStudentProfile(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .eq("role", "student")
    .select("id");
  return { error, affected: data?.length ?? 0 };
}

export async function createStudent(
  admin: SupabaseClient,
  input: { username: string; displayName: string; tempPassword: string },
): Promise<AccountResult> {
  const username = normalizeUsername(input.username);
  if (!isValidUsername(username)) return fail(INVALID_USERNAME);
  if (input.tempPassword.length < 8) return fail(SHORT_PW);
  const displayName = input.displayName.trim();
  if (displayName.length < 1) return fail("Display name is required.");
  try {
    if (await usernameTaken(admin, username)) return fail(TAKEN);
  } catch {
    return fail("Could not create the student. Please try again.");
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password: input.tempPassword,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (error && isTakenAuthError(error)) return fail(TAKEN);
    return fail("Could not create the student. Please try again.");
  }
  const { error: pErr } = await admin.from("profiles").insert({
    id: data.user.id,
    role: "student",
    username,
    display_name: displayName,
    must_change_password: true,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    if (pErr.code === "23505") return fail(TAKEN);
    if (pErr.code === "23514") return fail("Display name must be 1–60 characters.");
    return fail("Could not create the student. Please try again.");
  }
  return { ok: true };
}

export async function resetStudentPassword(
  admin: SupabaseClient,
  studentId: string,
  tempPassword: string,
): Promise<AccountResult> {
  if (tempPassword.length < 8) return fail(SHORT_PW);
  if (!(await isStudent(admin, studentId))) return fail(NOT_FOUND);
  const { error } = await admin.auth.admin.updateUserById(studentId, { password: tempPassword });
  if (error) return fail("Could not reset the password. Please try again.");
  const r = await updateStudentProfile(admin, studentId, { must_change_password: true });
  if (r.error || r.affected !== 1) return fail("Could not reset the password. Please try again.");
  return { ok: true };
}

export async function renameStudent(
  admin: SupabaseClient,
  studentId: string,
  newUsername: string,
): Promise<AccountResult> {
  const username = normalizeUsername(newUsername);
  if (!isValidUsername(username)) return fail(INVALID_USERNAME);
  const { data: current } = await admin
    .from("profiles")
    .select("username, role")
    .eq("id", studentId)
    .maybeSingle();
  if (!current || current.role !== "student") return fail(NOT_FOUND);
  try {
    if (await usernameTaken(admin, username, studentId)) return fail(TAKEN);
  } catch {
    return fail("Could not rename. Please try again.");
  }
  const { error } = await admin.auth.admin.updateUserById(studentId, {
    email: usernameToEmail(username),
    email_confirm: true,
  });
  if (error) return fail(isTakenAuthError(error) ? TAKEN : "Could not rename. Please try again.");
  const rr = await updateStudentProfile(admin, studentId, { username });
  const pErr = rr.error ?? (rr.affected !== 1 ? { code: "" } : null);
  if (pErr) {
    if (current.username) {
      await admin.auth.admin.updateUserById(studentId, {
        email: usernameToEmail(current.username),
        email_confirm: true,
      });
    }
    return fail(pErr.code === "23505" ? TAKEN : "Could not rename. Please try again.");
  }
  return { ok: true };
}

export async function setStudentActive(
  admin: SupabaseClient,
  studentId: string,
  active: boolean,
): Promise<AccountResult> {
  if (!(await isStudent(admin, studentId))) return fail(NOT_FOUND);
  const { error } = await admin.auth.admin.updateUserById(studentId, {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (error) return fail("Could not update the account. Please try again.");
  const ra = await updateStudentProfile(admin, studentId, { is_active: active });
  if (ra.error || ra.affected !== 1) {
    // Keep the ban and the flag in step.
    await admin.auth.admin.updateUserById(studentId, { ban_duration: active ? BAN_FOREVER : "none" });
    return fail("Could not update the account. Please try again.");
  }
  return { ok: true };
}
