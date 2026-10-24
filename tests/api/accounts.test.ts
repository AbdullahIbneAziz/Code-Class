import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { usernameToEmail } from "@/lib/auth/username";
import {
  createStudent,
  renameStudent,
  resetStudentPassword,
  setStudentActive,
} from "@/lib/accounts/students";
import { NotTeacherError, requireTeacher } from "@/lib/accounts/guard";
import { adminClient, anonClient, cleanupTestUsers, makeTestUser } from "./helpers";

const admin = adminClient();
const created: string[] = [];
const suffix = () => randomBytes(3).toString("hex");

async function idOf(username: string): Promise<string> {
  const { data } = await admin.from("profiles").select("id").eq("username", username).single();
  created.push(data!.id);
  return data!.id as string;
}
async function login(username: string, password: string) {
  return anonClient().auth.signInWithPassword({ email: usernameToEmail(username), password });
}
async function authUserCount(email: string): Promise<number> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.filter((u) => u.email === email).length;
}

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  await cleanupTestUsers();
});

describe("account management", () => {
  it("creates a student who can log in and must change password", async () => {
    const username = `t_new_${suffix()}`;
    const r = await createStudent(admin, { username, displayName: "Test New", tempPassword: "Temp-pass-1" });
    expect(r).toEqual({ ok: true });
    const id = await idOf(username);
    const { data: p } = await admin.from("profiles").select("*").eq("id", id).single();
    expect(p.role).toBe("student");
    expect(p!.must_change_password).toBe(true);
    const { error } = await login(username, "Temp-pass-1");
    expect(error).toBeNull();
  });

  it("refuses duplicate username, including different case", async () => {
    const lower = `t_dup_${suffix()}`;
    expect(await createStudent(admin, { username: lower, displayName: "Dup", tempPassword: "Temp-pass-1" })).toEqual({ ok: true });
    await idOf(lower);
    const before = await authUserCount(usernameToEmail(lower));
    const r = await createStudent(admin, { username: lower.toUpperCase(), displayName: "Dup2", tempPassword: "Temp-pass-2" });
    expect(r).toEqual({ ok: false, message: "That username is already taken." });
    expect(await authUserCount(usernameToEmail(lower))).toBe(before);
  });

  it("refuses invalid username", async () => {
    const r = await createStudent(admin, { username: "1bad name", displayName: "X", tempPassword: "Temp-pass-1" });
    expect(r).toEqual({
      ok: false,
      message: "Usernames must be 3–20 characters: lowercase letters, numbers or _, starting with a letter.",
    });
  });

  it("refuses a temporary password under 8 characters", async () => {
    const r = await createStudent(admin, { username: `t_short_${suffix()}`, displayName: "X", tempPassword: "short" });
    expect(r.ok).toBe(false);
  });

  it("rolls back the Auth user when the profile insert fails", async () => {
    const username = `t_roll_${suffix()}`;
    const r = await createStudent(admin, { username, displayName: "x".repeat(61), tempPassword: "Temp-pass-1" });
    expect(r.ok).toBe(false);
    expect(await authUserCount(usernameToEmail(username))).toBe(0);
  });

  it("reset sets new password and must_change_password", async () => {
    const username = `t_reset_${suffix()}`;
    await createStudent(admin, { username, displayName: "Reset", tempPassword: "Temp-pass-1" });
    const id = await idOf(username);
    await admin.from("profiles").update({ must_change_password: false }).eq("id", id);
    expect(await resetStudentPassword(admin, id, "Brand-new-2")).toEqual({ ok: true });
    expect((await login(username, "Temp-pass-1")).error).not.toBeNull();
    expect((await login(username, "Brand-new-2")).error).toBeNull();
    const { data: p } = await admin.from("profiles").select("must_change_password").eq("id", id).single();
    expect(p!.must_change_password).toBe(true);
    expect((await resetStudentPassword(admin, id, "short")).ok).toBe(false);
  });

  it("rename changes login username; old username no longer logs in", async () => {
    const s = suffix();
    const oldName = `t_old_${s}`;
    const newName = `t_new2_${s}`;
    await createStudent(admin, { username: oldName, displayName: "Ren", tempPassword: "Temp-pass-1" });
    const id = await idOf(oldName);
    expect(await renameStudent(admin, id, newName.toUpperCase())).toEqual({ ok: true });
    expect((await login(oldName, "Temp-pass-1")).error).not.toBeNull();
    expect((await login(newName, "Temp-pass-1")).error).toBeNull();
    const { data: p } = await admin.from("profiles").select("username").eq("id", id).single();
    expect(p!.username).toBe(newName);
    const other = `t_other_${s}`;
    await createStudent(admin, { username: other, displayName: "O", tempPassword: "Temp-pass-1" });
    await idOf(other);
    expect(await renameStudent(admin, id, other)).toEqual({ ok: false, message: "That username is already taken." });
    expect((await renameStudent(admin, id, "!!")).ok).toBe(false);
  });

  it("deactivate blocks new logins and an existing session's API reads; reactivate restores login", async () => {
    const username = `t_deact_${suffix()}`;
    await createStudent(admin, { username, displayName: "Deact", tempPassword: "Temp-pass-1" });
    const id = await idOf(username);
    const client = anonClient();
    const { error: e0 } = await client.auth.signInWithPassword({ email: usernameToEmail(username), password: "Temp-pass-1" });
    expect(e0).toBeNull();
    const { data: before } = await client.from("profiles").select("id");
    expect(before?.length).toBe(1);

    expect(await setStudentActive(admin, id, false)).toEqual({ ok: true });
    expect((await login(username, "Temp-pass-1")).error).not.toBeNull();
    const { data: after } = await client.from("profiles").select("id");
    expect(after ?? []).toHaveLength(0);

    expect(await setStudentActive(admin, id, true)).toEqual({ ok: true });
    expect((await login(username, "Temp-pass-1")).error).toBeNull();
  });

  it("student operations refuse the teacher's id and unknown ids, leaving the teacher untouched", async () => {
    const teacher = await makeTestUser("teacher");
    const ghost = randomUUID();
    const notFound = { ok: false, message: "Student not found." };
    for (const id of [teacher.id, ghost]) {
      expect(await resetStudentPassword(admin, id, "Hijack-pass-9")).toEqual(notFound);
      expect(await renameStudent(admin, id, `t_hijack_${suffix()}`)).toEqual(notFound);
      expect(await setStudentActive(admin, id, false)).toEqual(notFound);
    }
    const { error } = await login(teacher.username, teacher.password);
    expect(error).toBeNull();
    const { data: p } = await admin.from("profiles").select("*").eq("id", teacher.id).single();
    expect(p!.is_active).toBe(true);
    expect(p!.username).toBe(teacher.username);
    expect(p!.must_change_password).toBe(false);
    const { data: u } = await admin.auth.admin.getUserById(teacher.id);
    expect(u.user?.banned_until ?? null).toBeNull();
  });

  it("server actions reject a non-teacher caller", async () => {
    const student = await makeTestUser("student");
    const teacher = await makeTestUser("teacher");
    await expect(requireTeacher(student.client)).rejects.toBeInstanceOf(NotTeacherError);
    await expect(requireTeacher(anonClient())).rejects.toBeInstanceOf(NotTeacherError);
    await expect(requireTeacher(teacher.client)).resolves.toEqual({ userId: teacher.id });
  });
});
