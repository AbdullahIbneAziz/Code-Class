import { notFound } from "next/navigation";
import { UkTime } from "@/components/UkTime";
import { getHomeworkForTeacher, listActiveStudents } from "@/lib/homework/queries";
import { statusLabel } from "@/lib/homework/status";
import { createServerSupabase } from "@/lib/supabase/server";
import { toUkInputParts } from "@/lib/time/uk";
import { DeleteHomework } from "../DeleteHomework";
import { HomeworkFiles } from "../HomeworkFiles";
import { HomeworkForm } from "../HomeworkForm";
import { HomeworkSolution } from "../HomeworkSolution";
import { HomeworkStudents } from "../HomeworkStudents";
import { UnlockSolution } from "@/components/UnlockSolution";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditHomeworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upload?: string }>;
}) {
  const { id } = await params;
  const { upload } = await searchParams;
  if (!UUID.test(id)) notFound();
  const client = await createServerSupabase();
  const hw = await getHomeworkForTeacher(client, id);
  if (!hw) notFound();
  const active = await listActiveStudents(client);

  const activeIds = new Set(active.map((s) => s.id));
  const options = [
    ...active.map((s) => ({ id: s.id, label: `${s.displayName} (${s.username})` })),
    ...hw.students.filter((s) => !activeIds.has(s.studentId)).map((s) => ({ id: s.studentId, label: `${s.studentName} (inactive)` })),
  ];

  return (
    <main>
      <h1 className="text-2xl font-semibold">Edit homework</h1>
      <p className="mt-1 text-sm">
        Deadline: <UkTime at={hw.dueAt} teacher />
      </p>
      {upload === "failed" && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          The homework was saved, but a file didn&apos;t upload. Add it again below.
        </p>
      )}
      <HomeworkForm
        mode="edit"
        id={hw.id}
        title={hw.title}
        instructions={hw.instructions ?? ""}
        maxMarks={hw.maxMarks}
        visibleFrom={toUkInputParts(new Date(hw.visibleFrom))}
        due={toUkInputParts(new Date(hw.dueAt))}
        isVisible={hw.isVisible}
      />
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Student status</h2>
        <ul className="mt-2 text-sm">
          {hw.students.map((s) => (
            <li key={s.studentId}>
              {s.studentName}: {statusLabel(s)}
            </li>
          ))}
        </ul>
      </section>
      <HomeworkFiles assignmentId={hw.id} files={hw.files} anySubmission={hw.anySubmission} />
      <HomeworkSolution assignmentId={hw.id} solution={hw.solution} />
      <UnlockSolution assignmentId={hw.id} unlocked={hw.solutionUnlockedForAll} />
      <HomeworkStudents assignmentId={hw.id} options={options} assignedIds={hw.students.map((s) => s.studentId)} />
      <DeleteHomework id={hw.id} />
    </main>
  );
}
