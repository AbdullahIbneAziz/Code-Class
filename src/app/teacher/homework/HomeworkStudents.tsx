"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHomeworkStudentsAction } from "@/actions/homework";

const btn = "rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";

export type StudentOption = { id: string; label: string };

export function HomeworkStudents({
  assignmentId,
  options,
  assignedIds,
}: {
  assignmentId: string;
  options: StudentOption[];
  assignedIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ticked, setTicked] = useState<Set<string>>(new Set(assignedIds));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await setHomeworkStudentsAction(assignmentId, [...ticked]);
      if (!r.ok) setError(r.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} aria-label="Students" className="mt-8">
      <fieldset className="text-sm">
        <legend className="text-lg font-semibold">Students</legend>
        {options.map((o) => (
          <label key={o.id} className="block">
            <input
              type="checkbox"
              checked={ticked.has(o.id)}
              onChange={(e) => {
                const next = new Set(ticked);
                if (e.target.checked) next.add(o.id);
                else next.delete(o.id);
                setTicked(next);
                setSaved(false);
              }}
            />{" "}
            {o.label}
          </label>
        ))}
      </fieldset>
      <div className="mt-2">
        <button type="submit" disabled={pending} className={btn}>
          Save students
        </button>
      </div>
      {saved && (
        <p role="status" className="mt-1 text-sm">
          Students saved.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
