"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteHomeworkAction } from "@/actions/homework";

const btn = "rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";

export function DeleteHomework({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const r = await deleteHomeworkAction(id);
      if (!r.ok) {
        setError(r.message);
        setConfirming(false);
      } else router.push("/teacher/homework");
    });
  }

  return (
    <section className="mt-8">
      {confirming ? (
        <div className="flex gap-2">
          <button type="button" disabled={pending} className={btn} onClick={onDelete}>
            Confirm delete
          </button>
          <button type="button" className={btn} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={btn} onClick={() => setConfirming(true)}>
          Delete homework
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
