import Link from "next/link";
import { connection } from "next/server";
import { PendingCard } from "@/components/PendingCard";
import { ProgressTiles } from "@/components/ProgressTiles";
import { listMyItems, listMySolutions, listQuestionFiles } from "@/lib/homework/queries";
import { markText } from "@/lib/marking/format";
import { getMyProgress, listRecentlyMarked } from "@/lib/progress/queries";
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
  const [progress, recent] = await Promise.all([
    getMyProgress(supabase, auth.user?.id ?? ""),
    listRecentlyMarked(supabase),
  ]);
  const solutions = await listMySolutions(supabase, recent.map((r) => r.assignmentId));
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
      <section className="mt-8">
        <h2 className="text-lg font-semibold">My progress</h2>
        <ProgressTiles progress={progress} />
        <Link href="/progress" className="mt-3 inline-block text-sm underline">
          See full history
        </Link>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Recently marked</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-black/70 dark:text-white/70">Nothing marked yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {recent.map((r) => (
              <li key={r.assignmentId} className="rounded border border-black/15 p-3 dark:border-white/20">
                <p className="font-medium">{`${r.title}, ${markText(r.mark ?? 0, r.maxMarks)}`}</p>
                {r.feedback && <p className="mt-1 whitespace-pre-wrap text-sm">&ldquo;{r.feedback}&rdquo;</p>}
                {solutions.has(r.assignmentId) && (
                  <Link
                    href={r.kind === "test" ? `/tests/${r.assignmentId}` : `/homework/${r.assignmentId}#solution`}
                    className="mt-1 inline-block text-sm underline"
                  >
                    View solution
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
