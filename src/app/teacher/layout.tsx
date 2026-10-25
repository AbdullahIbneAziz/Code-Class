import { redirect } from "next/navigation";
import { NotTeacherError, requireTeacher } from "@/lib/accounts/guard";
import { NavBar } from "@/components/NavBar";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireTeacher(await createServerSupabase());
  } catch (e) {
    if (e instanceof NotTeacherError) redirect("/");
    throw e;
  }
  return (
    <>
      <NavBar
        links={[
          { href: "/teacher", label: "Dashboard" },
          { href: "/teacher/lectures", label: "Lectures" },
          { href: "/teacher/homework", label: "Homework" },
          { href: "/teacher/students", label: "Students" },
        ]}
      />
      <div className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</div>
    </>
  );
}
