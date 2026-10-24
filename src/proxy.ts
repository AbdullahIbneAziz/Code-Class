import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

// Next 16 renamed middleware.ts to proxy.ts (see node_modules/next/dist/docs).
export async function proxy(request: NextRequest) {
  const pending: CookieToSet[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          for (const c of list) {
            request.cookies.set(c.name, c.value);
            pending.push(c);
          }
        },
      },
    },
  );

  const path = request.nextUrl.pathname;

  // Every response (pass-through or redirect) carries any refreshed session cookies.
  const finish = (res: NextResponse) => {
    for (const c of pending) res.cookies.set(c.name, c.value, c.options);
    return res;
  };
  const go = (to: string) => finish(NextResponse.redirect(new URL(to, request.url)));
  const next = () => finish(NextResponse.next({ request }));

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  // 1. Not logged in
  if (!user) return path === "/login" ? next() : go("/login");

  // Profile is readable only while active (RLS), so no row means inactive.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  // 6. Inactive or missing profile: sign out, then /login.
  // Evaluated before rules 2-5 because they need a profile to evaluate.
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return path === "/login" ? next() : go("/login");
  }

  const home = profile.role === "teacher" ? "/teacher" : "/";

  // 2. Forced password change
  if (
    profile.must_change_password &&
    path !== "/account/new-password" &&
    path !== "/auth/signout"
  ) {
    return go("/account/new-password");
  }
  // 3. Student on the teacher area
  if (profile.role === "student" && (path === "/teacher" || path.startsWith("/teacher/"))) {
    return go("/");
  }
  // 4. Teacher on the student home
  if (profile.role === "teacher" && path === "/") return go("/teacher");
  // 5. Logged in on /login
  if (path === "/login") return go(home);

  // Fire and forget; errors ignored.
  void supabase.rpc("touch_last_seen").then(
    () => {},
    () => {},
  );

  return next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
