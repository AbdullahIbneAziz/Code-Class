import { createServerClient } from "@supabase/ssr";
import { decideRoute } from "@/lib/auth/route-decision";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

// Next 16 renamed middleware.ts to proxy.ts (see node_modules/next/dist/docs).
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const pending: CookieToSet[] = [];
  let cacheHeaders: Record<string, string> = {};
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list, headers) {
          // Responses that set auth cookies must not be cached (see @supabase/ssr types).
          cacheHeaders = { ...cacheHeaders, ...headers };
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
    for (const [k, v] of Object.entries(cacheHeaders)) res.headers.set(k, v);
    return res;
  };
  const go = (to: string) => finish(NextResponse.redirect(new URL(to, request.url)));
  const next = () => finish(NextResponse.next({ request }));

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const { data: profile, error: profileError } = user
    ? await supabase
        .from("profiles")
        .select("role, is_active, must_change_password")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null, error: null };

  // Profile is readable only while active (RLS), so no row means inactive.
  const decision = decideRoute({ path, user, profile, profileError: !!profileError });
  switch (decision.kind) {
    case "redirect":
      return go(decision.to);
    case "unavailable":
      return finish(
        new NextResponse("CodeClass can't reach its database right now. Please try again in a minute.", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        }),
      );
    case "signout":
      await supabase.auth.signOut();
      return decision.to ? go(decision.to) : next();
    case "next":
      break;
  }

  // Non-blocking, but kept alive after the response on serverless; errors ignored.
  event.waitUntil(
    Promise.resolve(supabase.rpc("touch_last_seen")).then(
      () => {},
      () => {},
    ),
  );

  return next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
