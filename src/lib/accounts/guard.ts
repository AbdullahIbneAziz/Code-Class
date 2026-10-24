import type { SupabaseClient } from "@supabase/supabase-js";

export class NotTeacherError extends Error {
  constructor() {
    super("Teacher access required.");
    this.name = "NotTeacherError";
  }
}

/** Throws NotTeacherError unless the user-scoped client belongs to a teacher. */
export async function requireTeacher(userClient: SupabaseClient): Promise<{ userId: string }> {
  const { data: u } = await userClient.auth.getUser();
  if (!u.user) throw new NotTeacherError();
  const { data, error } = await userClient.rpc("is_teacher");
  if (error) throw new Error(`Could not check teacher access: ${error.message}`);
  if (data !== true) throw new NotTeacherError();
  return { userId: u.user.id };
}
