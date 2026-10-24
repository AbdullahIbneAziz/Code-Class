import { describe, expect, it } from "vitest";
import { decideRoute, type RouteProfile } from "@/lib/auth/route-decision";

const user = { id: "u1" };
const student: RouteProfile = { role: "student", is_active: true, must_change_password: false };
const teacher: RouteProfile = { role: "teacher", is_active: true, must_change_password: false };
const d = (path: string, profile: RouteProfile | null, o: { user?: { id: string } | null; profileError?: boolean } = {}) =>
  decideRoute({ path, user: o.user === undefined ? user : o.user, profile, profileError: o.profileError ?? false });

describe("decideRoute", () => {
  it("logged-out goes to /login", () => {
    expect(d("/homework", null, { user: null })).toEqual({ kind: "redirect", to: "/login" });
    expect(d("/login", null, { user: null })).toEqual({ kind: "next" });
  });
  it("profile error on / is unavailable, not signout", () => {
    expect(d("/", null, { profileError: true })).toEqual({ kind: "unavailable" });
  });
  it("profile error on /auth/signout is next", () => {
    expect(d("/auth/signout", null, { profileError: true })).toEqual({ kind: "next" });
  });
  it("no profile row signs out to /login", () => {
    expect(d("/", null)).toEqual({ kind: "signout", to: "/login" });
  });
  it("inactive on /login signs out with to null", () => {
    expect(d("/login", { ...student, is_active: false })).toEqual({ kind: "signout", to: null });
  });
  it("must-change goes to /account/new-password", () => {
    const p = { ...student, must_change_password: true };
    expect(d("/", p)).toEqual({ kind: "redirect", to: "/account/new-password" });
    expect(d("/account/new-password", p)).toEqual({ kind: "next" });
    expect(d("/auth/signout", p)).toEqual({ kind: "next" });
  });
  it("student on /teacher/students goes to /", () => {
    expect(d("/teacher/students", student)).toEqual({ kind: "redirect", to: "/" });
  });
  it("teacher on / goes to /teacher", () => {
    expect(d("/", teacher)).toEqual({ kind: "redirect", to: "/teacher" });
  });
  it("teacher on /homework and /lectures/x goes to /teacher", () => {
    expect(d("/homework", teacher)).toEqual({ kind: "redirect", to: "/teacher" });
    expect(d("/lectures/x", teacher)).toEqual({ kind: "redirect", to: "/teacher" });
  });
  it("logged-in on /login goes to role home", () => {
    expect(d("/login", student)).toEqual({ kind: "redirect", to: "/" });
    expect(d("/login", teacher)).toEqual({ kind: "redirect", to: "/teacher" });
  });
  it("student on student paths is next", () => {
    expect(d("/homework", student)).toEqual({ kind: "next" });
  });
});
