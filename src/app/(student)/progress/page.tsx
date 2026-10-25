import Link from "next/link";
import { connection } from "next/server";
import { ProgressTiles } from "@/components/ProgressTiles";
import { UkTime } from "@/components/UkTime";
import { statusLabel } from "@/lib/homework/status";
import { markText } from "@/lib/marking/format";
import { getMyProgress, listMyHistory } from "@/lib/progress/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function ProgressPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const [progress, items] = await Promise.all([getMyProgress(supabase, auth.user?.id ?? ""), listMyHistory(supabase)]);
  await connection(); // request time, as the other student pages do
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">My progress</h1>
      <ProgressTiles progress={progress} />
      <p className="mt-3 text-sm text-black/70 dark:text-white/70">
        Missed work counts as 0%. Excused work and work not yet marked don&apos;t count in the averages.
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/15 dark:border-white/20">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Due</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Mark</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.assignmentId} className="border-b border-black/10 dark:border-white/10">
                <td className="py-2 pr-3">
                  <Link
                    href={i.kind === "test" ? `/tests/${i.assignmentId}` : `/homework/${i.assignmentId}`}
                    className="underline"
                  >
                    {i.title}
                  </Link>
                </td>
                <td className="py-2 pr-3">{i.kind === "test" ? "Test" : "Homework"}</td>
                <td className="py-2 pr-3">
                  <UkTime at={i.effectiveDueAt} />
                </td>
                <td className="py-2 pr-3">{statusLabel(i)}</td>
                <td className="py-2">{i.isMarked && i.mark !== null ? markText(i.mark, i.maxMarks) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
