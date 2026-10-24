import { createServerSupabase } from "@/lib/supabase/server";
import PasswordForm from "./PasswordForm";

export default async function AccountPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const { data: p } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", auth.user?.id ?? "")
    .maybeSingle();
  return (
    <main className="mx-auto w-full max-w-md p-6">
      <h1 className="text-2xl font-semibold">My account</h1>
      <dl className="mt-4 mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-black/70 dark:text-white/70">Username</dt>
        <dd>{p?.username}</dd>
        <dt className="text-black/70 dark:text-white/70">Name</dt>
        <dd>{p?.display_name}</dd>
      </dl>
      <h2 className="mb-3 text-lg font-medium">Change password</h2>
      <PasswordForm after="stay" />
    </main>
  );
}
