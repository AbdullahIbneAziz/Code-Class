import Link from "next/link";
import { UkTime } from "@/components/UkTime";
import { listHomeworkForTeacher } from "@/lib/homework/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function TeacherHomeworkPage() {
  const items = await listHomeworkForTeacher(await createServerSupabase());
  return (
    <main>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Homework</h1>
        <Link
          href="/teacher/homework/new"
          className="rounded border border-black/20 px-3 py-1 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
        >
          + New homework
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-black/70 dark:text-white/70">No homework yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((h) => (
            <li key={h.id} className="rounded border border-black/15 p-4 dark:border-white/20">
              <Link href={`/teacher/homework/${h.id}`} className="text-lg font-semibold underline">
                {h.title}
              </Link>
              {h.isScheduled && (
                <p className="mt-1 text-sm">
                  <span className="mr-2 rounded bg-black/10 px-2 py-0.5 text-xs dark:bg-white/15">Scheduled</span>
                  Shows from <UkTime at={h.visibleFrom} teacher />
                </p>
              )}
              <p className="mt-1 text-sm">
                Due <UkTime at={h.dueAt} teacher />
              </p>
              <p className="mt-1 text-sm">
                {h.submittedCount}/{h.studentCount} submitted
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
