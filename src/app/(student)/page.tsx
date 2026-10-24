import { createServerSupabase } from "@/lib/supabase/server";

export default async function StudentHome() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const { data: p } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", auth.user?.id ?? "")
    .maybeSingle();
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Welcome, {p?.display_name}</h1>
      <p className="mt-2 text-black/70 dark:text-white/70">Your homework will appear here.</p>
    </main>
  );
}
