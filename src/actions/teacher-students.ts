"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/accounts/admin-client";
import { requireTeacher } from "@/lib/accounts/guard";
import {
  createStudent,
  renameStudent,
  resetStudentPassword,
  setStudentActive,
  type AccountResult,
} from "@/lib/accounts/students";
import { createServerSupabase } from "@/lib/supabase/server";

/** State returned to the forms. tempPassword is shown once and never stored or logged. */
export type ActionState = {
  ok: boolean;
  message?: string;
  tempPassword?: string;
  username?: string;
} | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function guarded(run: () => Promise<AccountResult>): Promise<AccountResult> {
  try {
    await requireTeacher(await createServerSupabase());
  } catch {
    return { ok: false, message: "Teacher access required." };
  }
  const r = await run();
  if (r.ok) revalidatePath("/teacher/students");
  return r;
}

export async function createStudentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const username = str(fd, "username");
  const tempPassword = str(fd, "tempPassword");
  const r = await guarded(() =>
    createStudent(getAdminClient(), { username, displayName: str(fd, "displayName"), tempPassword }),
  );
  return r.ok
    ? { ok: true, tempPassword, username: username.trim().toLowerCase() }
    : { ok: false, message: r.message };
}

export async function resetStudentPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const tempPassword = str(fd, "tempPassword");
  const r = await guarded(() => resetStudentPassword(getAdminClient(), str(fd, "studentId"), tempPassword));
  return r.ok ? { ok: true, tempPassword } : { ok: false, message: r.message };
}

export async function renameStudentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guarded(() => renameStudent(getAdminClient(), str(fd, "studentId"), str(fd, "username")));
  return r.ok ? { ok: true, message: "Renamed." } : { ok: false, message: r.message };
}

export async function setStudentActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guarded(() =>
    setStudentActive(getAdminClient(), str(fd, "studentId"), str(fd, "active") === "true"),
  );
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
