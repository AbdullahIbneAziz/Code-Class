import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { NotTeacherError, requireTeacher } from "./guard";

export type TeacherGate = { ok: true; client: SupabaseClient } | { ok: false; message: string };

/** Only NotTeacherError means "no permission"; any other failure is a generic error. */
export async function gateTeacher(client: SupabaseClient): Promise<TeacherGate> {
  try {
    await requireTeacher(client);
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof NotTeacherError ? "You don't have permission to do that." : "Something went wrong. Please try again.",
    };
  }
  return { ok: true, client };
}

export async function teacherClient(): Promise<TeacherGate> {
  return gateTeacher(await createServerSupabase());
}
