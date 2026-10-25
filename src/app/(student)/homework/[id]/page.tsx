import { notFound } from "next/navigation";
import { DownloadButton } from "@/components/DownloadButton";
import { UkTime } from "@/components/UkTime";
import { BUCKET } from "@/lib/files/rules";
import { getMyItem, listQuestionFiles } from "@/lib/homework/queries";
import { hasPassed, statusLabel } from "@/lib/homework/status";
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
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">{item.title}</h1>
      <p className="mt-2 text-sm">
        Due <UkTime at={item.effectiveDueAt} />
      </p>
      <p className="mt-1 text-sm text-black/70 dark:text-white/70">{statusLabel(item)}</p>
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
      <SubmitPanel item={item} deadlinePassed={hasPassed(item.effectiveDueAt)} />
    </main>
  );
}
