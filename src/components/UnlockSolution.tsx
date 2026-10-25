"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockSolutionForAllAction } from "@/actions/homework";
import { useHydrated } from "@/lib/ui/useHydrated";

const btn = "rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";

export function UnlockSolution({ assignmentId, unlocked }: { assignmentId: string; unlocked: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await unlockSolutionForAllAction(assignmentId);
      if (!r.ok) setError(r.message);
      else router.refresh();
      setConfirming(false);
    });
  }

  return (
    <section className="mt-4">
      {unlocked ? (
        <p className="text-sm">Unlocked for everyone. Each student still waits for their own deadline.</p>
      ) : confirming ? (
        <div>
          <p className="text-sm">
            Students who didn&apos;t submit will also see the solution, but only after their own deadline. This can&apos;t be
            undone.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={!hydrated || pending} className={btn} onClick={onConfirm}>
              Confirm unlock
            </button>
            <button type="button" disabled={pending} className={btn} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!hydrated} className={btn} onClick={() => setConfirming(true)}>
          Unlock solution for everyone
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
