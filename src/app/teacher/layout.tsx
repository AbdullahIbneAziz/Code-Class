import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/accounts/guard";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireTeacher(await createServerSupabase());
  } catch {
    redirect("/");
  }
  return <div className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</div>;
}
