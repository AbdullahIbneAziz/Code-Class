import { listActiveStudents } from "@/lib/homework/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { HomeworkForm } from "../HomeworkForm";

export default async function NewHomeworkPage() {
  const students = await listActiveStudents(await createServerSupabase());
  return (
    <main>
      <h1 className="text-2xl font-semibold">New homework</h1>
      <HomeworkForm mode="create" students={students} />
    </main>
  );
}
