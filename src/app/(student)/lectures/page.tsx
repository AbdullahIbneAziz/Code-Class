import { DownloadButton } from "@/components/DownloadButton";
import { UkTime } from "@/components/UkTime";
import { BUCKET } from "@/lib/files/rules";
import { listLectures } from "@/lib/lectures/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function StudentLecturesPage() {
  const lectures = await listLectures(await createServerSupabase());
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Lectures</h1>
      {lectures.length === 0 && <p className="mt-4 text-black/70 dark:text-white/70">No lectures yet.</p>}
      <div className="mt-4 flex flex-col gap-4">
        {lectures.map((l) => (
          <article key={l.id} aria-label={l.title} className="rounded border border-black/15 p-4 dark:border-white/20">
            <h2 className="text-lg font-semibold">{l.title}</h2>
            {l.description && <p className="mt-1 whitespace-pre-wrap">{l.description}</p>}
            <p className="mt-1 text-sm">
              <UkTime at={l.createdAt} />
            </p>
            <ul className="mt-3">
              {l.files.map((f) => (
                <li key={f.id} className="py-1">
                  <span className="mr-3">{f.originalName}</span>
                  <DownloadButton bucket={BUCKET.lecture} objectPath={f.objectPath} downloadName={f.originalName} />
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </main>
  );
}
