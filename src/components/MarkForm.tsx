"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMarkAction } from "@/actions/marking";
import { DownloadButton } from "@/components/DownloadButton";
import type { StudentItem } from "@/lib/homework/types";
import { formatMark } from "@/lib/marking/format";
import { useHydrated } from "@/lib/ui/useHydrated";

const field = "rounded border border-black/20 px-2 py-1 dark:border-white/25 dark:bg-transparent";

export function MarkForm({ item }: { item: StudentItem }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [mark, setMark] = useState(item.isMarked && item.mark !== null ? String(item.mark) : "");
  const [feedback, setFeedback] = useState(item.feedback ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Decision 6: fixed at mount; moved to the item's current revision only when Download is clicked.
  const expected = useRef<number>(item.revision ?? 0);
  const latest = useRef<number>(item.revision ?? 0);
  useEffect(() => {
    latest.current = item.revision ?? 0;
  }, [item.revision]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item.submissionId) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await saveMarkAction({
        submissionId: item.submissionId!,
        assignmentId: item.assignmentId,
        expectedRevision: expected.current,
        mark,
        feedback,
      });
      if (r.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(r.message);
        if (r.message.includes("new version")) router.refresh();
      }
    });
  }

  const max = formatMark(item.maxMarks);
  const markLabel = `Mark for ${item.studentName} out of ${max}`;
  return (
    <form noValidate onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
      {item.submissionPath && item.submissionName && (
        <div>
          <DownloadButton
            bucket="submissions"
            objectPath={item.submissionPath}
            downloadName={item.submissionName}
            onDownload={() => {
              expected.current = latest.current;
            }}
          />
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <input
          type="number"
          step="any"
          aria-label={markLabel}
          className={`${field} w-24`}
          value={mark}
          onChange={(e) => setMark(e.target.value)}
        />
        <span>/ {max}</span>
      </div>
      <textarea
        aria-label={`Comment for ${item.studentName}`}
        placeholder="comment…"
        rows={3}
        className={field}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!hydrated || pending}
          className="rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/25 dark:hover:bg-white/10"
        >
          {item.isMarked ? "Update mark" : "Save"}
        </button>
        {saved && !error && (
          <p role="status" className="text-sm">
            Saved.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
