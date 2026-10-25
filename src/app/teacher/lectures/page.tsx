import { listLectures } from "@/lib/lectures/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { LectureCard, UploadLectureForm } from "./LectureForms";

export default async function TeacherLecturesPage() {
  const lectures = await listLectures(await createServerSupabase());
  return (
    <main>
      <h1 className="text-2xl font-semibold">Lectures</h1>
      <h2 className="mt-6 text-lg font-semibold">Upload lecture</h2>
      <UploadLectureForm />
      <div className="mt-8 flex flex-col gap-4">
        {lectures.length === 0 && <p className="text-black/70 dark:text-white/70">No lectures yet.</p>}
        {lectures.map((l) => (
          <LectureCard key={l.id} lecture={l} />
        ))}
      </div>
    </main>
  );
}
