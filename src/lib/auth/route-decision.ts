export type RouteProfile = {
  role: "teacher" | "student";
  is_active: boolean;
  must_change_password: boolean;
};

export type RouteDecision =
  | { kind: "next" }
  | { kind: "redirect"; to: string }
  | { kind: "signout"; to: "/login" | null }
  | { kind: "unavailable" };

export const STUDENT_PATH_PREFIXES = ["/homework", "/lectures", "/tests", "/progress"];

const underPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/** Pure routing rules for the proxy. Never signs out on a profile lookup error. */
export function decideRoute(i: {
  path: string;
  user: { id: string } | null;
  profile: RouteProfile | null;
  profileError: boolean;
}): RouteDecision {
  const { path, user, profile } = i;
  if (!user) return path === "/login" ? { kind: "next" } : { kind: "redirect", to: "/login" };

  if (i.profileError) return path === "/auth/signout" ? { kind: "next" } : { kind: "unavailable" };

  if (!profile || !profile.is_active) {
    return { kind: "signout", to: path === "/login" ? null : "/login" };
  }

  if (profile.must_change_password && path !== "/account/new-password" && path !== "/auth/signout") {
    return { kind: "redirect", to: "/account/new-password" };
  }
  if (profile.role === "student" && underPrefix(path, "/teacher")) return { kind: "redirect", to: "/" };
  if (profile.role === "teacher" && (path === "/" || STUDENT_PATH_PREFIXES.some((p) => underPrefix(path, p)))) {
    return { kind: "redirect", to: "/teacher" };
  }
  if (path === "/login") return { kind: "redirect", to: profile.role === "teacher" ? "/teacher" : "/" };
  return { kind: "next" };
}
