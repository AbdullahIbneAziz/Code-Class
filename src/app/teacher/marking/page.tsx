import { MarkingQueue } from "@/components/MarkingQueue";
import { listMarkingQueue } from "@/lib/marking/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function TeacherMarkingPage() {
  const client = await createServerSupabase();
  return (
    <main>
      <h1 className="text-2xl font-semibold">Marking</h1>
      <MarkingQueue items={await listMarkingQueue(client)} />
    </main>
  );
}
