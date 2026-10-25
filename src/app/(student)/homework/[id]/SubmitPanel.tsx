"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useHydrated } from "@/lib/ui/useHydrated";
import { DownloadButton } from "@/components/DownloadButton";
import { UkTime } from "@/components/UkTime";
import { uploadAndFinalize } from "@/lib/files/submit";
import { BUCKET } from "@/lib/files/rules";
import { statusLabel } from "@/lib/homework/status";
import type { StudentItem } from "@/lib/homework/types";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/**
 * `deadlinePassed` is computed on the server at request time. It only hides the input after a
 * refresh; the database is what actually refuses a late replacement.
 */
export function SubmitPanel({ item, deadlinePassed = false }: { item: StudentItem; deadlinePassed?: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, startTransition] = useTransition();

  const onTimeLocked = item.hasSubmission && !item.isLate && deadlinePassed;
  const locked = item.isMarked || onTimeLocked;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read from the input itself so a file chosen before hydration is not lost.
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await uploadAndFinalize(createBrowserSupabase(), {
        assignmentId: item.assignmentId,
        studentId: item.studentId,
        file,
        onProgress: setProgress,
      });
      setProgress(null);
      if (!r.ok) {
        setError(r.message); // the chosen file stays selected
        router.refresh(); // the refusal may mean the item changed (e.g. just marked)
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <section className="mt-6" aria-labelledby="your-work">
      <h2 id="your-work" className="text-lg font-semibold">
        Your work
      </h2>
      {item.hasSubmission && item.submittedAt && item.submissionPath && item.submissionName && (
        <div className="mt-2 text-sm">
          <p>
            Submitted <UkTime at={item.submittedAt} />
          </p>
          <p>{statusLabel(item)}</p>
          <p className="mt-1">
            <span className="mr-3">{item.submissionName}</span>
            <DownloadButton bucket={BUCKET.submission} objectPath={item.submissionPath} downloadName={item.submissionName} />
          </p>
          {!locked && (
            <p className="mt-1 text-black/70 dark:text-white/70">You can replace your file until your teacher marks it.</p>
          )}
        </div>
      )}
      {item.isExcused ? (
        <p className="mt-2 text-sm">You&apos;ve been excused from this homework. It doesn&apos;t count.</p>
      ) : item.isMarked ? (
        <p className="mt-2 text-sm">Marked. Your file is locked.</p>
      ) : onTimeLocked ? (
        <p className="mt-2 text-sm">Your on-time submission is locked because the deadline has passed.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
          <label className="text-sm" htmlFor="submission-file">
            Choose your notebook (.ipynb or .py)
          </label>
          <input
            id="submission-file"
            ref={inputRef}
            type="file"
            onChange={() => {
              setError(null);
            }}
          />
          <div>
            <button
              type="submit"
              disabled={!hydrated || busy}
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {busy ? "Uploading…" : "Upload"}
            </button>
            {busy && progress !== null && progress < 1 && (
              <span className="ml-3 text-sm">{Math.round(progress * 100)}%</span>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
