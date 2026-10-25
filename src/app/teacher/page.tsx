import Link from "next/link";
import { connection } from "next/server";
import { MarkingQueue } from "@/components/MarkingQueue";
import { UkTime } from "@/components/UkTime";
import { UnlockSolution } from "@/components/UnlockSolution";
import { listHomeworkStatus } from "@/lib/homework/queries";
import { itemLabel } from "@/lib/homework/status";
import { listMarkingQueue } from "@/lib/marking/queries";
import { formatPct } from "@/lib/progress/format";
import { listStudentsAtAGlance } from "@/lib/progress/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { lastSeenLabel } from "@/lib/time/uk";

const button =
  "rounded border border-black/20 px-3 py-1 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";
const cell = "px-2 py-1 text-left";

export default async function TeacherHome() {
  const client = await createServerSupabase();
  const [queue, glance, homework] = await Promise.all([
    listMarkingQueue(client),
    listStudentsAtAGlance(client),
    listHomeworkStatus(client, 5),
  ]);
  await connection();
  const now = new Date();

  return (
    <main>
      <h1 className="text-2xl font-semibold">Teacher dashboard</h1>
      <p className="mt-3">
        <Link href="/teacher/lectures" className={button}>
          + Upload lecture
        </Link>
      </p>
      <p className="mt-3">
        <Link href="/teacher/homework/new" className={button}>
          + New homework
        </Link>
      </p>
      <p className="mt-3">
        <Link href="/teacher/students" className="underline">
          Students
        </Link>
      </p>

      <MarkingQueue items={queue} />
      <p className="mt-3">
        <Link href="/teacher/marking" className="underline">
          Open marking queue
        </Link>
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Students at a glance</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Student", "Submitted", "Late", "Missed", "HW avg", "Test avg", "Last login"].map((h) => (
                  <th key={h} scope="col" className={cell}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {glance.map((g) => (
                <tr key={g.studentId} className="border-t border-black/10 dark:border-white/15">
                  <th scope="row" className={`${cell} font-medium`}>
                    {g.displayName}
                  </th>
                  <td className={cell}>{g.progress.submitted}</td>
                  <td className={cell}>{g.progress.late}</td>
                  <td className={cell}>{g.progress.missed}</td>
                  <td className={cell}>{formatPct(g.progress.hwAvgPct)}</td>
                  <td className={cell}>{formatPct(g.progress.testAvgPct)}</td>
                  <td className={cell}>{lastSeenLabel(g.lastSeenAt ? new Date(g.lastSeenAt) : null, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Homework status</h2>
        <ul className="mt-3 flex flex-col gap-4">
          {homework.map((h) => (
            <li key={h.id} className="rounded border border-black/15 p-4 dark:border-white/20">
              <p className="font-medium">
                <Link href={`/teacher/homework/${h.id}`} className="underline">
                  {h.title}
                </Link>
              </p>
              <p className="mt-1 text-sm">
                Due <UkTime at={h.dueAt} teacher />
              </p>
              <p className="mt-1 text-sm">
                {h.students.map((s) => `${s.studentName}: ${itemLabel(s)}`).join(" · ")}
              </p>
              <p className="mt-1 text-sm">Solution: {h.solutionUploaded ? "uploaded" : "not uploaded"}</p>
              <UnlockSolution assignmentId={h.id} unlocked={h.solutionUnlockedForAll} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
