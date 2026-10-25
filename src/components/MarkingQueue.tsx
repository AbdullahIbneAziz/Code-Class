import { MarkForm } from "@/components/MarkForm";
import { UkTime } from "@/components/UkTime";
import type { StudentItem } from "@/lib/homework/types";

export function MarkingQueue({ items }: { items: StudentItem[] }) {
  if (items.length === 0) return <p className="mt-6 text-black/70 dark:text-white/70">Nothing to mark.</p>;
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Needs marking ({items.length})</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {items.map((i) => (
          <li
            key={`${i.assignmentId}:${i.studentId}`}
            aria-label={`${i.title}, ${i.studentName}`}
            className="rounded border border-black/15 p-4 dark:border-white/20"
          >
            <p className="font-medium">
              {i.title}, {i.studentName}
              {i.isLate ? " (late)" : ""}
            </p>
            {i.submittedAt && (
              <p className="mt-1 text-sm">
                Submitted <UkTime at={i.submittedAt} teacher />
              </p>
            )}
            <MarkForm item={i} />
          </li>
        ))}
      </ul>
    </section>
  );
}
