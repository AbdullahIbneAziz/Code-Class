import { connection } from "next/server";
import { PendingCard } from "@/components/PendingCard";
import { listMyItems, listQuestionFiles } from "@/lib/homework/queries";
import { pendingBanner } from "@/lib/homework/pending";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function StudentHome() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const { data: p } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", auth.user?.id ?? "")
    .maybeSingle();
  const banner = pendingBanner(await listMyItems(supabase));
  const files = await Promise.all(banner.items.map((i) => listQuestionFiles(supabase, i.assignmentId)));
  await connection(); // request time: the clock below must not be prerendered
  const now = new Date();
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Welcome, {p?.display_name}</h1>
      <p role="status" className="mt-4 rounded border border-black/15 p-3 font-medium dark:border-white/20">
        {banner.text}
      </p>
      {banner.count > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Pending</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {banner.items.map((i, idx) => (
              <PendingCard key={i.assignmentId} item={i} file={files[idx][0]} now={now} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
