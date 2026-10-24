import { createServerSupabase } from "@/lib/supabase/server";
import { AddStudentForm, RowActions } from "./StudentForms";

const UK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function StudentsPage() {
  const supabase = await createServerSupabase();
  const { data: students } = await supabase
    .from("profiles")
    .select("id, username, display_name, is_active, last_seen_at")
    .eq("role", "student")
    .order("username");

  return (
    <main>
      <h1 className="text-2xl font-semibold">Students</h1>
      <AddStudentForm />
      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-black/10 dark:border-white/15">
            <th className="py-2">Username</th>
            <th>Display name</th>
            <th>Active</th>
            <th>Last login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(students ?? []).map((s) => (
            <tr key={s.id} className="border-b border-black/10 align-top dark:border-white/15">
              <td className="py-2">{s.username}</td>
              <td>{s.display_name}</td>
              <td>{s.is_active ? "Yes" : "No"}</td>
              <td>{s.last_seen_at ? UK.format(new Date(s.last_seen_at)) : "Never"}</td>
              <td className="py-2">
                <RowActions id={s.id} username={s.username ?? ""} active={s.is_active} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
