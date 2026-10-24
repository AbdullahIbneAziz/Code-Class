import { describe, expect, it } from "vitest";
import { validateNewPassword } from "@/lib/auth/password";

describe("validateNewPassword", () => {
  it("rejects short passwords", () => {
    expect(validateNewPassword("short", "short", "x")).toEqual({
      ok: false,
      message: "Password must be at least 8 characters.",
    });
  });
  it("rejects mismatched confirmation", () => {
    expect(validateNewPassword("abcdefgh", "abcdefgX", "x")).toEqual({
      ok: false,
      message: "The two new passwords don't match.",
    });
  });
  it("rejects reuse of current password", () => {
    expect(
      validateNewPassword("Temp-pass-1", "Temp-pass-1", "Temp-pass-1"),
    ).toEqual({
      ok: false,
      message: "Choose a password different from your current one.",
    });
  });
  it("accepts a valid change", () => {
    expect(validateNewPassword("Brand-new-1", "Brand-new-1", "Temp-pass-1")).toEqual({ ok: true });
  });
});
