import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, cleanupTestUsers, makeTestUser } from "./helpers";
import { resetTeacherPassword } from "@/lib/accounts/reset-teacher";
import { usernameToEmail } from "@/lib/auth/username";

afterAll(cleanupTestUsers);

const signIn = (username: string, password: string) =>
  anonClient().auth.signInWithPassword({ email: usernameToEmail(username), password });

describe("resetTeacherPassword", () => {
  it("sets the new password, invalidates the old one and forces a change", async () => {
    const t = await makeTestUser("teacher");
    const res = await resetTeacherPassword(adminClient(), t.username, "Brand-new-pw-1");
    expect(res).toEqual({ ok: true });
    expect((await signIn(t.username, "Brand-new-pw-1")).error).toBeNull();
    expect((await signIn(t.username, t.password)).error).not.toBeNull();
    const { data } = await adminClient().from("profiles").select("must_change_password").eq("id", t.id).single();
    expect(data!.must_change_password).toBe(true);
  });

  it("refuses a student username and leaves the password alone", async () => {
    const s = await makeTestUser("student");
    const res = await resetTeacherPassword(adminClient(), s.username, "Brand-new-pw-1");
    expect(res).toEqual({ ok: false, message: "No teacher account with that username." });
    expect((await signIn(s.username, s.password)).error).toBeNull();
  });

  it("refuses an unknown username and a short password", async () => {
    const t = await makeTestUser("teacher");
    expect((await resetTeacherPassword(adminClient(), "t_nobody_zz", "Brand-new-pw-1")).ok).toBe(false);
    const short = await resetTeacherPassword(adminClient(), t.username, "short");
    expect(short.ok).toBe(false);
    expect((await signIn(t.username, t.password)).error).toBeNull();
  });
});
