import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DownloadButton } from "@/components/DownloadButton";
import { UkTime } from "@/components/UkTime";
import { markText } from "@/lib/marking/format";
import { BUCKET } from "@/lib/files/rules";
import { getMyItem, listMySolutions, listQuestionFiles } from "@/lib/homework/queries";
import { hasPassed, itemLabel, solutionNotice } from "@/lib/homework/status";
import { SubmitPanel } from "./SubmitPanel";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentHomeworkDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const client = await createServerSupabase();
  const item = await getMyItem(client, id);
  if (!item) notFound(); // hidden, unassigned or unknown: nothing is rendered
  const files = await listQuestionFiles(client, id);
  const solution = (await listMySolutions(client, [id])).get(id) ?? null;
  await connection(); // the clock is read below
  const deadlinePassed = hasPassed(item.effectiveDueAt);
  const notice = solutionNotice({
    available: solution !== null,
    hasSubmission: item.hasSubmission,
    isExcused: item.isExcused,
    unlockedForAll: item.solutionUnlockedForAll,
    deadlinePassed,
  });
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">{item.title}</h1>
      <p className="mt-2 text-sm">
        Due <UkTime at={item.effectiveDueAt} />
      </p>
      <p className="mt-1 text-sm text-black/70 dark:text-white/70">{itemLabel(item)}</p>
      {item.instructions && <p className="mt-4 whitespace-pre-wrap">{item.instructions}</p>}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Questions</h2>
        {files.length === 0 && <p className="mt-2 text-sm text-black/70 dark:text-white/70">No question files.</p>}
        <ul className="mt-2">
          {files.map((f) => (
            <li key={f.id} className="py-1">
              <span className="mr-3">{f.originalName}</span>
              <DownloadButton bucket={BUCKET.question} objectPath={f.objectPath} downloadName={f.originalName} />
            </li>
          ))}
        </ul>
      </section>
      {item.isMarked && item.mark !== null && (
        <section id="your-mark" className="mt-6" aria-labelledby="your-mark-heading">
          <h2 id="your-mark-heading" className="text-lg font-semibold">
            Your mark
          </h2>
          <p className="mt-2 text-2xl font-semibold">{markText(item.mark, item.maxMarks)}</p>
          {item.markedAt && (
            <p className="mt-1 text-sm text-black/70 dark:text-white/70">
              Marked <UkTime at={item.markedAt} />
            </p>
          )}
          {item.feedback && (
            <>
              <h3 className="mt-4 font-semibold">Teacher&apos;s comment</h3>
              <p className="mt-1 whitespace-pre-wrap">{item.feedback}</p>
            </>
          )}
        </section>
      )}
      <SubmitPanel item={item} deadlinePassed={deadlinePassed} />
      <section id="solution" className="mt-6" aria-labelledby="solution-heading">
        <h2 id="solution-heading" className="text-lg font-semibold">
          Solution
        </h2>
        {solution ? (
          <p className="mt-2">
            <span className="mr-3">{solution.originalName}</span>
            <DownloadButton
              bucket={BUCKET.solution}
              objectPath={solution.objectPath}
              downloadName={solution.originalName}
              label="Download solution"
            />
          </p>
        ) : (
          <p className="mt-2 text-sm text-black/70 dark:text-white/70">{notice}</p>
        )}
      </section>
    </main>
  );
}
