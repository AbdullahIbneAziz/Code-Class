import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { NotTeacherError, requireTeacher } from "@/lib/accounts/guard";

function fake(user: { id: string } | null, rpc: { data: unknown; error: { message: string } | null }) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async () => rpc,
  } as unknown as SupabaseClient;
}

describe("requireTeacher", () => {
  it("rpc error rejects with a non-NotTeacherError", async () => {
    const err = await requireTeacher(fake({ id: "u" }, { data: null, error: { message: "boom" } })).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NotTeacherError);
    expect(err.message).toBe("Could not check teacher access: boom");
  });
  it("is_teacher false rejects with NotTeacherError", async () => {
    await expect(requireTeacher(fake({ id: "u" }, { data: false, error: null }))).rejects.toBeInstanceOf(NotTeacherError);
  });
  it("no user rejects with NotTeacherError", async () => {
    await expect(requireTeacher(fake(null, { data: true, error: null }))).rejects.toBeInstanceOf(NotTeacherError);
  });
  it("teacher resolves { userId }", async () => {
    await expect(requireTeacher(fake({ id: "u9" }, { data: true, error: null }))).resolves.toEqual({ userId: "u9" });
  });
});
