import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, cleanupTestUsers, makeTestUser } from "./helpers";
import { changePasswordCore } from "@/lib/accounts/password-change";
import { usernameToEmail } from "@/lib/auth/username";

afterAll(cleanupTestUsers);

const signIn = (username: string, password: string) =>
  anonClient().auth.signInWithPassword({ email: usernameToEmail(username), password });
const flag = async (id: string) =>
  (await adminClient().from("profiles").select("must_change_password").eq("id", id).single()).data!
    .must_change_password;

describe("changePasswordCore", () => {
  it("changes password and clears must_change_password", async () => {
    const u = await makeTestUser("student", { mustChangePassword: true });
    const next = `New-${u.password}`;
    const r = await changePasswordCore(u.client, adminClient(), {
      currentPassword: u.password,
      newPassword: next,
      confirmPassword: next,
    });
    expect(r).toEqual({ ok: true });
    expect((await signIn(u.username, next)).error).toBeNull();
    expect((await signIn(u.username, u.password)).error).not.toBeNull();
    expect(await flag(u.id)).toBe(false);
  });

  it("wrong current password is refused and the flag is unchanged", async () => {
    const u = await makeTestUser("student", { mustChangePassword: true });
    const r = await changePasswordCore(u.client, adminClient(), {
      currentPassword: "definitely-wrong-pw",
      newPassword: "Another-pass-1",
      confirmPassword: "Another-pass-1",
    });
    expect(r).toEqual({ ok: false, message: "Your current password is incorrect." });
    expect(await flag(u.id)).toBe(true);
    expect((await signIn(u.username, u.password)).error).toBeNull();
  });

  it("same as current password is refused", async () => {
    const u = await makeTestUser("student", { mustChangePassword: true });
    const r = await changePasswordCore(u.client, adminClient(), {
      currentPassword: u.password,
      newPassword: u.password,
      confirmPassword: u.password,
    });
    expect(r).toEqual({ ok: false, message: "Choose a password different from your current one." });
    expect(await flag(u.id)).toBe(true);
  });

  it("mismatched confirmation is refused", async () => {
    const u = await makeTestUser("student", { mustChangePassword: true });
    const r = await changePasswordCore(u.client, adminClient(), {
      currentPassword: u.password,
      newPassword: "Another-pass-1",
      confirmPassword: "Another-pass-2",
    });
    expect(r).toEqual({ ok: false, message: "The two new passwords don't match." });
    expect((await signIn(u.username, u.password)).error).toBeNull();
  });
});
