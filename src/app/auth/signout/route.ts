import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut({ scope: "local" });
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  // Cookie-clearing response must never be cached (@supabase/ssr requirement).
  res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export const POST = signOut;
