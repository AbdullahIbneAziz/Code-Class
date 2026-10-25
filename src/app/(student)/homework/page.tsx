import Link from "next/link";
import { connection } from "next/server";
import { listMyItems } from "@/lib/homework/queries";
import { statusLabel } from "@/lib/homework/status";
import { createServerSupabase } from "@/lib/supabase/server";
import { dueLabel } from "@/lib/time/uk";

export default async function StudentHomeworkPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active = tab === "submitted" ? "submitted" : "pending";
  const items = await listMyItems(await createServerSupabase());
  await connection(); // request time: the clock below must not be prerendered
  const now = new Date();
  const shown = items.filter((i) =>
    active === "pending" ? i.actionState === "pending" || i.actionState === "missed" : i.actionState === "done",
  );
  const tabs = [
    { key: "pending", label: "Pending" },
    { key: "submitted", label: "Submitted" },
  ];
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Homework</h1>
      <nav aria-label="Homework tabs" className="mt-4 flex gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/homework?tab=${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={`rounded px-3 py-1 text-sm ${active === t.key ? "bg-black text-white dark:bg-white dark:text-black" : "border border-black/20 dark:border-white/25"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {shown.length === 0 && active === "pending" && (
        <p className="mt-4 text-black/70 dark:text-white/70">Nothing to do right now.</p>
      )}
      {shown.length === 0 && active === "submitted" && (
        <p className="mt-4 text-black/70 dark:text-white/70">Nothing submitted yet.</p>
      )}
      <ul className="mt-4 flex flex-col gap-3">
        {shown.map((i) => (
          <li key={i.assignmentId}>
            <Link
              href={`/homework/${i.assignmentId}`}
              className="block rounded border border-black/15 p-4 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              <span className="block text-lg font-semibold">{i.title}</span>
              <span className="block text-sm">
                {i.actionState === "missed" ? "LATE, " : ""}
                {dueLabel(new Date(i.effectiveDueAt), now)}
              </span>
              <span className="block text-sm text-black/70 dark:text-white/70">{statusLabel(i)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
